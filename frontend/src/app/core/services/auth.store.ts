import { HttpBackend, HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { ChangePasswordResponse, Me, OtpRequestResponse, TokenResponse } from '../models/api.models';
import { LastSignInService } from './last-sign-in.service';
import { TokenService } from './token.service';

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
        if (!this.tokens.accessToken()) {
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
