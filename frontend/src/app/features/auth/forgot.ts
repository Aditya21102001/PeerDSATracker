import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forgot',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth">
      <h1>Forgot your password?</h1>
      <p class="tagline">We'll send a reset link if that email is registered.</p>

      @if (sent()) {
        <p class="sent" role="status">
          If an account exists for that address, a reset link is on its way. The link expires in
          30 minutes.
        </p>
        <p><a routerLink="/signin">Back to sign in</a></p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email" />

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="btn" [disabled]="form.invalid || busy()">
            {{ busy() ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>

        <p>Remembered it? <a routerLink="/signin">Sign in</a></p>
      }
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * "Forgot password" request form. Guest-only, and only routed at all when
 * environment.resetEnabled is true (there is otherwise no mailer to send the link).
 *
 * The endpoint answers 204 whether or not the address is registered, so this screen shows
 * the same "if that address exists…" confirmation in every case — revealing which emails
 * have accounts would be a user-enumeration oracle.
 */
export class Forgot {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);

    // The server answers 204 even for an unknown address, so there is nothing here
    // that could reveal whether the account exists.
    this.http.post<void>('/api/auth/forgot', this.form.getRawValue()).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Something went wrong. Try again.');
      },
    });
  }
}
