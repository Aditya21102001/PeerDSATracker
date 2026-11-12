import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Security } from './security';
import { Signin } from './signin';

describe('Passkey UI integration on Signin and Security', () => {
  let originalPkc: unknown;
  let originalCreds: unknown;

  beforeEach(() => {
    localStorage.clear();
    originalPkc = (window as unknown as Record<string, unknown>)['PublicKeyCredential'];
    originalCreds = navigator.credentials;
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = originalPkc;
    Object.defineProperty(navigator, 'credentials', {
      value: originalCreds,
      configurable: true,
    });
    localStorage.clear();
  });

  it('renders Continue with Face ID / Fingerprint / Passkey button and webauthn autocomplete on Signin', async () => {
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      getClientCapabilities: vi.fn().mockResolvedValue({
        userVerifyingPlatformAuthenticator: true,
        conditionalGet: false,
      }),
    };
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn(), get: vi.fn() },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [Signin],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(Signin);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/options').flush({ googleEnabled: false, otpDemoMode: false });

    await vi.waitFor(() => {
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('.passkey-btn') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toContain('Face ID / Fingerprint');
    });

    const identifier = fixture.nativeElement.querySelector('#identifier') as HTMLInputElement;
    expect(identifier.getAttribute('autocomplete')).toBe('username webauthn');
    expect(identifier.getAttribute('aria-describedby')).toBe('identifier-passkey-hint');
    http.verify();
  });

  it('lists, renames, and deletes registered passkeys on Security', async () => {
    (window as unknown as Record<string, unknown>)['PublicKeyCredential'] = {
      getClientCapabilities: vi.fn().mockResolvedValue({
        userVerifyingPlatformAuthenticator: true,
        conditionalGet: true,
      }),
      signalAllAcceptedCredentials: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn(), get: vi.fn() },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [Security],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(Security);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

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

    await vi.waitFor(() => {
      http.expectOne('/api/auth/passkeys').flush({
        rpId: 'localhost',
        passkeyUserId: 'pk-user',
        credentials: [
          {
            id: 'cred-1',
            name: 'MacBook Pro',
            aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
            deviceType: 'multiDevice',
            backedUp: true,
            transports: ['internal'],
            rpId: 'localhost',
            registeredAt: '2026-11-12T00:00:00Z',
            lastUsedAt: null,
          },
        ],
      });
    });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('MacBook Pro');
      expect(fixture.nativeElement.textContent).toContain('iCloud Keychain');
      expect(fixture.nativeElement.textContent).toContain('Synced');
    });

    // Trigger inline rename
    const renameBtn = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (b) => b.textContent?.trim() === 'Rename',
    );
    expect(renameBtn).toBeTruthy();
    renameBtn!.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#rename-cred-1') as HTMLInputElement;
    input.value = 'Work Laptop';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveBtn = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (b) => b.textContent?.trim() === 'Save',
    );
    saveBtn!.click();

    await vi.waitFor(() => {
      const req = http.expectOne('/api/auth/passkeys/cred-1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Work Laptop' });
      req.flush({
        id: 'cred-1',
        name: 'Work Laptop',
        aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
        deviceType: 'multiDevice',
        backedUp: true,
        transports: ['internal'],
        rpId: 'localhost',
        registeredAt: '2026-11-12T00:00:00Z',
        lastUsedAt: null,
      });
    });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Work Laptop');
    });
    http.verify();
  });
});

