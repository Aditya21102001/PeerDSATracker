import { HttpBackend, HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, exhaustMap, of, tap, timeout, timer } from 'rxjs';
import { isOffline } from '../http/backend-unavailable';
import { Meta } from '../models/api.models';

/**
 * `unknown`     nothing has answered yet this session.
 * `ready`       the last exchange with the backend succeeded.
 * `warming`     something failed the way a spun-down instance fails; polling for it to come up.
 * `unreachable` still nothing after {@link GIVE_UP_AFTER_MS}. Probably not a cold start.
 * `offline`     the browser says there is no network, so nothing is worth blaming on the server.
 */
export type BackendState = 'unknown' | 'ready' | 'warming' | 'unreachable' | 'offline';

/**
 * Per probe. Deliberately short: the point of a probe is a quick yes-or-no, not to sit in the one
 * request that eventually succeeds. Vercel's edge gives up on the rewrite long before a cold
 * instance finishes booting anyway, so a long client timeout buys nothing.
 */
const PROBE_TIMEOUT_MS = 5_000;

/** Between probes. Above the timeout, so a slow probe is not immediately superseded. */
const POLL_INTERVAL_MS = 6_000;

/**
 * When to stop calling it a cold start.
 *
 * A free Render instance plus a JVM on 0.1 CPU with the optimizing JIT switched off is tens of
 * seconds, and Neon's compute has to wake underneath it. Two and a half minutes is generous for
 * that and still short enough that a genuinely broken deploy stops being described as "waking up",
 * which would be a lie that wastes the user's time.
 */
const GIVE_UP_AFTER_MS = 150_000;

/**
 * Whether the backend is answering, and what is deployed on it.
 *
 * Exists because the backend runs on Render's free plan, which spins the instance down after 15
 * minutes of inactivity. The next request pays for a full boot, and the browser does not get to
 * wait for it: the SPA reaches the backend through Vercel's `/api/*` rewrite, whose edge proxy
 * times out well before a cold JVM is listening. So the first requests after an idle period do not
 * merely feel slow, they fail -- and the honest thing to do is say so and keep trying, rather than
 * render six broken panels.
 *
 * Probing is what wakes it. Render starts the container on any inbound request, even one the
 * client has already given up on, so each failed probe is still progress.
 *
 * The probe uses {@link HttpBackend} directly, bypassing every interceptor. The cold-start
 * interceptor reports failures *to* this service; routing the probe back through it would have the
 * probe report on itself.
 */
@Service()
export class BackendStatus {
  private readonly raw = new HttpClient(inject(HttpBackend));

  private readonly state = signal<BackendState>('unknown');
  private readonly info = signal<Meta | null>(null);
  private readonly startedWarmingAt = signal<number | null>(null);

  /** What is deployed, once something has answered. Null until then. */
  readonly meta = this.info.asReadonly();
  readonly current = this.state.asReadonly();

  /** Show the notice: the backend is not answering and it is worth telling somebody. */
  readonly troubled = computed(() => this.state() !== 'ready' && this.state() !== 'unknown');

  private poll: Subscription | null = null;

  /**
   * One probe at startup, before anything has failed.
   *
   * This is the whole trick: on a cold backend it fails in a few seconds and the notice is up
   * while the instance boots, instead of the user discovering the problem one broken panel at a
   * time. It also collects the version for the footer, and it starts the boot early enough that
   * the requests behind it may find the instance already up.
   *
   * Must never block bootstrap -- a backend that is down should still render a usable page.
   */
  probe(): void {
    this.fetchMeta().subscribe((meta) => {
      if (!meta) {
        this.reportUnavailable();
      }
    });
  }

  /**
   * Something reached the backend. Ends a warming state immediately, whatever the probe cycle is
   * doing -- a real request succeeding is better evidence than the next poll would be.
   */
  reportReachable(): void {
    this.stopPolling();
    this.startedWarmingAt.set(null);
    this.state.set('ready');
  }

  /**
   * A request failed in a way only an absent backend explains. Starts (or continues) polling.
   *
   * Idempotent by design: every failed request on a cold-started page calls this, and they must
   * share one poll cycle rather than each starting their own.
   */
  reportUnavailable(): void {
    if (isOffline()) {
      this.stopPolling();
      this.state.set('offline');
      return;
    }
    if (this.poll) {
      return;
    }
    this.startedWarmingAt.set(Date.now());
    this.state.set('warming');
    // A request has just failed, so there is nothing to learn from probing this instant.
    this.startPolling(POLL_INTERVAL_MS);
  }

  /** The notice's retry button, and what an `unreachable` state needs to escape. */
  retryNow(): void {
    this.stopPolling();
    this.startedWarmingAt.set(Date.now());
    this.state.set('warming');
    // Pressed by a person, so it has to do something visible now rather than on the next tick.
    this.startPolling(0);
  }

  private startPolling(firstProbeDelayMs: number): void {
    this.poll = timer(firstProbeDelayMs, POLL_INTERVAL_MS)
      // exhaustMap, not switchMap: a probe still in flight must be left alone rather than
      // cancelled and restarted, or a backend that answers in 7s is never given 7s.
      .pipe(exhaustMap(() => this.fetchMeta()))
      .subscribe((meta) => {
        if (meta) {
          this.reportReachable();
          return;
        }
        const since = this.startedWarmingAt();
        if (since !== null && Date.now() - since > GIVE_UP_AFTER_MS) {
          this.stopPolling();
          this.state.set('unreachable');
        }
      });
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = null;
  }

  /** Null on any failure: callers branch on presence, never on an error channel. */
  private fetchMeta(): Observable<Meta | null> {
    return this.raw.get<Meta>('/api/meta').pipe(
      timeout(PROBE_TIMEOUT_MS),
      tap((meta) => this.info.set(meta)),
      catchError(() => of(null)),
    );
  }
}
