import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { coldStartInterceptor } from './core/interceptors/cold-start.interceptor';
import { AuthStore } from './core/services/auth.store';
import { BackendStatus } from './core/services/backend-status';
import { routes } from './app.routes';

/**
 * Application-wide providers wired up at bootstrap: the router (with component input
 * binding), the HTTP client behind the auth interceptor, and the pre-route session restore.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Order matters: coldStartInterceptor is outermost, so its retry re-runs authInterceptor and
    // the repeated attempt picks up a token refreshed in the meantime. Reversed, a retry would
    // resend the original request with the stale token it already failed on.
    provideHttpClient(withInterceptors([coldStartInterceptor, authInterceptor])),

    // Ask the backend what it is and whether it is up, without waiting for the answer. On a cold
    // start this fails within seconds and puts the notice on screen, instead of the user finding
    // out one broken panel at a time -- and the failed attempt still starts Render's container,
    // so it is also the beginning of the wake-up. Never awaited: a backend that is down must
    // still render a usable page.
    provideAppInitializer(() => inject(BackendStatus).probe()),

    // Exchange the surviving refresh token for an access token before the first route
    // renders. Otherwise every request on the landing page fires unauthenticated.
    provideAppInitializer(() => firstValueFrom(inject(AuthStore).restoreSession())),
  ],
};
