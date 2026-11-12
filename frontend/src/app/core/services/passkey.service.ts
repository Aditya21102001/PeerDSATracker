import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DeletePasskeyResponse,
  Me,
  PasskeyChallengeResponse,
  PasskeyListResponse,
  PasskeySummary,
  TokenResponse,
} from '../models/api.models';
import { AuthStore } from './auth.store';

export interface PasskeyCapabilities {
  webAuthnSupported: boolean;
  platformAuthenticator: boolean;
  conditionalGet: boolean;
}

interface ServerCreationOptions {
  rp?: { id?: string; name?: string };
  [key: string]: unknown;
}

interface ServerRequestOptions {
  rpId?: string;
  [key: string]: unknown;
}

type WebAuthnPublicKeyCredential = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
  parseCreationOptionsFromJSON?: (options: unknown) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (options: unknown) => PublicKeyCredentialRequestOptions;
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
  signalAllAcceptedCredentials?: (options: {
    rpId: string;
    userId: string;
    allAcceptedCredentialIds: string[];
  }) => Promise<void>;
  signalCurrentUserDetails?: (options: {
    rpId: string;
    userId: string;
    name: string;
    displayName: string;
  }) => Promise<void>;
};

/**
 * Browser WebAuthn / Passkey orchestration, Signal API sync, and `/api/auth/passkeys` client.
 */
