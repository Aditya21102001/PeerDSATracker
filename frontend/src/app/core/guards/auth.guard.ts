import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../services/auth.store';

/**
 * Gates authenticated routes. Sends unauthenticated visitors to /signin, preserving the
 * attempted URL as a `redirect` query param so they can be returned there after signing in.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/signin'], { queryParams: { redirect: state.url } });
};

/** Keeps signed-in users off /signin and /signup. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
