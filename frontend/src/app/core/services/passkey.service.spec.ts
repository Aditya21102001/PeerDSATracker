import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePasskeyProvider } from './aaguid-registry';
import { LastSignInService } from './last-sign-in.service';
import { PasskeyService } from './passkey.service';

describe('PasskeyService', () => {
  let service: PasskeyService;
  let http: HttpTestingController;
  let originalPkc: unknown;
  let originalCreds: unknown;

  beforeEach(() => {
    localStorage.clear();
    originalPkc = (window as unknown as Record<string, unknown>)['PublicKeyCredential'];
    originalCreds = navigator.credentials;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(PasskeyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = originalPkc;
    Object.defineProperty(navigator, 'credentials', {
      value: originalCreds,
      configurable: true,
    });
    localStorage.clear();
  });

  it('detects capabilities using PublicKeyCredential.getClientCapabilities()', async () => {
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      getClientCapabilities: vi.fn().mockResolvedValue({
        userVerifyingPlatformAuthenticator: true,
        conditionalGet: true,
      }),
    };
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn(), get: vi.fn() },
      configurable: true,
    });

    const caps = await service.getCapabilities();
    expect(caps).toEqual({
      webAuthnSupported: true,
      platformAuthenticator: true,
      conditionalGet: true,
    });
  });

  it('registers a passkey using parseCreationOptionsFromJSON and credential.toJSON()', async () => {
    const parsedOptions = { rp: { id: 'localhost', name: 'PeerDSATracker' } };
    const parseCreationOptionsFromJSON = vi.fn().mockReturnValue(parsedOptions);
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      parseCreationOptionsFromJSON,
    };
    const createSpy = vi.fn().mockResolvedValue({
      id: 'cred-abc',
      type: 'public-key',
      toJSON: () => ({ id: 'cred-abc', rawId: 'cred-abc', type: 'public-key', response: {} }),
    });
    Object.defineProperty(navigator, 'credentials', {
      value: { create: createSpy },
      configurable: true,
    });

    const regPromise = service.registerPasskey({ promotion: false, name: 'Laptop' });

    await vi.waitFor(() => {
      const optReq = http.expectOne('/api/auth/passkeys/register/options');
      expect(optReq.request.body).toEqual({ promotion: false });
      optReq.flush({
        challengeId: 'ch-1',
        publicKey: {
          challenge: 'abc',
          rp: { id: 'localhost', name: 'PeerDSATracker' },
          user: { id: 'uid', name: 'ada', displayName: 'Ada' },
        },
      });
    });

    await vi.waitFor(() => {
      const verifyReq = http.expectOne('/api/auth/passkeys/register/verify');
      expect(verifyReq.request.body).toMatchObject({ challengeId: 'ch-1', name: 'Laptop' });
      verifyReq.flush({
        id: 'cred-abc',
        name: 'Laptop',
        aaguid: '00000000-0000-0000-0000-000000000000',
        deviceType: 'multiDevice',
        backedUp: true,
        transports: ['internal'],
        rpId: 'localhost',
        registeredAt: '2026-11-12T00:00:00Z',
        lastUsedAt: null,
      });
    });

    const summary = await regPromise;
    expect(summary.id).toBe('cred-abc');
    expect(parseCreationOptionsFromJSON).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith({ publicKey: parsedOptions });
  });

  it('calls signalUnknownCredential when sign-in verify returns 404 without deriving rpId from location', async () => {
    const signalUnknownCredential = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      parseRequestOptionsFromJSON: vi.fn().mockReturnValue({ rpId: 'auth.peerdsa.test' }),
      signalUnknownCredential,
    };
    Object.defineProperty(navigator, 'credentials', {
      value: {
        get: vi.fn().mockResolvedValue({
          id: 'stale-cred',
          type: 'public-key',
          toJSON: () => ({ id: 'stale-cred', type: 'public-key', response: {} }),
        }),
      },
      configurable: true,
    });

    const signInPromise = service.signInWithPasskey();

    await vi.waitFor(() => {
      http.expectOne('/api/auth/passkeys/login/options').flush({
        challengeId: 'ch-login',
        publicKey: { challenge: 'xyz', rpId: 'auth.peerdsa.test', allowCredentials: [] },
      });
    });

    await vi.waitFor(() => {
      http
        .expectOne('/api/auth/passkeys/login/verify')
        .flush({ message: 'Passkey was deleted' }, { status: 404, statusText: 'Not Found' });
    });

    await expect(signInPromise).rejects.toMatchObject({ status: 404 });
    expect(signalUnknownCredential).toHaveBeenCalledWith({
      rpId: 'auth.peerdsa.test',
      credentialId: 'stale-cred',
    });
  });

  it('calls signalAllAcceptedCredentials when listing and deleting passkeys', async () => {
    const signalAllAcceptedCredentials = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      signalAllAcceptedCredentials,
    };

    const listPromise = service.listPasskeys();
    http.expectOne('/api/auth/passkeys').flush({
      rpId: 'peerdsa.example',
      passkeyUserId: 'pk-user-1',
      credentials: [
        {
          id: 'c1',
          name: 'iPhone',
          aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
          deviceType: 'multiDevice',
          backedUp: true,
          transports: ['internal'],
          rpId: 'peerdsa.example',
          registeredAt: '2026-11-12T00:00:00Z',
          lastUsedAt: null,
        },
      ],
    });
    await listPromise;

    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: 'peerdsa.example',
      userId: 'pk-user-1',
      allAcceptedCredentialIds: ['c1'],
    });

    const delPromise = service.deletePasskey('c1');
    http.expectOne('/api/auth/passkeys/c1').flush({
      rpId: 'peerdsa.example',
      passkeyUserId: 'pk-user-1',
      remainingCredentialIds: [],
    });
    await delPromise;

    expect(signalAllAcceptedCredentials).toHaveBeenLastCalledWith({
      rpId: 'peerdsa.example',
      userId: 'pk-user-1',
      allAcceptedCredentialIds: [],
    });
  });

  it('signs in with Conditional UI and remembers passkey as last sign-in method', async () => {
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      getClientCapabilities: vi.fn().mockResolvedValue({
        userVerifyingPlatformAuthenticator: true,
        conditionalGet: true,
      }),
      parseRequestOptionsFromJSON: vi.fn().mockReturnValue({ rpId: 'localhost' }),
    };
    const getSpy = vi.fn().mockResolvedValue({
      id: 'cred-1',
      type: 'public-key',
      toJSON: () => ({ id: 'cred-1', type: 'public-key', response: {} }),
    });
    Object.defineProperty(navigator, 'credentials', {
      value: { get: getSpy },
      configurable: true,
    });

    const conditionalPromise = service.startConditionalUi();

    await vi.waitFor(() => {
      http.expectOne('/api/auth/passkeys/login/options').flush({
        challengeId: 'ch-cond',
        publicKey: { challenge: 'xyz', rpId: 'localhost', allowCredentials: [] },
      });
    });

    await vi.waitFor(() => {
      http.expectOne('/api/auth/passkeys/login/verify').flush({
        accessToken: 'jwt',
        refreshToken: 'ref',
        expiresInSeconds: 900,
      });
    });

    await vi.waitFor(() => {
      http.expectOne('/api/auth/me').flush({
        id: 1,
        email: 'ada@example.com',
        username: 'ada',
        displayName: 'Ada',
        hasPassword: true,
        usernameChosen: true,
        xp: 0,
        totalSolved: 0,
        currentStreak: 0,
        longestStreak: 0,
      });
    });

    const me = await conditionalPromise;
    expect(me?.username).toBe('ada');
    expect(getSpy.mock.calls[0][0]).toMatchObject({ mediation: 'conditional' });
    expect(TestBed.inject(LastSignInService).lastMethod()).toBe('passkey');
  });

  it('gracefully handles zero AAGUID without claiming an unknown provider', () => {
    expect(resolvePasskeyProvider('00000000-0000-0000-0000-000000000000', 'multiDevice')).toEqual({
      name: 'Synced Passkey',
      badge: 'key',
    });
    expect(resolvePasskeyProvider('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4')).toEqual({
      name: 'Google Password Manager',
      badge: 'google',
    });
  });
});