@Injectable({ providedIn: 'root' })
export class PasskeyService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  private activeConditionalAbort: AbortController | null = null;

  /** Detects WebAuthn, platform biometric, and Conditional UI support via `getClientCapabilities()`. */
  async getCapabilities(): Promise<PasskeyCapabilities> {
    if (
      typeof window === 'undefined' ||
      typeof window.PublicKeyCredential === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.credentials
    ) {
      return { webAuthnSupported: false, platformAuthenticator: false, conditionalGet: false };
    }

    const pkc = window.PublicKeyCredential as WebAuthnPublicKeyCredential;
    if (typeof pkc.getClientCapabilities === 'function') {
      try {
        const caps = await pkc.getClientCapabilities();
        const platform = Boolean(caps['userVerifyingPlatformAuthenticator']);
        const conditional = Boolean(caps['conditionalGet']);
        return {
          webAuthnSupported: true,
          platformAuthenticator: platform,
          conditionalGet: conditional,
        };
      } catch {
        // Fall through to legacy checks if a polyfill/browser throws.
      }
    }

    let platform = false;
    let conditional = false;
    try {
      if (typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        platform = await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
      }
      if (typeof pkc.isConditionalMediationAvailable === 'function') {
        conditional = await pkc.isConditionalMediationAvailable();
      }
    } catch {
      // Ignore capability probe errors.
    }

    return { webAuthnSupported: true, platformAuthenticator: platform, conditionalGet: conditional };
  }

  /** Lists all passkeys for the signed-in account and synchronizes the password manager via Signal API. */
  async listPasskeys(): Promise<PasskeyListResponse> {
    const response = await firstValueFrom(this.http.get<PasskeyListResponse>('/api/auth/passkeys'));
    if (response.passkeyUserId) {
      await this.signalAllAcceptedCredentials(
        response.rpId,
        response.passkeyUserId,
        response.credentials.map((c) => c.id),
      );
    }
    return response;
  }

  /** Creates a new passkey / biometric credential for the signed-in user. */
  async registerPasskey(options: { promotion?: boolean; name?: string } = {}): Promise<PasskeySummary> {
    const challenge = await firstValueFrom(
      this.http.post<PasskeyChallengeResponse<ServerCreationOptions>>(
        '/api/auth/passkeys/register/options',
        { promotion: Boolean(options.promotion) },
      ),
    );

    const pkc = window.PublicKeyCredential as WebAuthnPublicKeyCredential;
    if (typeof pkc.parseCreationOptionsFromJSON !== 'function') {
      throw new Error('This browser does not support passkey registration.');
    }

    const publicKey = pkc.parseCreationOptionsFromJSON(challenge.publicKey);
    const credential = (await navigator.credentials.create({ publicKey })) as
      | (PublicKeyCredential & { toJSON?: () => Record<string, unknown> })
      | null;
    if (!credential) {
      throw new Error('Passkey creation was cancelled.');
    }

    const credentialJson =
      typeof credential.toJSON === 'function'
        ? credential.toJSON()
        : { id: credential.id, type: credential.type };

    try {
      return await firstValueFrom(
        this.http.post<PasskeySummary>('/api/auth/passkeys/register/verify', {
          challengeId: challenge.challengeId,
          credential: credentialJson,
          name: options.name?.trim() || null,
        }),
      );
    } catch (err) {
      const rpId = challenge.publicKey.rp?.id;
      const credId = typeof credentialJson['id'] === 'string' ? credentialJson['id'] : credential.id;
      if (rpId && credId) {
        await this.signalUnknownCredential(rpId, credId);
      }
      throw err;
    }
  }

  /** Renames a passkey (server-side metadata only). */
  async renamePasskey(id: string, name: string): Promise<PasskeySummary> {
    return firstValueFrom(
      this.http.put<PasskeySummary>(`/api/auth/passkeys/${encodeURIComponent(id)}`, { name }),
    );
  }

  /** Deletes a passkey and notifies password managers of the remaining accepted credentials. */
  async deletePasskey(id: string): Promise<DeletePasskeyResponse> {
    const res = await firstValueFrom(
      this.http.delete<DeletePasskeyResponse>(`/api/auth/passkeys/${encodeURIComponent(id)}`),
    );
    await this.signalAllAcceptedCredentials(res.rpId, res.passkeyUserId, res.remainingCredentialIds);
    return res;
  }

  /** Explicit passkey / biometric sign-in button handler. Aborts any active Conditional UI request first. */
  async signInWithPasskey(): Promise<Me> {
    this.abortConditionalUi();

    const challenge = await firstValueFrom(
      this.http.post<PasskeyChallengeResponse<ServerRequestOptions>>('/api/auth/passkeys/login/options', {}),
    );

    const pkc = window.PublicKeyCredential as WebAuthnPublicKeyCredential;
    if (typeof pkc.parseRequestOptionsFromJSON !== 'function') {
      throw new Error('This browser does not support passkey sign-in.');
    }

    const publicKey = pkc.parseRequestOptionsFromJSON(challenge.publicKey);
    const assertion = (await navigator.credentials.get({ publicKey })) as
      | (PublicKeyCredential & { toJSON?: () => Record<string, unknown> })
      | null;
    if (!assertion) {
      throw new Error('No passkey was selected.');
    }

    return this.completeAssertion(challenge, assertion);
  }

  /**
   * Starts silent WebAuthn Conditional UI (`mediation: 'conditional'`) for the sign-in form's
   * username input when the browser supports it. Resolves `null` if aborted cleanly.
   */
  async startConditionalUi(): Promise<Me | null> {
    const caps = await this.getCapabilities();
    if (!caps.conditionalGet) {
      return null;
    }

    this.abortConditionalUi();
    const controller = new AbortController();
    this.activeConditionalAbort = controller;

    try {
      const challenge = await firstValueFrom(
        this.http.post<PasskeyChallengeResponse<ServerRequestOptions>>(
          '/api/auth/passkeys/login/options',
          {},
        ),
      );

      if (controller.signal.aborted) {
        return null;
      }

      const pkc = window.PublicKeyCredential as WebAuthnPublicKeyCredential;
      if (typeof pkc.parseRequestOptionsFromJSON !== 'function') {
        return null;
      }

      const publicKey = pkc.parseRequestOptionsFromJSON(challenge.publicKey);
      const assertion = (await navigator.credentials.get({
        publicKey,
        signal: controller.signal,
        mediation: 'conditional',
      })) as (PublicKeyCredential & { toJSON?: () => Record<string, unknown> }) | null;

      if (!assertion || controller.signal.aborted) {
        return null;
      }

      return await this.completeAssertion(challenge, assertion);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      throw err;
    } finally {
      if (this.activeConditionalAbort === controller) {
        this.activeConditionalAbort = null;
      }
    }
  }

  abortConditionalUi(): void {
    if (this.activeConditionalAbort) {
      this.activeConditionalAbort.abort();
      this.activeConditionalAbort = null;
    }
  }

  async signalCurrentUserDetails(
    rpId: string,
    userId: string,
    name: string,
    displayName: string,
  ): Promise<void> {
    const pkc = typeof window !== 'undefined' ? (window.PublicKeyCredential as WebAuthnPublicKeyCredential) : null;
    if (typeof pkc?.signalCurrentUserDetails !== 'function') {
      return;
    }
    try {
      await pkc.signalCurrentUserDetails({ rpId, userId, name, displayName });
    } catch (err) {
      console.warn('WebAuthn signalCurrentUserDetails failed', err);
    }
  }

  // ---------------------------------------------------------------------------- private

  private async completeAssertion(
    challenge: PasskeyChallengeResponse<ServerRequestOptions>,
    assertion: PublicKeyCredential & { toJSON?: () => Record<string, unknown> },
  ): Promise<Me> {
    const credentialJson =
      typeof assertion.toJSON === 'function'
        ? assertion.toJSON()
        : { id: assertion.id, type: assertion.type };

    try {
      const tokens = await firstValueFrom(
        this.http.post<TokenResponse>('/api/auth/passkeys/login/verify', {
          challengeId: challenge.challengeId,
          credential: credentialJson,
        }),
      );
      return await firstValueFrom(this.auth.establishSession(tokens, 'passkey'));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        const rpId = challenge.publicKey.rpId;
        const credId = typeof credentialJson['id'] === 'string' ? credentialJson['id'] : assertion.id;
        if (rpId && credId) {
          await this.signalUnknownCredential(rpId, credId);
        }
      }
      throw err;
    }
  }

  private async signalUnknownCredential(rpId: string, credentialId: string): Promise<void> {
    const pkc = typeof window !== 'undefined' ? (window.PublicKeyCredential as WebAuthnPublicKeyCredential) : null;
    if (typeof pkc?.signalUnknownCredential !== 'function') {
      return;
    }
    try {
      await pkc.signalUnknownCredential({ rpId, credentialId });
    } catch (err) {
      console.warn('WebAuthn signalUnknownCredential failed', err);
    }
  }

  private async signalAllAcceptedCredentials(
    rpId: string,
    userId: string,
    allAcceptedCredentialIds: string[],
  ): Promise<void> {
    const pkc = typeof window !== 'undefined' ? (window.PublicKeyCredential as WebAuthnPublicKeyCredential) : null;
    if (typeof pkc?.signalAllAcceptedCredentials !== 'function') {
      return;
    }
    try {
      await pkc.signalAllAcceptedCredentials({ rpId, userId, allAcceptedCredentialIds });
    } catch (err) {
      console.warn('WebAuthn signalAllAcceptedCredentials failed', err);
    }
  }
}

