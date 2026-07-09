import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-signin',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth">
      <h1>⚡ PEER DSA TRACKER ⚡</h1>
      <p class="tagline">Your missions are waiting.</p>

      <dl class="stats">
        <div><dt>474</dt><dd>Problems</dd></div>
        <div><dt>∞</dt><dd>Peers</dd></div>
        <div><dt>0</dt><dd>Excuses</dd></div>
      </dl>

      <form [formGroup]="form" (ngSubmit)="submit()">
        <label for="email">Email</label>
        <input id="email" type="email" formControlName="email" autocomplete="email" />

        <div class="row">
          <label for="password">Password</label>
          @if (resetEnabled) {
            <a class="forgot" routerLink="/forgot">Forgot?</a>
          }
        </div>
        <input id="password" type="password" formControlName="password" autocomplete="current-password" />

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p>New here? <a routerLink="/signup">Join the Force!</a></p>
    </main>
  `,
  styleUrl: './auth.scss',
})
export class Signin {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Hidden in production: there is no mailer, so the link would go nowhere. */
  protected readonly resetEnabled = environment.resetEnabled;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);

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
