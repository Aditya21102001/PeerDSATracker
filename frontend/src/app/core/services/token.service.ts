import { Service, signal } from '@angular/core';
import { TokenResponse } from '../models/api.models';

const REFRESH_KEY = 'peerdsa.refreshToken';

/** The only place tokens are stored. Nothing else may read or write `localStorage` for auth. */
@Service()
export class TokenService {
  /**
   * The access token stays in memory only: it is short-lived and keeping it out
   * of storage limits what an XSS payload can walk away with. The refresh token
   * has to survive a reload, so it lives in localStorage. Moving it to an
   * httpOnly cookie is the hardening step for Phase 7.
   */
  private readonly access = signal<string | null>(null);
  private readonly refresh = signal<string | null>(localStorage.getItem(REFRESH_KEY));

  readonly accessToken = this.access.asReadonly();
  readonly refreshToken = this.refresh.asReadonly();

  set(tokens: TokenResponse): void {
    this.access.set(tokens.accessToken);
    this.refresh.set(tokens.refreshToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }

  /**
   * Adopts a refresh token with no access token alongside it — the OAuth2 callback's shape, where
   * only the refresh token comes back in the URL fragment. The caller must immediately refresh to
   * obtain an access token; until it does, `accessToken()` is deliberately null and every request
   * takes the interceptor's refresh path.
   */
  setRefreshToken(refreshToken: string): void {
    this.access.set(null);
    this.refresh.set(refreshToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  clear(): void {
    this.access.set(null);
    this.refresh.set(null);
    localStorage.removeItem(REFRESH_KEY);
  }
}
