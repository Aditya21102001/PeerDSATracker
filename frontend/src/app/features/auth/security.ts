import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PasskeySummary } from '../../core/models/api.models';
import { resolvePasskeyProvider } from '../../core/services/aaguid-registry';
import { AuthStore } from '../../core/services/auth.store';
import { LastSignInService } from '../../core/services/last-sign-in.service';
import { PasskeyService } from '../../core/services/passkey.service';

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
            <dd>
              @if (editingUsername()) {
                <span class="edit-username">
                  <label class="sr-only" for="new-username">New username</label>
                  <input id="new-username" type="text" [value]="usernameDraft()"
                         (input)="usernameDraft.set($any($event.target).value)"
                         autocapitalize="none" spellcheck="false" maxlength="30" />
                  <button type="button" class="btn btn-sm" (click)="saveUsername()"
                          [disabled]="savingUsername()">Save</button>
                  <button type="button" class="btn btn-sm btn-quiet" (click)="cancelUsername()">Cancel</button>
                </span>
                @if (usernameError()) {
                  <span class="field-error" role="alert">{{ usernameError() }}</span>
                }
              } @else {
                <strong>{{ user.username }}</strong>
                <!-- Optional, and here rather than in the sign-in flow: signing in is not the
                     moment to interrupt somebody with a form. A Google-provisioned name is a
                     generated one, so this is where it can be made theirs. -->
                <button type="button" class="link change" (click)="editUsername(user.username)">Change</button>
              }
            </dd>
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

      @if (passkeySupported()) {
        <section class="passkey-section" aria-labelledby="passkeys-heading">
          <div class="passkey-header">
            <div>
              <h2 id="passkeys-heading">Biometrics &amp; Passkeys</h2>
              <p class="tagline">Sign in faster with Face ID, Touch ID, Windows Hello, or a security key.</p>
            </div>
            <button
              type="button"
              class="btn btn-sm"
              [disabled]="passkeyBusy()"
              (click)="addPasskey()"
            >
              {{ passkeyBusy() ? 'Waiting…' : 'Add passkey' }}
            </button>
          </div>

          @if (passkeyNotice()) {
            <p class="sent" role="status">{{ passkeyNotice() }}</p>
          }
          @if (passkeyError()) {
            <p class="error" role="alert">{{ passkeyError() }}</p>
          }

          @if (passkeyLoading()) {
            <p class="tagline">Loading registered passkeys…</p>
          } @else if (passkeyList().length === 0) {
            <p class="passkey-empty">No passkeys registered on this account yet.</p>
          } @else {
            <ul class="passkey-list">
              @for (cred of passkeyList(); track cred.id) {
                <li class="passkey-item">
                  <div class="passkey-row">
                    <span class="passkey-provider-badge" aria-hidden="true" [title]="providerFor(cred).name">
                      @switch (providerFor(cred).badge) {
                        @case ('apple') {
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4Z"/>
                            <circle cx="12" cy="14" r="1.5"/>
                          </svg>
                        }
                        @case ('google') {
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M12 8v4l3 2"/>
                          </svg>
                        }
                        @case ('microsoft') {
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <rect x="4" y="4" width="7" height="7" rx="1"/>
                            <rect x="13" y="4" width="7" height="7" rx="1"/>
                            <rect x="4" y="13" width="7" height="7" rx="1"/>
                            <rect x="13" y="13" width="7" height="7" rx="1"/>
                          </svg>
                        }
                        @case ('vault') {
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M12 3 4 7v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z"/>
                            <circle cx="12" cy="12" r="2"/>
                          </svg>
                        }
                        @default {
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <circle cx="7.5" cy="15.5" r="4.5"/>
                            <path d="m11 12 9-9"/>
                            <path d="m16 7 3 3"/>
                          </svg>
                        }
                      }
                    </span>

                    <div class="passkey-meta">
                      @if (renamingId() === cred.id) {
                        <div class="passkey-rename">
                          <label class="sr-only" [attr.for]="'rename-' + cred.id">Passkey name</label>
                          <input
                            [id]="'rename-' + cred.id"
                            type="text"
                            maxlength="80"
                            [value]="renameDraft()"
                            (input)="renameDraft.set($any($event.target).value)"
                          />
                          <button type="button" class="btn btn-sm" [disabled]="passkeyBusy()" (click)="saveRename(cred.id)">
                            Save
                          </button>
                          <button type="button" class="btn btn-sm btn-quiet" (click)="cancelRename()">Cancel</button>
                        </div>
                      } @else {
                        <div class="passkey-title">
                          <strong>{{ cred.name }}</strong>
                          @if (cred.deviceType === 'multiDevice') {
                            <span class="passkey-chip">Synced</span>
                          }
                        </div>
                        <p class="passkey-provider-name">{{ providerFor(cred).name }}</p>
                      }
                      <p class="passkey-dates">
                        Registered {{ formatDate(cred.registeredAt) }}
                        · Last used {{ cred.lastUsedAt ? formatDate(cred.lastUsedAt) : 'never' }}
                      </p>
                    </div>
                  </div>

                  @if (renamingId() !== cred.id) {
                    <div class="passkey-actions">
                      <button type="button" class="link" (click)="startRename(cred)">Rename</button>
                      <button
                        type="button"
                        class="link danger-link"
                        [disabled]="passkeyBusy()"
                        (click)="deletePasskey(cred.id)"
                      >
                        Delete
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </section>
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
  private readonly passkeys = inject(PasskeyService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly codeSent = signal(false);
  protected readonly demoCode = signal<string | null>(null);

  protected readonly passkeySupported = signal(false);
  protected readonly passkeyLoading = signal(false);
  protected readonly passkeyBusy = signal(false);
  protected readonly passkeyError = signal<string | null>(null);
  protected readonly passkeyNotice = signal<string | null>(null);
  protected readonly passkeyList = signal<PasskeySummary[]>([]);
  protected readonly passkeyRpId = signal<string | null>(null);
  protected readonly passkeyUserId = signal<string | null>(null);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameDraft = signal('');

  /** The username the password ended up on; set once the change succeeds. */
  protected readonly done = signal<string | null>(null);

  protected readonly email = computed(() => this.auth.currentUser()?.email ?? null);

  /** Undefined until the profile loads; false for an account that has only used Google. */
  protected readonly hasPassword = computed(() => this.auth.currentUser()?.hasPassword);

  protected readonly proof = signal<Proof>('password');

  /** The signed-in account. Loaded by AuthStore on session restore, so it is there on load. */
  protected readonly me = this.auth.currentUser;

  protected readonly editingUsername = signal(false);
  protected readonly usernameDraft = signal('');
  protected readonly savingUsername = signal(false);
  protected readonly usernameError = signal<string | null>(null);

  protected editUsername(current: string): void {
    this.usernameDraft.set(current);
    this.usernameError.set(null);
    this.editingUsername.set(true);
  }

  protected cancelUsername(): void {
    this.editingUsername.set(false);
    this.usernameError.set(null);
  }

  protected saveUsername(): void {
    const wanted = this.usernameDraft().trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(wanted)) {
      this.usernameError.set('3–30 characters: letters, digits, dot, hyphen and underscore only.');
      return;
    }
    this.savingUsername.set(true);
    this.usernameError.set(null);

    this.auth.chooseUsername(wanted).subscribe({
      next: (me) => {
        this.savingUsername.set(false);
        this.editingUsername.set(false);
        const rpId = this.passkeyRpId();
        const pkUserId = this.passkeyUserId();
        if (rpId && pkUserId) {
          void this.passkeys.signalCurrentUserDetails(rpId, pkUserId, wanted, me.displayName ?? wanted);
        }
      },
      error: (err) => {
        this.savingUsername.set(false);
        // The server's own message where there is one. A blanket "could not save" hides whether
        // the name was taken, the input was rejected, or the endpoint is not there at all --
        // which is exactly the information needed to do something about it.
        this.usernameError.set(
          err?.status === 409
            ? 'That username is taken. Try another.'
            : err?.status === 404
              ? 'This server does not support changing your username yet.'
              : (err?.error?.message ?? 'Could not save that username.'),
        );
      },
    });
  }

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
    const base = user.hasPassword ? 'Password or an emailed code' : 'An emailed code, or Google';
    const ways = this.passkeyList().length > 0 ? `${base}, plus passkey` : base;
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

    void this.initPasskeys();
  }

  private async initPasskeys(): Promise<void> {
    const caps = await this.passkeys.getCapabilities();
    if (!caps.webAuthnSupported) {
      return;
    }
    this.passkeySupported.set(true);
    await this.refreshPasskeys();
  }

  private async refreshPasskeys(): Promise<void> {
    this.passkeyLoading.set(true);
    this.passkeyError.set(null);
    try {
      const res = await this.passkeys.listPasskeys();
      this.passkeyList.set(res.credentials);
      this.passkeyRpId.set(res.rpId);
      this.passkeyUserId.set(res.passkeyUserId);
    } catch {
      this.passkeyError.set('Could not load your registered passkeys right now.');
    } finally {
      this.passkeyLoading.set(false);
    }
  }

  protected async addPasskey(): Promise<void> {
    this.passkeyError.set(null);
    this.passkeyNotice.set(null);
    this.passkeyBusy.set(true);
    try {
      const created = await this.passkeys.registerPasskey({ promotion: false });
      this.passkeyNotice.set(`Added passkey "${created.name}".`);
      await this.refreshPasskeys();
    } catch (err: unknown) {
      if (!(err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError'))) {
        const msg = (err as { error?: { message?: string }; message?: string })?.error?.message;
        this.passkeyError.set(msg ?? 'Could not register a passkey on this device.');
      }
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  protected startRename(cred: PasskeySummary): void {
    this.renamingId.set(cred.id);
    this.renameDraft.set(cred.name);
    this.passkeyError.set(null);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  protected async saveRename(id: string): Promise<void> {
    const nextName = this.renameDraft().trim();
    if (!nextName) {
      this.passkeyError.set('Passkey name cannot be blank.');
      return;
    }
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);
    try {
      const updated = await this.passkeys.renamePasskey(id, nextName);
      this.passkeyList.update((items) => items.map((c) => (c.id === id ? updated : c)));
      this.renamingId.set(null);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.passkeyError.set(msg ?? 'Could not rename that passkey.');
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  protected async deletePasskey(id: string): Promise<void> {
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);
    this.passkeyNotice.set(null);
    try {
      await this.passkeys.deletePasskey(id);
      this.passkeyList.update((items) => items.filter((c) => c.id !== id));
      this.passkeyNotice.set('Passkey removed.');
    } catch {
      this.passkeyError.set('Could not delete that passkey.');
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  protected providerFor(cred: PasskeySummary) {
    return resolvePasskeyProvider(cred.aaguid, cred.deviceType);
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
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
