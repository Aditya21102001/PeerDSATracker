import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthStore } from './core/services/auth.store';
import { routes } from './app.routes';

/**
 * Application-wide providers wired up at bootstrap: the router (with component input
 * binding), the HTTP client behind the auth interceptor, and the pre-route session restore.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),

    // Exchange the surviving refresh token for an access token before the first route
    // renders. Otherwise every request on the landing page fires unauthenticated.
    provideAppInitializer(() => firstValueFrom(inject(AuthStore).restoreSession())),
  ],
};
