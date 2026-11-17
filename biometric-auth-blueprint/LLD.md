# Low-Level Design (LLD): Biometric & Passkey Authentication System

## 1. Database Schema Design (DDL)

The schema consists of two core tables: `passkey_credentials` (persistent credentials) and `passkey_challenges` (ephemeral single-use nonces).

```sql
-- 1. Passkey Credentials Table
CREATE TABLE passkey_credentials (
    id                            TEXT        PRIMARY KEY, -- Unpadded Base64URL credential ID
    user_id                       BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    passkey_user_id               TEXT        NOT NULL, -- Stable, opaque user handle (Base64URL)
    attested_credential_data_b64  TEXT        NOT NULL, -- Serialized CBOR AttestedCredentialData (public key + AAGUID)
    sign_count                    BIGINT      NOT NULL DEFAULT 0, -- Monotonic anti-replay signature counter
    aaguid                        TEXT        NOT NULL, -- Authenticator Attestation GUID
    name                          TEXT        NOT NULL, -- User-friendly label (e.g. "Pixel Fingerprint")
    device_type                   TEXT        NOT NULL, -- "singleDevice" vs "multiDevice" (synced)
    backed_up                     BOOLEAN     NOT NULL DEFAULT false, -- Authenticator backup status
    uv_initialized                BOOLEAN     NOT NULL DEFAULT false, -- User Verification initialized flag
    transports                    TEXT        NOT NULL DEFAULT '', -- Comma-separated: "internal,hybrid,usb"
    rp_id                         TEXT        NOT NULL, -- Bound Relying Party ID (domain)
    registered_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at                  TIMESTAMPTZ
);

CREATE INDEX idx_passkey_credentials_user ON passkey_credentials (user_id, registered_at DESC);

-- 2. Passkey Challenges Table (Single-Use Nonces)
CREATE TABLE passkey_challenges (
    id                         TEXT        PRIMARY KEY, -- UUID challenge session ID
    user_id                    BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    passkey_user_id            TEXT,
    challenge_b64              TEXT        NOT NULL, -- 32-byte cryptographically secure random nonce
    ceremony                   TEXT        NOT NULL, -- "REGISTRATION" or "AUTHENTICATION"
    expected_user_verification TEXT        NOT NULL, -- "preferred" or "required"
    rp_id                      TEXT        NOT NULL, -- Relying Party ID validated at options time
    origin                     TEXT        NOT NULL, -- Scheme + host + port
    expires_at                 TIMESTAMPTZ NOT NULL, -- Short-lived TTL (e.g. now() + 2 minutes)
    consumed                   BOOLEAN     NOT NULL DEFAULT false,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_passkey_challenges_expires ON passkey_challenges (expires_at);
```

---

## 2. Cryptographic Encodings & Algorithms

### 2.1 Base64URL Encoding (RFC 4648 §5)
All binary buffers passed through WebAuthn JSON must be encoded as unpadded Base64URL:
- Uses `-` instead of `+`
- Uses `_` instead of `/`
- Trailing padding `=` MUST be stripped.

### 2.2 COSE Algorithm Identifiers
The server advertises supported public-key cryptographic algorithms in `pubKeyCredParams`:
| Alg ID | Name | Standard | Usage |
| :--- | :--- | :--- | :--- |
| **`-7`** | **ES256** | ECDSA with SHA-256 over P-256 curve | Standard on iOS, Android, macOS, Windows |
| **`-257`** | **RS256** | RSASSA-PKCS1-v1_5 with SHA-256 | Supported across legacy Windows Hello TPMs |
| **`-8`** | **EdDSA** | Ed25519 | High-security hardware tokens |

---

## 3. Backend REST API Specifications

