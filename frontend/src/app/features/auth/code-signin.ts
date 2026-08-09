import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

/** Which step is on screen. */
type Step = 'address' | 'code' | 'password' | 'done';

@Component({
  selector: 'app-code-signin',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth">
      <h1>Sign in with a code</h1>

      @switch (step()) {
        @case ('address') {
          <p class="tagline">
            We'll email you a six-digit code. Use this if you've forgotten your password, or if you
            created your account with Google and have never set one.
          </p>

          <form [formGroup]="addressForm" (ngSubmit)="requestCode()" novalidate>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" formControlName="email" autocomplete="email" />
            </div>

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="btn" [disabled]="addressForm.invalid || busy()">
              {{ busy() ? 'Sending…' : 'Email me a code' }}
            </button>
          </form>

          <p class="foot"><a routerLink="/signin">Back to sign in</a></p>
        }

        @case ('code') {
          <!-- Worded identically whether or not the address is registered. The endpoint answers
               202 either way, and saying "no account with that address" here would hand an
               anonymous visitor a way to test which addresses have accounts. -->
          <p class="tagline" role="status">
            If an account exists for {{ maskedEmail() }}, a code is on its way. It expires in 10
            minutes and works once.
          </p>

          @if (demoCode()) {
            <p class="demo-code" role="status">
              <strong>Development mode:</strong> the server is configured to return codes instead of
              emailing them. Your code is <code>{{ demoCode() }}</code
              >. This must never happen in production.
            </p>
          }

          <form [formGroup]="codeForm" (ngSubmit)="verifyCode()" novalidate>
            <div class="field">
              <label for="code">Six-digit code</label>
              <input
                id="code"
                type="text"
                formControlName="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
              />
            </div>

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="btn" [disabled]="codeForm.invalid || busy()">
              {{ busy() ? 'Checking…' : 'Sign in' }}
            </button>
          </form>

          <p class="foot">
            <button type="button" class="link" (click)="startOver()">Use a different address</button>
          </p>
        }

        @case ('password') {
          <!-- The step that makes this a recovery rather than a permanent workaround. Without it,
               someone who has forgotten their password signs in by code forever and never gets
               their account back. It is presented before continuing, not offered afterwards. -->
          <p class="tagline" role="status">
            You're signed in. Set a password now so you can get back in without a code next time.
          </p>

          <form [formGroup]="passwordForm" (ngSubmit)="setPassword()" novalidate>
            <div class="field">
              <label for="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                formControlName="newPassword"
                autocomplete="new-password"
              />
              @if (passwordForm.controls.newPassword.touched && passwordForm.controls.newPassword.invalid) {
                <p class="field-error" role="alert">At least 8 characters.</p>
              }
            </div>

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="btn" [disabled]="passwordForm.invalid || busy()">
              {{ busy() ? 'Saving…' : 'Set password and continue' }}
            </button>
          </form>

          <p class="foot">
            <!-- Deliberately worded as a real cost, because it is one: skip, and the only way back
                 in is another code. -->
            <button type="button" class="link" (click)="skip()">
              Skip for now (you'll need a code again next time)
            </button>
          </p>
        }

        @case ('done') {
          <!-- Showing the username is not a nicety. This screen found the account by email, but
               sign-in wants a username — and for an account created through Google that username
               was generated and has never been seen by its owner. Without this, the next sign-in
               fails with "invalid username or password" and nothing explains why. -->
          <p class="sent" role="status">
            Password set. Sign in with the username <strong>{{ username() }}</strong> — or with your
            email address, which also works.
          </p>

          <button type="button" class="btn" (click)="skip()">Continue to the dashboard</button>
        }
      }
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Sign-in by one-time code, in three steps: ask for a code, redeem it, then set a password.
 *
 * The third step is the point of the whole screen. A code signs you in, but on its own it makes the
 * code a permanent second credential — somebody who has forgotten their password would go on using
 * codes forever and never actually recover the account. So the password step is presented before
 * the user continues, not tucked away in settings.
 *
 * It works without an old password because the token from step two carries the backend's `vbc`
 * claim for a few minutes: this session began by proving control of the registered address. That
 * window is short and does not survive a refresh, so the step has to happen now — which is another
 * reason to show it immediately.
 */
export class CodeSignin {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly step = signal<Step>('address');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Non-null only when the backend runs with OTP_DEMO_MODE=true. Labelled as such on screen. */
  protected readonly demoCode = signal<string | null>(null);

  /** The username the password was actually set on. Reported by the backend, and shown. */
  protected readonly username = signal<string | null>(null);

  private readonly email = signal('');

  /** Shown back to the user without reprinting the whole address into the page. */
  protected readonly maskedEmail = computed(() => {
    const value = this.email();
    const at = value.indexOf('@');
    if (at <= 1) return value;
    return `${value[0]}***${value[at - 1]}${value.slice(at)}`;
  });

  protected readonly addressForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected requestCode(): void {
    if (this.addressForm.invalid) return;
    this.busy.set(true);
    this.error.set(null);

    const email = this.addressForm.getRawValue().email.trim();
    this.auth.requestCode(email).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.email.set(email);
        this.demoCode.set(response.demoCode);
        this.step.set('code');
      },
      error: (err) => {
        this.busy.set(false);
        // 429 and 503 are the two the user can act on; everything else is generic. Note that an
        // unregistered address is NOT an error — it answers 202 like any other.
        this.error.set(
          err?.status === 429
            ? 'Too many code requests for that address. Try again in a little while.'
            : err?.status === 503
              ? "We couldn't send the email just now. Please try again shortly."
              : 'Something went wrong. Try again.',
        );
      },
    });
  }

  protected verifyCode(): void {
    if (this.codeForm.invalid) return;
    this.busy.set(true);
    this.error.set(null);

    this.auth.verifyCode(this.email(), this.codeForm.getRawValue().code.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.step.set('password');
      },
      error: () => {
        this.busy.set(false);
        this.error.set('That code is not valid or has expired.');
      },
    });
  }

  protected setPassword(): void {
    if (this.passwordForm.invalid) return;
    this.busy.set(true);
    this.error.set(null);

    // No proof is sent: the session's own token is the proof, for the next few minutes.
    this.auth.setPassword(this.passwordForm.getRawValue().newPassword).subscribe({
      next: (response) => {
        this.busy.set(false);
        // Deliberately a step of its own rather than a redirect. The username is news for an
        // account created through Google — the password was just set on a name its owner has
        // never seen — and a toast on the way to the dashboard is exactly the kind of message
        // people scroll past and then cannot find again.
        this.username.set(response.username);
        this.step.set('done');
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          'We could not set that password. The verification window may have passed — sign in with a new code and try again.',
        );
      },
    });
  }

  protected skip(): void {
    void this.router.navigate(['/dashboard']);
  }

  protected startOver(): void {
    this.error.set(null);
    this.demoCode.set(null);
    this.codeForm.reset();
    this.step.set('address');
  }
}
