import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../services/auth.store';
import { TokenService } from '../services/token.service';

/**
 * Endpoints that must never carry a bearer token nor trigger a refresh.
 *
 * The one-time code endpoints belong here for a specific reason: /otp/verify answers 401 for a
 * wrong code. Left off this list, a visitor who still holds a stale refresh token would have that
 * 401 swallowed by a refresh-and-retry, and would see either a spurious sign-out or a confusingly
 * delayed error instead of "that code is not valid".
 *
 * /api/auth/change-password is deliberately NOT here — it resolves the account from the session,
 * so it must carry the token.
 */
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/options',
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
];

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Attaches the access token to outgoing requests and recovers from expiry: a 401 that
 * still has a refresh token funnels into one shared refresh (AuthStore.refreshOnce), then
 * the original request is retried once. A failed refresh forces sign-out.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenService);
  const auth = inject(AuthStore);

  if (PUBLIC_PATHS.some((path) => req.url.includes(path))) {
    return next(req);
  }

  const access = tokens.accessToken();
  const outgoing = access ? withToken(req, access) : req;

  return next(outgoing).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only a 401 is recoverable, and only if we still hold a refresh token.
      if (error.status !== 401 || !tokens.refreshToken()) {
        return throwError(() => error);
      }

      // Concurrent 401s all funnel into the same refresh call.
      return auth.refreshOnce().pipe(
        switchMap((fresh) => next(withToken(req, fresh))),
        catchError((refreshError) => {
          auth.forceSignOut();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