### Endpoint Overview
| Method | Path | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/passkeys/register/options` | **Yes** (Bearer) | Generates creation options for `navigator.credentials.create` |
| `POST` | `/api/auth/passkeys/register/verify` | **Yes** (Bearer) | Verifies attestation, saves public key, returns `PasskeySummary` |
| `POST` | `/api/auth/passkeys/login/options` | **No** (Public) | Generates request options for `navigator.credentials.get` |
| `POST` | `/api/auth/passkeys/login/verify` | **No** (Public) | Verifies assertion signature, issues JWT session tokens |
| `GET` | `/api/auth/passkeys` | **Yes** (Bearer) | Lists all registered passkeys for the signed-in user |
| `PUT` | `/api/auth/passkeys/{id}` | **Yes** (Bearer) | Renames a passkey |
| `DELETE` | `/api/auth/passkeys/{id}` | **Yes** (Bearer) | Deletes a passkey, triggers Signal API cleanup |

---

### 3.1 `POST /api/auth/passkeys/register/options`
#### Request Payload
```json
{
  "promotion": true
}
```
*Note: `promotion: true` indicates enrollment from dashboard/signin promo; sets `authenticatorAttachment: "platform"` to strictly force device biometrics (fingerprint/face).*

#### Response Payload (`RegisterOptionsResponse`)
```json
{
  "challengeId": "6b2c7e09-e85d-4f01-9a72-74892c551fa0",
  "publicKey": {
    "challenge": "dGVzdC1jaGFsbGVuZ2UtYnl0ZXMtMzItYnl0ZXM",
    "rp": {
      "name": "MyApplication",
      "id": "myapplication.com"
    },
    "user": {
      "id": "dXNlci1pZGVudGlmaWVyLWhhbmRsZQ",
      "name": "ada@example.com",
      "displayName": "Ada Lovelace"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 },
      { "type": "public-key", "alg": -8 }
    ],
    "timeout": 120000,
    "excludeCredentials": [
      { "id": "ZXhpc3RpbmctY3JlZGVudGlhbC1pZA", "type": "public-key", "transports": ["internal"] }
    ],
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "residentKey": "required",
      "requireResidentKey": true,
      "userVerification": "preferred"
    },
    "attestation": "none"
  }
}
```

---

### 3.2 `POST /api/auth/passkeys/login/options`
#### Response Payload (`LoginOptionsResponse`)
```json
{
  "challengeId": "fa8192ca-49d7-4be7-83d8-1123490aafe1",
  "publicKey": {
    "challenge": "bG9naW4tY2hhbGxlbmdlLWJ5dGVzLTMtYnl0ZXM",
    "rpId": "myapplication.com",
    "timeout": 120000,
    "allowCredentials": [],
    "userVerification": "preferred"
  }
}
```
*Note: `allowCredentials: []` enables discoverable credentials (the user does not need to type their username first).*

---

## 4. Verification Algorithms (Backend)

### 4.1 Registration Verification Flow
1. **Challenge Lookup & Invalidation**:
   - Query `passkey_challenges` by `challengeId` and `ceremony = 'REGISTRATION'`.
   - Ensure `consumed = false` and `expires_at > now()`.
   - Mark `consumed = true` immediately within a database transaction.
2. **CBOR Attestation Parsing**:
   - Parse `clientDataJSON` and verify:
     - `type === "webauthn.create"`
     - `challenge` matches the stored challenge string.
     - `origin` matches the expected server origin.
   - Parse `attestationObject` using CBOR decoder.
   - Extract `AuthenticatorData` and `AttestedCredentialData`.
3. **Public Key & AAGUID Extraction**:
   - Extract `credentialId` (byte array -> Base64URL).
   - Ensure `credentialId` does not already exist in `passkey_credentials`.
   - Extract COSE public key bytes and AAGUID.
4. **Persistence**:
   - Save the record with `signCount = authData.getSignCount()`, `deviceType` (`multiDevice` if flag BE is set, else `singleDevice`), and detected transports.

### 4.2 Authentication Verification Flow
1. **Challenge Lookup & Invalidation**:
   - Query `passkey_challenges` by `challengeId` and `ceremony = 'AUTHENTICATION'`.
   - Validate expiration and mark consumed.
2. **Credential Lookup**:
   - Look up credential in `passkey_credentials` using the assertion's `id`.
   - If not found, return HTTP 404 (allows client to call `signalUnknownCredential`).
3. **Cryptographic Signature Verification**:
   - Verify `clientDataJSON`: `type === "webauthn.get"`.
   - Concatenate `authenticatorData` bytes + SHA-256(`clientDataJSON` bytes).
   - Verify the signature using the stored public key.
4. **Anti-Replay Counter Check**:
   - If `credential.deviceType === "singleDevice"`:
     - Verify `authData.getSignCount() > credential.getSignCount()`.
   - Update `sign_count = authData.getSignCount()` and `last_used_at = now()`.
5. **Session Granting**:
   - Load associated `User` and issue authentication tokens.

---

## 5. Client-Side Implementation Architecture (Browser)

### 5.1 Capability Detection & Polyfills
Before invoking WebAuthn, verify client support:
```typescript
async function checkCapabilities(): Promise<{ supported: boolean; platform: boolean; conditional: boolean }> {
  if (!window.PublicKeyCredential) {
    return { supported: false, platform: false, conditional: false };
  }
  const [platform, conditional] = await Promise.all([
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? false,
    PublicKeyCredential.isConditionalMediationAvailable?.() ?? false,
  ]);
  return { supported: true, platform, conditional };
}
```

### 5.2 Easy JSON Serialization
Load `webauthn-polyfills` so modern methods `PublicKeyCredential.parseCreationOptionsFromJSON`, `PublicKeyCredential.parseRequestOptionsFromJSON`, and `credential.toJSON()` are universally available.

### 5.3 Exception Handling Matrix
| Exception Name | Root Cause | User Handling |
| :--- | :--- | :--- |
| `NotAllowedError` | User dismissed or cancelled the biometric prompt | Silent return or helpful hint |
| `InvalidStateError` | Credential already exists on this device (`excludeCredentials`) | Display: "Biometrics already active on this device" |
| `AbortError` | Operation cancelled programmatically (e.g. conditional UI superseded) | Ignore silently |
| `SecurityError` | RP ID or HTTPS context mismatch | Log configuration error |

### 5.4 Signal API Synchronization
When credentials are deleted on the server or verification fails, synchronize external password managers:
```typescript
if ('signalUnknownCredential' in window.PublicKeyCredential) {
  await PublicKeyCredential.signalUnknownCredential({
    rpId: serverRpId,
    credentialId: failedCredId,
  });
}
```
