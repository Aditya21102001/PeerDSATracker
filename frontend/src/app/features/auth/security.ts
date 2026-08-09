import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { LastSignInService } from '../../core/services/last-sign-in.service';

/** Which proof the user is offering. */
type Proof = 'password' | 'code';

@Component({
  selector: 'app-security',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="auth">
      <header>
        <h1>Account</h1>
        <nav><a routerLink="/dashboard">Dashboard</a></nav>
      </header>

      <!--
        The details the rest of the app never showed. The username matters most: sign-in asks for
        one, and an account created through Google was given a generated username its owner has
        never seen anywhere.
      -->
      @if (me(); as user) {
        <dl class="account-details">
          <div>
            <dt>Username</dt>
            <dd><strong>{{ user.username }}</strong></dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ user.email }}</dd>
          </div>
          <div>
            <dt>Sign in with</dt>
            <dd>{{ signInSummary() }}</dd>
          </div>
        </dl>
      }

      @if (hasPassword() === false) {
        <p class="tagline">
          Your account signs in with Google and has never had a password. Set one and you'll be able
          to sign in without it.
        </p>
      }

      @if (done()) {
        <!-- The username is the point of this message. Recovery found the account by email, but
             sign-in wants a username, and for a Google-created account those differ — without
             saying so, the next attempt fails with "invalid username or password" and nothing on
             screen explains why. -->
        <p class="sent" role="status">
          Password updated. Sign in with the username <strong>{{ done() }}</strong> (or your email
          address). Any other devices have been signed out.
        </p>
        <p class="foot"><a routerLink="/dashboard">Back to the dashboard</a></p>
      } @else {
        <fieldset class="proof">
          <legend>How would you like to confirm it's you?</legend>

          @if (hasPassword()) {
            <label>
              <input type="radio" name="proof" value="password" [checked]="proof() === 'password'"
                     (change)="proof.set('password')" />
              With my current password
            </label>
          }

          <label>
            <input type="radio" name="proof" value="code" [checked]="proof() === 'code'"
                   (change)="proof.set('code')" />
            <!-- The path that exists for people who cannot use the one above: forgotten
                 passwords, and accounts that never had one. -->
            Email me a code
          </label>
        </fieldset>

        @if (proof() === 'code') {
          @if (!codeSent()) {
            <button type="button" class="btn btn-ghost" (click)="sendCode()" [disabled]="busy()">
              {{ busy() ? 'Sending…' : 'Send a code to ' + (email() ?? 'my address') }}
            </button>
          } @else {
            <p class="sent" role="status">
              A code is on its way. It expires in 10 minutes.
              @if (demoCode()) {
                <br /><strong>Development mode:</strong> the code is <code>{{ demoCode() }}</code
                >.
              }
            </p>
          }
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (proof() === 'password' && hasPassword()) {
            <div class="field">
              <label for="current">Current password</label>
              <input id="current" type="password" formControlName="currentPassword"
                     autocomplete="current-password" />
            </div>
          }

          @if (proof() === 'code') {
            <div class="field">
              <label for="code">Six-digit code</label>
              <input id="code" type="text" formControlName="code" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" />
            </div>
          }

          <div class="field">
            <label for="new-password">New password</label>
            <input id="new-password" type="password" formControlName="newPassword"
                   autocomplete="new-password" />
            @if (form.controls.newPassword.touched && form.controls.newPassword.invalid) {
              <p class="field-error" role="alert">At least 8 characters.</p>
            }
          </div>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="btn" [disabled]="form.controls.newPassword.invalid || busy()">
            {{ busy() ? 'Saving…' : 'Update password' }}
          </button>
        </form>
      }
    </main>
  `,
  styleUrl: './auth.scss',
})
/**
 * Change-password panel, with both proof paths on one screen.
 *
 * Two are offered because one is not enough. "Current password" covers the ordinary case; a
 * one-time code covers the two it cannot — a password that has been forgotten, and an account
 * created through Google that has never had one. The backend accepts either, plus a third the user
 * never sees: a session that itself began with a code minutes ago, which is what the set-a-password
 * step after a code sign-in uses.
 *
 * Whichever proof fails, the backend answers with one identical message. This screen shows it
 * verbatim rather than guessing which field was wrong — telling someone "wrong code" rather than
 * "wrong password" would tell an attacker which half they had already got right.
 */
export class Security {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly lastSignIn = inject(LastSignInService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly codeSent = signal(false);
  protected readonly demoCode = signal<string | null>(null);

  /** The username the password ended up on; set once the change succeeds. */
  protected readonly done = signal<string | null>(null);

  protected readonly email = computed(() => this.auth.currentUser()?.email ?? null);

  /** Undefined until the profile loads; false for an account that has only used Google. */
  protected readonly hasPassword = computed(() => this.auth.currentUser()?.hasPassword);

  protected readonly proof = signal<Proof>('password');

  /** The signed-in account. Loaded by AuthStore on session restore, so it is there on load. */
  protected readonly me = this.auth.currentUser;

  /**
   * What this account can actually sign in with, plus the method last used on this device.
   * Both matter: "you have a password" is the account's state, "you used Google here" is this
   * browser's, and somebody returning after a break usually wants the second one.
   */
  protected readonly signInSummary = computed(() => {
    const user = this.auth.currentUser();
    if (!user) {
      return '';
    }
    const ways = user.hasPassword ? 'Password or an emailed code' : 'An emailed code, or Google';
    const last = this.lastSignIn.lastMethodLabel();
    return last ? `${ways} · last used ${last} on this device` : ways;
  });

  protected readonly form = this.fb.nonNullable.group({
    currentPassword: [''],
    code: [''],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    // An account with no password cannot offer one, so the code path is the only option.
    if (!this.auth.currentUser()) {
      this.auth.loadMe().subscribe({
        next: (me) => this.proof.set(me.hasPassword ? 'password' : 'code'),
        error: () => {},
      });
    } else if (!this.auth.currentUser()?.hasPassword) {
      this.proof.set('code');
    }
  }

  protected sendCode(): void {
    const address = this.email();
    if (!address) return;

    this.busy.set(true);
    this.error.set(null);

    this.auth.requestCode(address).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.demoCode.set(response.demoCode);
        this.codeSent.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(
          err?.status === 429
            ? 'Too many code requests. Try again in a little while.'
            : "We couldn't send the email just now. Please try again shortly.",
        );
      },
    });
  }

  protected submit(): void {
    if (this.form.controls.newPassword.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    const { currentPassword, code, newPassword } = this.form.getRawValue();
    const offered = this.proof() === 'code' ? { code } : { currentPassword };

    this.auth.setPassword(newPassword, offered).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.done.set(response.username);
      },
      error: (err) => {
        this.busy.set(false);
        // Shown verbatim. The backend returns one message for every proof failure on purpose.
        this.error.set(
          err?.error?.message ??
            'We could not confirm it is you. Check your current password or code and try again.',
        );
      },
    });
  }
}
