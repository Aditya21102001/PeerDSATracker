import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-signin',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth">
      <header>
        <h1>⚡ The Grind ⚡</h1>
        <p class="tagline">Your missions are waiting.</p>
      </header>

      <dl class="stats">
        <div><dt>474</dt><dd>Problems</dd></div>
        <div><dt>∞</dt><dd>Peers</dd></div>
        <div><dt>0</dt><dd>Excuses</dd></div>
      </dl>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email" />
          @if (showError('email')) {
            <p class="field-error" role="alert">Enter a valid email address.</p>
          }
        </div>

        <div class="field">
          <div class="row">
            <label for="password">Password</label>
            @if (resetEnabled) {
              <a class="forgot" routerLink="/forgot">Forgot?</a>
            }
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

      <p class="foot">New here? <a routerLink="/signup">Join the Force!</a></p>
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Sign-in form, reached only through guestGuard so a signed-in visitor is redirected away.
 *
 * On success login() has merely stored the tokens — unlike signup it does not load the
 * profile — and we hand off to /dashboard.
 */
export class Signin {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  /** Hidden in production: there is no mailer, so the link would go nowhere. */
  protected readonly resetEnabled = environment.resetEnabled;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    // A pasted email routinely carries a trailing newline. Never trim the password.
    const email = this.form.controls.email;
    email.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const trimmed = value.trim();
      if (trimmed !== value) {
        email.setValue(trimmed, { emitEvent: false });
      }
    });
  }

  protected showError(name: 'email' | 'password'): boolean {
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
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Invalid email or password.');
      },
    });
  }
}
