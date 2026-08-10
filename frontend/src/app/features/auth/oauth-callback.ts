import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-oauth-callback',
  imports: [RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      @if (error()) {
        <h1>Couldn't sign you in</h1>
        <p class="error" role="alert">{{ error() }}</p>
        <p class="foot"><a routerLink="/signin">Back to sign in</a></p>
      } @else {
        <h1>Signing you in…</h1>
        <p class="tagline" role="status">One moment.</p>
      }
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Where the backend sends the browser after a Google sign-in, successful or not.
 *
 * Both outcomes land here, which is the whole reason this route exists: letting a refusal surface
 * as the backend's own error page would show a stack-trace-shaped page on a different domain to
 * someone who clicked a button on ours. It reads as a crash, and there is no way back.
 *
 * The payload arrives in the URL *fragment*, never the query string. A fragment is not sent to any
 * server, so it stays out of access logs, out of the proxy in front of them, and out of the
 * Referer of whatever loads next. Only the refresh token is passed; it is spent immediately for an
 * access token, so by the time this screen resolves the value that sat in the address bar has
 * already been rotated away.
 */
export class OauthCallback {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);

  constructor() {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const failure = fragment.get('error');
    if (failure) {
      this.clearFragment();
      this.error.set(failure);
      return;
    }

    const token = fragment.get('token');
    if (!token) {
      this.error.set('That sign-in link was incomplete. Please try again.');
      return;
    }

    // Drop the token from the address bar before anything else, so a copied URL or a browser
    // history entry cannot carry it. The value is already held in memory by this point.
    this.clearFragment();

    this.auth.adoptRefreshToken(token).subscribe({
      // Straight to the dashboard. Signing in is not the moment to interrupt somebody with a
      // form -- a provisioned username is shown on the Account page, where it can be changed
      // whenever they care to. An earlier version routed to a "pick a username" step here, and
      // it also had a latent bug: `usernameChosen` being absent for any reason is falsy, so
      // every user got the prompt rather than only newly provisioned ones.
      next: () => void this.router.navigate(['/dashboard']),
      error: () =>
        this.error.set('That sign-in link has already been used or expired. Please try again.'),
    });
  }

  /** replaceState, not assignment: assigning to location.hash would add a history entry. */
  private clearFragment(): void {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
