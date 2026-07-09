import { Service, signal } from '@angular/core';
import { TokenResponse } from '../models/api.models';

const REFRESH_KEY = 'peerdsa.refreshToken';

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

  clear(): void {
    this.access.set(null);
    this.refresh.set(null);
    localStorage.removeItem(REFRESH_KEY);
  }
}
