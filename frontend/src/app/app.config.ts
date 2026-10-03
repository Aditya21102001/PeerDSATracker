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

    // Wake up the backend on Render immediately behind the scenes and restore session in the
    // background, so the application bootstraps and renders public content instantly (<50ms)
    // without blocking on cold-start delays.
    provideAppInitializer(() => {
      inject(BackendStatus).probe();
      inject(AuthStore).restoreSession().subscribe();
    }),
  ],
};
