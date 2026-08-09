import { Service, signal } from '@angular/core';

/** How somebody got in last time, on this device. */
export type SignInMethod = 'password' | 'code' | 'google';

const KEY = 'peerdsa.lastSignIn';

const LABELS: Record<SignInMethod, string> = {
  password: 'your password',
  code: 'an emailed code',
  google: 'Google',
};

/**
 * Remembers which sign-in method was used last, so the sign-in screen can say so.
 *
 * <p>The problem it solves: an account can now be reached three ways, and one of them (Google)
 * produces a generated username its owner has never seen. Somebody returning after a few weeks
 * genuinely does not know whether they made a password or clicked the Google button — and the
 * penalty for guessing wrong is a failed sign-in that says only "invalid username or password".
 *
 * <p><b>Deliberately client-side, and deliberately per-device.</b> The server knows the answer,
 * but exposing it before authentication would be an account-enumeration oracle far worse than the
 * ones the rest of this codebase is careful to avoid: an endpoint answering "that address signs in
 * with Google" tells an attacker both that the account exists and which credential to attack.
 * localStorage cannot leak anything the person at this browser does not already know.
 *
 * <p>Per-device is also the more useful semantic. "You used Google on this laptop" is true and
 * actionable; "your account most recently used Google, from a phone in another country" is not.
 *
 * <p>No address is stored, only the method — so a shared device reveals nothing about who used it.
 */
@Service()
export class LastSignInService {
  private readonly method = signal<SignInMethod | null>(read());

  /** The method used last on this device, or null if this browser has never signed in. */
  readonly lastMethod = this.method.asReadonly();

  /** Human-readable, for "You last signed in with ___". */
  readonly lastMethodLabel = () => {
    const m = this.method();
    return m ? LABELS[m] : null;
  };

  remember(method: SignInMethod): void {
    this.method.set(method);
    try {
      localStorage.setItem(KEY, method);
    } catch {
      // Private mode, or storage full. The hint is a convenience; losing it changes nothing.
    }
  }
}

function read(): SignInMethod | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'password' || stored === 'code' || stored === 'google' ? stored : null;
  } catch {
    return null;
  }
}
