export interface PasskeyProviderMeta {
  name: string;
  badge: 'apple' | 'google' | 'microsoft' | 'key' | 'vault';
}

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';

/**
 * Curated subset of well-known authenticator AAGUIDs mapped to human-friendly provider names.
 * Never looks up the all-zero AAGUID; unknown AAGUIDs fall back to generic device/passkey copy.
 */
const PROVIDERS: Record<string, PasskeyProviderMeta> = {
  // Google Password Manager / Chrome / Android
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': { name: 'Google Password Manager', badge: 'google' },
  'bada5566-a7aa-401f-bd96-45619a55120d': { name: 'Chrome on Android', badge: 'google' },
  'adce0002-35bc-c60a-648b-0b25f1f05503': { name: 'Chrome Touch ID', badge: 'google' },
  // Apple iCloud Keychain / Touch ID / Face ID
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': { name: 'iCloud Keychain', badge: 'apple' },
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': { name: 'iCloud Keychain', badge: 'apple' },
  // Microsoft Windows Hello
  '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello', badge: 'microsoft' },
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { name: 'Windows Hello', badge: 'microsoft' },
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { name: 'Windows Hello', badge: 'microsoft' },
  // Password managers
  'bada5566-a7aa-401f-bd96-45619a55120e': { name: '1Password', badge: 'vault' },
  'bada5566-a7aa-401f-bd96-45619a55120f': { name: '1Password', badge: 'vault' },
  'd548826e-79b4-db40-a3d8-11116f7e8349': { name: 'Bitwarden', badge: 'vault' },
  '531126d6-e717-415c-9320-3d9aa6981239': { name: 'Dashlane', badge: 'vault' },
  'b5397666-4885-aa6b-cebf-e52262a439a2': { name: 'Chrome Sync', badge: 'google' },
  'de1e552d-db1d-4423-a619-566b625cdc84': { name: 'Proton Pass', badge: 'vault' },
  'f3809540-7f14-49c7-a8b3-8f813b225541': { name: 'Keeper', badge: 'vault' },
  '50726f74-6f6e-5061-7373-506173736b65': { name: 'Proton Pass', badge: 'vault' },
  // Security keys (Yubico)
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': { name: 'YubiKey 5 Series', badge: 'key' },
  '73bb0cd4-e502-49b8-9c6f-b59445bf720b': { name: 'YubiKey Bio', badge: 'key' },
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': { name: 'YubiKey 5 Series', badge: 'key' },
};

/** Resolves display metadata for an authenticator AAGUID, ignoring the zero AAGUID safely. */
export function resolvePasskeyProvider(aaguid: string | null | undefined, deviceType?: string): PasskeyProviderMeta {
  const normalized = (aaguid ?? '').trim().toLowerCase();
  if (normalized && normalized !== ZERO_AAGUID && PROVIDERS[normalized]) {
    return PROVIDERS[normalized];
  }
  return {
    name: deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device Biometric / Key',
    badge: 'key',
  };
}

