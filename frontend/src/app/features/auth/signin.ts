import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

        <button type="submit" class="btn" [disabled]="busy()">
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
        <a class="btn btn-ghost provider" [href]="googleUrl">Continue with Google</a>
      }

      <p class="foot">New here? <a routerLink="/signup">Join the Force!</a></p>
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
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Invalid username or password.');
      },
    });
  }
}
