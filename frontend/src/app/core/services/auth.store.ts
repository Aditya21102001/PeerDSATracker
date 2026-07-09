import { HttpBackend, HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { Me, TokenResponse } from '../models/api.models';
import { TokenService } from './token.service';

@Service()
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
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

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>('/api/auth/login', { email, password })
      .pipe(tap((t) => this.tokens.set(t)));
  }

  loadMe(): Observable<Me> {
    return this.http.get<Me>('/api/auth/me').pipe(tap((me) => this.user.set(me)));
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
