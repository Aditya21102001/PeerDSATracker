import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../services/auth.store';
import { TokenService } from '../services/token.service';

/** Endpoints that must never carry a bearer token nor trigger a refresh. */
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/signup', '/api/auth/refresh'];

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

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
