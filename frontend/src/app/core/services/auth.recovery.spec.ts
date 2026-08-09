import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';

/**
 * The recovery paths: signing in by username or email, redeeming a one-time code, and setting a
 * password afterwards.
 *
 * These pin the wire format rather than the UI, because the wire format is where the mistakes are
 * silent. Posting `{ email }` to a backend expecting `{ identifier }` fails as "invalid username or
 * password" — indistinguishable from a genuinely wrong password, and impossible to diagnose from
 * the screen.
 */
describe('AuthStore recovery flows', () => {
  let store: AuthStore;
  let tokens: TokenService;
  let http: HttpTestingController;

  const TOKENS = { accessToken: 'access', refreshToken: 'refresh', expiresInSeconds: 900 };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(AuthStore);
    tokens = TestBed.inject(TokenService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('posts the sign-in field as `identifier`, not `email`', () => {
    store.login('aditya', 'Passw0rd!').subscribe();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ identifier: 'aditya', password: 'Passw0rd!' });
    request.flush(TOKENS);
  });

  it('sends an email address through the same field', () => {
    store.login('aditya@example.com', 'Passw0rd!').subscribe();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.body.identifier).toBe('aditya@example.com');
    request.flush(TOKENS);
  });

  it('stores the session returned by a code verification', () => {
    store.verifyCode('a@b.com', '123456').subscribe();

    const request = http.expectOne('/api/auth/otp/verify');
    expect(request.request.body).toEqual({ email: 'a@b.com', code: '123456' });
    request.flush(TOKENS);

    expect(tokens.accessToken()).toBe('access');
  });

  /**
   * The set-a-password step after a code sign-in sends no proof at all: the session's own token
   * carries the backend's `vbc` claim. Sending an empty string instead of null would be read as an
   * offered-and-wrong current password.
   */
  it('sends no proof when the session itself is the proof', () => {
    store.setPassword('a-brand-new-password').subscribe();

    const request = http.expectOne('/api/auth/change-password');
    expect(request.request.body).toEqual({
      newPassword: 'a-brand-new-password',
      currentPassword: null,
      code: null,
    });
    request.flush({ username: 'aditya', tokens: TOKENS });
  });

  it('sends a one-time code as proof when one is given', () => {
    store.setPassword('a-brand-new-password', { code: '123456' }).subscribe();

    const request = http.expectOne('/api/auth/change-password');
    expect(request.request.body.code).toBe('123456');
    expect(request.request.body.currentPassword).toBeNull();
    request.flush({ username: 'aditya', tokens: TOKENS });
  });

  /**
   * A password change revokes every refresh token, including the caller's. If the replacement pair
   * is not stored, the very next request 401s and the user is signed out in the middle of a
   * recovery — having just, correctly, set a password.
   */
  it('adopts the replacement session a password change hands back', () => {
    tokens.set({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresInSeconds: 900 });

    store.setPassword('a-brand-new-password', { currentPassword: 'old' }).subscribe();
    http.expectOne('/api/auth/change-password').flush({
      username: 'aditya',
      tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresInSeconds: 900 },
    });

    expect(tokens.accessToken()).toBe('new-access');
    expect(tokens.refreshToken()).toBe('new-refresh');
  });

  /**
   * The OAuth2 callback hands over only a refresh token, in the URL fragment. Spending it straight
   * away rotates it, so the value that briefly sat in the address bar is dead by the time the page
   * settles.
   */
  it('exchanges an OAuth refresh token for a session immediately', () => {
    store.adoptRefreshToken('from-the-url-fragment').subscribe();

    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'from-the-url-fragment' });
    refresh.flush({ accessToken: 'access', refreshToken: 'rotated', expiresInSeconds: 900 });

    http.expectOne('/api/auth/me').flush({ id: 1, email: 'a@b.com', username: 'a', hasPassword: false });

    // Rotated, so the token from the URL is no longer the one held.
    expect(tokens.refreshToken()).toBe('rotated');
  });
});
