import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthOptionsService } from '../../core/services/auth-options.service';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      <header>
        <h1>Join the Force</h1>
        <p class="tagline">474 problems. Zero excuses.</p>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email" />
          @if (showError('email')) {
            <p class="field-error" role="alert">Enter a valid email address.</p>
          }
        </div>

        <div class="field">
          <label for="username">Username</label>
          <input id="username" type="text" formControlName="username" autocomplete="username" />
          @if (showError('username')) {
            <p class="field-error" role="alert">
              3–30 characters: letters, digits, dot, hyphen or underscore.
            </p>
          } @else {
            <small>3–30 characters. Letters, digits, . - _</small>
          }
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password" />
          @if (showError('password')) {
            <p class="field-error" role="alert">At least 8 characters.</p>
          } @else {
            <small>At least 8 characters.</small>
          }
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn" [disabled]="busy()">
          {{ busy() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      @if (googleEnabled()) {
        <!-- A plain link, not a fetch: this is a full-page navigation that has to leave the SPA
             and come back, and the backend auto-provisions new users who arrive through Google. -->
        <a class="btn btn-ghost provider" [href]="googleUrl">
          <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Sign up with Google</span>
        </a>
      }

      <p class="foot">Already enlisted? <a routerLink="/signin" [queryParams]="route.snapshot.queryParams">Sign in</a></p>
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Registration form, reached only through guestGuard.
 *
 * signup() exchanges the credentials for tokens *and* loads /auth/me, so by the time this
 * navigates the user is already fully signed in — /dashboard needs no extra profile fetch.
 */
export class Signup {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  private readonly options = inject(AuthOptionsService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Errors stay hidden until the user has tried, so a fresh form isn't shouting. */
  private readonly submitted = signal(false);

  /**
   * Asked of the backend rather than hard-coded, so the button cannot appear on a deployment with
   * no Google credentials. Served from this device's last known answer first.
   */
  protected readonly googleEnabled = this.options.googleEnabled;

  /** Absolute in production. See environment.prod.ts for why it must not go through the proxy. */
  protected readonly googleUrl = `${environment.apiOrigin}/oauth2/authorization/google`;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ],
    ],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    // Copying a value almost always drags a trailing space or newline with it, and the
    // pattern validator rejects it -- the form looks broken for no visible reason.
    // Passwords are left alone: a trailing space there may well be deliberate.
    this.trimOnInput('email');
    this.trimOnInput('username');
    this.options.refresh();
  }

  private trimOnInput(name: 'email' | 'username'): void {
    const control = this.form.controls[name];
    control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const trimmed = value.trim();
      if (trimmed !== value) {
        control.setValue(trimmed, { emitEvent: false });
      }
    });
  }

  protected showError(name: 'email' | 'username' | 'password'): boolean {
    const control: AbstractControl = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  /**
   * The button is never disabled for an invalid form. A greyed-out button with no
   * explanation is the worst possible feedback; submitting and naming the problem is
   * the best.
   */
  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    const { email, username, password } = this.form.getRawValue();
    this.auth.signup(email, username, password).subscribe({
      next: () => {
        this.busy.set(false);
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
        void this.router.navigateByUrl(target);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Could not create the account.');
      },
    });
  }
}
