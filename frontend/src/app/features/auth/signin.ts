import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthOptionsService } from '../../core/services/auth-options.service';
import { AuthStore } from '../../core/services/auth.store';
import { LastSignInService } from '../../core/services/last-sign-in.service';

@Component({
  selector: 'app-signin',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      <header>
        <h1>⚡ The Grind ⚡</h1>
        <p class="tagline">Your missions are waiting.</p>
      </header>

      @if (lastMethod()) {
        <!--
          Answers the question people actually arrive with: "did I make a password here, or did I
          use Google?" Getting it wrong costs a failed attempt whose only feedback is "invalid
          username or password", which says nothing about which credential was wrong.
        -->
        <p class="last-method" role="status">
          Last time on this device you signed in with <strong>{{ lastMethodLabel() }}</strong>.
        </p>
      }

      <dl class="stats">
        <div><dt>474</dt><dd>Problems</dd></div>
        <div><dt>∞</dt><dd>Peers</dd></div>
        <div><dt>0</dt><dd>Excuses</dd></div>
      </dl>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="identifier">Username or email</label>
          <input
            id="identifier"
            type="text"
            formControlName="identifier"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
          @if (showError('identifier')) {
            <p class="field-error" role="alert">Enter your username or email address.</p>
          }
        </div>

        <div class="field">
          <div class="row">
            <label for="password">Password</label>
            <!-- Points at /code, not the older /forgot link-by-email flow, because /code is the
                 one with a working transport. Ungated for the same reason: this is the affordance
                 people actually scan for when they are locked out, so it must never be absent. -->
            <a class="forgot" routerLink="/code">Forgot password?</a>
          </div>
          <input id="password" type="password" formControlName="password" autocomplete="current-password" />
          @if (showError('password')) {
            <p class="field-error" role="alert">Enter your password.</p>
          }
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn" [disabled]="busy()" aria-label="Sign in">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="alt">
        <!-- Same destination as "Forgot password?" above, worded for the other group who need it:
             an account created through Google has no password to have forgotten, so somebody in
             that position would never click a link about forgetting one. -->
        Signed up with Google, or never set a password?
        <a routerLink="/code">Sign in with a code</a>
      </p>

      @if (googleEnabled()) {
        <!-- A plain link, not a fetch: this is a full-page navigation that has to leave the SPA
             and come back, and the backend needs to set its own cookie on the way out. -->
        <a class="btn btn-ghost provider" [href]="googleUrl">
          <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continue with Google</span>
        </a>
      }

      <p class="foot">New here? <a routerLink="/signup" [queryParams]="route.snapshot.queryParams">Join the Force!</a></p>
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Sign-in form, reached only through guestGuard so a signed-in visitor is redirected away.
 *
 * The field takes a username *or* an email. Both have to work: recovery is keyed by email while
 * sign-in is keyed by username, so someone who has just recovered their account by email would
 * otherwise be locked out — and an account created through Google has a generated username its
 * owner has never seen. The backend tries username first, so the label's promise holds even when
 * one person's username is another's email address.
 *
 * On success login() has merely stored the tokens — unlike signup it does not load the profile —
 * and we hand off to /dashboard.
 */
export class Signin {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  private readonly lastSignIn = inject(LastSignInService);
  private readonly options = inject(AuthOptionsService);

  /**
   * Read from this browser, never from the server. An endpoint that answered "that address uses
   * Google" before authentication would be a worse enumeration oracle than any this codebase
   * avoids elsewhere: it confirms the account exists AND names the credential to attack.
   */
  protected readonly lastMethod = this.lastSignIn.lastMethod;
  protected readonly lastMethodLabel = this.lastSignIn.lastMethodLabel;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  /**
   * Asked of the backend rather than hard-coded, so the button cannot appear on a deployment with
   * no Google credentials — where it would 401 and read as a broken site. Served from this
   * device's last known answer first, so a backend that is still waking cannot hide the button.
   */
  protected readonly googleEnabled = this.options.googleEnabled;

  /** Absolute in production. See environment.prod.ts for why it must not go through the proxy. */
  protected readonly googleUrl = `${environment.apiOrigin}/oauth2/authorization/google`;

  protected readonly form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor() {
    // A pasted username or address routinely carries a trailing newline. Never trim the password.
    const identifier = this.form.controls.identifier;
    identifier.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const trimmed = value.trim();
      if (trimmed !== value) {
        identifier.setValue(trimmed, { emitEvent: false });
      }
    });

    // Fire-and-forget: the cached answer is already rendering, and this only corrects it.
    this.options.refresh();
  }

  protected showError(name: 'identifier' | 'password'): boolean {
    const control: AbstractControl = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    const { identifier, password } = this.form.getRawValue();
    this.auth.login(identifier, password).subscribe({
      next: () => {
        this.busy.set(false);
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
        void this.router.navigateByUrl(target);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Invalid username or password.');
      },
    });
  }
}
