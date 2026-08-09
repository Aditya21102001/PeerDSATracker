import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-choose-username',
  imports: [ReactiveFormsModule],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      <h1>Pick a username</h1>
      <p class="tagline">
        This is the name other people see on the leaderboard and when they message you. We've
        suggested one from your email &mdash; keep it or change it.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            type="text"
            formControlName="username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
          @if (form.controls.username.touched && form.controls.username.invalid) {
            <p class="field-error" role="alert">
              3&ndash;30 characters: letters, digits, dot, hyphen and underscore only.
            </p>
          }
        </div>

        <!-- Said plainly. The whole reason this step exists is that the generated name would
             otherwise appear publicly without its owner ever having seen it. -->
        <p class="hint">Your email address stays private &mdash; only this name is public.</p>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn" [disabled]="busy()">
          {{ busy() ? 'Saving…' : 'Continue' }}
        </button>
      </form>
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Shown once, on first arrival for an account provisioned through Google.
 *
 * Those accounts are given a generated username because the column is NOT NULL and something has
 * to go there. Left alone, that name appears on the public leaderboard and in peer search without
 * its owner ever having seen it &mdash; and sign-in then asks them for a username they do not know.
 *
 * The field is prefilled with the generated name (already derived from their email's local part),
 * so accepting it is one tap. Using the full email as the username was considered and rejected:
 * usernames are public, so that would publish every Google user's email address to everyone.
 */
export class ChooseUsername {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: [
      this.auth.currentUser()?.username ?? '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[a-zA-Z0-9._-]+$/)],
    ],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);

    this.auth.chooseUsername(this.form.getRawValue().username.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(
          err?.status === 409 ? 'That username is taken. Try another.' : 'Could not save that username.',
        );
      },
    });
  }
}
