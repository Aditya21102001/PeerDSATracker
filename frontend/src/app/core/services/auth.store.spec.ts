import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';

/**
 * The access token lives in memory, the refresh token in localStorage. After a reload
 * the guard sees a refresh token and lets the page render -- so the session must be
 * restored *before* the first route fires its requests, or every one of them 401s.
 */
describe('AuthStore.restoreSession', () => {
  let store: AuthStore;
  let tokens: TokenService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const build = () => {
    store = TestBed.inject(AuthStore);
    tokens = TestBed.inject(TokenService);
    http = TestBed.inject(HttpTestingController);
  };

  it('does nothing when there is no refresh token', async () => {
    build();
    await store.restoreSession().forEach(() => {});

    http.expectNone('/api/auth/refresh');
    expect(tokens.accessToken()).toBeNull();
  });

  it('exchanges a surviving refresh token for an access token', async () => {
    localStorage.setItem('peerdsa.refreshToken', 'stored-refresh');
    build();

    const done = store.restoreSession().forEach(() => {});
    http.expectOne('/api/auth/refresh').flush({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
      expiresInSeconds: 900,
    });
    await done;

    expect(tokens.accessToken()).toBe('fresh-access');
    expect(tokens.refreshToken()).toBe('rotated-refresh');
  });

  it('clears a dead refresh token instead of letting the page load and fail', async () => {
    localStorage.setItem('peerdsa.refreshToken', 'revoked');
    build();

    const done = store.restoreSession().forEach(() => {});
    http.expectOne('/api/auth/refresh').flush('nope', { status: 401, statusText: 'Unauthorized' });
    await done;

    // The guard reads the refresh token; leaving it would send the user to a page that 401s.
    expect(tokens.refreshToken()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('skips the exchange when an access token is already held', async () => {
    localStorage.setItem('peerdsa.refreshToken', 'stored-refresh');
    build();
    tokens.set({ accessToken: 'already-here', refreshToken: 'stored-refresh', expiresInSeconds: 900 });

    await store.restoreSession().forEach(() => {});

    http.expectNone('/api/auth/refresh');
  });
});
