import { HttpBackend, HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, retry, shareReplay, switchMap, tap, throwError, timer } from 'rxjs';
import { isBackendUnavailable } from '../http/backend-unavailable';
import { ChangePasswordResponse, Me, OtpRequestResponse, TokenResponse } from '../models/api.models';
import { BackendStatus } from './backend-status';
import { LastSignInService } from './last-sign-in.service';
import { TokenService } from './token.service';

/**
 * Attempts beyond the first for a refresh that could not reach the backend. Spans about 40 seconds,
 * which is a cold Render instance booting a JVM on 0.1 CPU. Past that the notice is up and the user
 * decides, rather than the app holding a session-restore open indefinitely.
 */
const REFRESH_COLD_START_RETRIES = 3;
const REFRESH_BACKOFF_MS = [3_000, 10_000, 25_000];

/**
 * The session: who is signed in, and how requests get a valid access token.
 *
 * Two rules make the whole scheme work, and both are easy to break:
 * refresh is single-flight (see {@link AuthStore.refreshOnce}), and it bypasses the
 * interceptor chain. Losing either turns a normal page load into a session-killing
 * refresh-token-reuse report from the backend.
 */
@Service()
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly lastSignIn = inject(LastSignInService);
  private readonly router = inject(Router);
  private readonly backend = inject(BackendStatus);

  /**
   * Refresh must bypass the interceptor chain, otherwise a 401 on /auth/refresh
   * would recurse back into refresh.
   */
  private readonly rawHttp = new HttpClient(inject(HttpBackend));

  /** Single-flight guard: concurrent 401s share one refresh request. */
  private inFlightRefresh: Observable<string> | null = null;

  private readonly user = signal<Me | null>(null);
  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.tokens.refreshToken() !== null);

  signup(email: string, username: string, password: string): Observable<Me> {
    return this.http.post<TokenResponse>('/api/auth/signup', { email, username, password }).pipe(
      tap((t) => this.tokens.set(t)),
      switchMap(() => this.loadMe()),
    );
  }

  /**
   * `identifier` is a username *or* an email — the backend tries username first. Both have to
   * work: recovery is keyed by email while sign-in is keyed by username, and an account created
   * through Google has a generated username its owner has never seen.
   */
  login(identifier: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/api/auth/login', { identifier, password }).pipe(
      tap((t) => {
        this.tokens.set(t);
        this.lastSignIn.remember('password');
      }),
      // Load the profile now, so the header can name the account on the very first page.
      switchMap((t) => this.loadMe().pipe(map(() => t))),
    );
  }

  /**
   * Asks for a one-time code. Answers 202 whether or not the address is registered, so the screen
   * must show the same confirmation either way — anything else reveals which addresses have
   * accounts.
   */
  requestCode(email: string): Observable<OtpRequestResponse> {
    return this.http.post<OtpRequestResponse>('/api/auth/otp/request', { email });
  }

  /**
   * Redeems a code. The token this stores carries the backend's `vbc` claim for a few minutes,
   * which is what lets {@link setPassword} work with no current password — so the caller must send
   * the user straight to the set-a-password step rather than to the dashboard.
   */
  verifyCode(email: string, code: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/api/auth/otp/verify', { email, code }).pipe(
      tap((t) => {
        this.tokens.set(t);
        this.lastSignIn.remember('code');
      }),
      switchMap((t) => this.loadMe().pipe(map(() => t))),
    );
  }

  /**
   * Sets a new password, given one of three proofs: nothing at all if the current session came
   * from a code sign-in minutes ago, otherwise a fresh code or the current password.
   *
   * The change revokes every other session, so the response carries replacement tokens for this
   * one — store them, or the next request 401s and signs the user out mid-recovery.
   */
  setPassword(newPassword: string, proof: { currentPassword?: string; code?: string } = {}) {
    return this.http
      .post<ChangePasswordResponse>('/api/auth/change-password', {
        newPassword,
        currentPassword: proof.currentPassword ?? null,
        code: proof.code ?? null,
      })
      .pipe(tap((r) => this.tokens.set(r.tokens)));
  }

  /**
   * Completes a Google sign-in. The backend redirects to /oauth/callback with only the refresh
   * token in the URL fragment — a fragment never reaches a server, so it stays out of access logs
   * and Referer headers. Spending it immediately for an access token also rotates it, so the value
   * that briefly sat in the address bar is dead by the time the page settles.
   */
  adoptRefreshToken(refreshToken: string): Observable<Me> {
    this.tokens.setRefreshToken(refreshToken);
    // Only Google reaches this method; the OAuth callback is its sole caller.
    this.lastSignIn.remember('google');
    return this.refreshOnce().pipe(switchMap(() => this.loadMe()));
  }

  /** Claims a username for an account that was provisioned one. See ChooseUsername. */
  chooseUsername(username: string): Observable<Me> {
    return this.http
      .post<Me>('/api/auth/username', { username })
      .pipe(tap((me) => this.user.set(me)));
  }

  loadMe(): Observable<Me> {
    return this.http.get<Me>('/api/auth/me').pipe(tap((me) => this.user.set(me)));
  }

  /**
   * Runs once, before the first route renders.
   *
   * The access token is deliberately kept in memory, so a reload loses it while the
   * refresh token survives in localStorage. Without this, `authGuard` waves the user
   * through and the first page fires every one of its requests unauthenticated -- six
   * 401s on the dashboard -- before the interceptor notices and refreshes.
   *
   * A dead refresh token means the session is over: clear it so the guard redirects to
   * /signin instead of letting a page load and fail.
   */
  restoreSession(): Observable<unknown> {
    if (!this.tokens.refreshToken()) {
      return of(null);
    }
    // Already holding an access token (a fresh sign-in, not a reload): just make sure the profile
    // is loaded.
    if (this.tokens.accessToken()) {
      return this.loadMe().pipe(catchError(() => of(null)));
    }
    return this.refreshOnce().pipe(
      // The profile is loaded here, not lazily by whichever page happens to want it. Without it
      // `currentUser()` is null on every page after a reload, which is why nothing in the app
      // could show who was signed in.
      switchMap(() => this.loadMe()),
      catchError((error) => {
        // Only a dead refresh token ends the session. A failed /me is a bad moment for the API,
        // not proof the session is over -- clearing tokens here would sign people out on a blip.
        //
        // A backend that could not be reached at all is the same story, and it is not hypothetical:
        // the instance spins down after 15 minutes idle, so the refresh above is exactly the
        // request that pays for the cold start, and it fails. Clearing tokens on that signed people
        // out of a perfectly valid session every time they came back to a cold app -- which looked
        // like a session-expiry bug and was really a deploy-topology one. The token survives; the
        // notice explains the wait; the next attempt uses it.
        if (!this.tokens.accessToken() && !isBackendUnavailable(error)) {
          this.tokens.clear();
          this.user.set(null);
        }
        return of(null);
      }),
    );
  }

  /**
   * If a refresh is already running, every caller subscribes to that same
   * observable instead of starting another. Without this, N parallel 401s each
   * rotate the refresh token and invalidate one another, and the backend treats
   * the second use as token theft.
   */
  refreshOnce(): Observable<string> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refreshToken = this.tokens.refreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('no refresh token'));
    }

    this.inFlightRefresh = this.rawHttp
      .post<TokenResponse>('/api/auth/refresh', { refreshToken })
      .pipe(
        // Bypassing the interceptors also bypasses coldStartInterceptor, so the cold-start retry
        // has to be repeated here. It has to exist here: on a reload against a spun-down instance
        // this is the FIRST request the app makes, so it is the one that fails, and everything
        // downstream inherits the outcome.
        //
        // A POST is retried here where the interceptor would refuse to, and that is safe for this
        // one endpoint specifically: the attempt that failed never reached the backend, so the
        // refresh token it presented was never rotated. Single-flight is preserved because the
        // retry lives inside the shared observable rather than around it.
        retry({
          count: REFRESH_COLD_START_RETRIES,
          delay: (error, attempt) => {
            if (!isBackendUnavailable(error)) {
              return throwError(() => error);
            }
            this.backend.reportUnavailable();
            return timer(REFRESH_BACKOFF_MS[Math.min(attempt - 1, REFRESH_BACKOFF_MS.length - 1)]);
          },
        }),
        tap((t) => this.tokens.set(t)),
        map((t) => t.accessToken),
        shareReplay({ bufferSize: 1, refCount: false }),
        finalize(() => {
          this.inFlightRefresh = null;
        }),
      );

    return this.inFlightRefresh;
  }

  logout(): void {
    const refreshToken = this.tokens.refreshToken();
    if (refreshToken) {
      this.http.post<void>('/api/auth/logout', { refreshToken }).subscribe({ error: () => {} });
    }
    this.forceSignOut();
  }

  forceSignOut(): void {
    this.tokens.clear();
    this.user.set(null);
    void this.router.navigate(['/signin']);
  }
}
