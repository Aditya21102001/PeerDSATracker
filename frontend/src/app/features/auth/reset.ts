import { Component, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-reset',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      <h1>Choose a new password</h1>

      @if (!token()) {
        <p class="error" role="alert">
          This reset link is missing its token. Request a new one from
          <a routerLink="/forgot">Forgot password</a>.
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label for="password">New password</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password" />
          <small>At least 8 characters.</small>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="btn" [disabled]="form.invalid || busy()">
            {{ busy() ? 'Saving…' : 'Reset password' }}
          </button>
        </form>

        <p class="tagline">Resetting signs you out everywhere else.</p>
      }
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Set-a-new-password form, opened from an emailed link that carries the token as ?token=….
 *
 * Deliberately NOT guest-only, unlike /forgot: a signed-in user following the link from
 * their inbox must still land here. A successful reset revokes every refresh token, so it
 * ends all of the user's other sessions (which the tagline warns about).
 */
export class Reset {
  /** Bound from ?token=… by withComponentInputBinding(). */
  readonly token = input<string>('');

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);

    this.http
      .post<void>('/api/auth/reset', {
        token: this.token(),
        password: this.form.getRawValue().password,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          void this.router.navigate(['/signin']);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('That reset link is invalid or has expired. Request a new one.');
        },
      });
  }
}
