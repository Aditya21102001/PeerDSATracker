import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth">
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

      <p class="foot">Already enlisted? <a routerLink="/signin">Sign in</a></p>
    </main>
  `,
  styleUrl: './auth.scss',
})
export class Signup {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Errors stay hidden until the user has tried, so a fresh form isn't shouting. */
  private readonly submitted = signal(false);

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
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Could not create the account.');
      },
    });
  }
}
