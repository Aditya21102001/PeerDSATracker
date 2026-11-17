/** WebAuthn / Passkey TypeScript models */

export interface PasskeySummary {
  id: string;
  name: string;
  aaguid: string;
  deviceType: 'singleDevice' | 'multiDevice' | string;
  backedUp: boolean;
  transports: string[];
  rpId: string;
  registeredAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyListResponse {
  rpId: string;
  passkeyUserId: string;
  credentials: PasskeySummary[];
}

export interface DeletePasskeyResponse {
  rpId: string;
  passkeyUserId: string;
  remainingCredentialIds: string[];
}

export interface PasskeyChallengeResponse<T = unknown> {
  challengeId: string;
  publicKey: T;
}
