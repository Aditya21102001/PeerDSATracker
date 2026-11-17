# Production AI Implementation Prompt: Biometric & Passkey Login

> **How to use this file:**  
> Copy and paste the entire prompt below into your AI coding assistant (Antigravity, Cursor, Claude Code, GitHub Copilot) in your target project. It will instruct the AI to generate the complete backend, database migration, and frontend integration.

```markdown
You are an expert full-stack security engineer. Implement a complete, production-ready Biometric and Passkey (WebAuthn Level 3 / FIDO2) authentication system in this application.

### Core Objectives:
1. Allow users to register their physical device biometrics (Windows Hello fingerprint/face, Android BiometricPrompt, Apple Touch ID / Face ID, or security keys).
2. Allow passwordless sign-in with biometrics on the login page via both an explicit "Sign in with Face ID / Fingerprint" button and seamless Discoverable Autofill (Conditional UI).
3. Provide an Account Security management page to view enrolled passkeys (with human-readable provider badges, e.g., Google Password Manager, iCloud Keychain, Windows Hello), rename them, and delete them.
4. Support the WebAuthn Signal API to synchronize credential states with external password managers.

---

### Step 1: Database Schema Migration
Create a database migration with two tables:
1. `passkey_credentials`:
   - `id` (VARCHAR/TEXT, PRIMARY KEY): Base64URL-encoded credential ID.
   - `user_id` (BIGINT/UUID, NOT NULL): Foreign key to the user table (ON DELETE CASCADE).
   - `passkey_user_id` (TEXT, NOT NULL): Stable, opaque user handle (Base64URL).
   - `attested_credential_data_b64` (TEXT, NOT NULL): Serialized CBOR AttestedCredentialData containing public key and AAGUID.
   - `sign_count` (BIGINT, DEFAULT 0): Monotonic signature counter for anti-replay protection.
   - `aaguid` (TEXT, NOT NULL): Authenticator Attestation GUID.
   - `name` (TEXT, NOT NULL): Friendly label (e.g. "Device Fingerprint / Biometric").
   - `device_type` (TEXT, NOT NULL): "singleDevice" or "multiDevice".
   - `backed_up` (BOOLEAN, DEFAULT FALSE): Backup eligibility/state.
   - `uv_initialized` (BOOLEAN, DEFAULT FALSE): User verification flag.
   - `transports` (TEXT, DEFAULT ''): Comma-separated transport strings ("internal,hybrid").
   - `rp_id` (TEXT, NOT NULL): Relying Party ID.
   - `registered_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
   - `last_used_at` (TIMESTAMPTZ, NULL).
   - Index on `(user_id, registered_at DESC)`.

2. `passkey_challenges`:
   - `id` (VARCHAR/TEXT, PRIMARY KEY): Random UUID.
   - `user_id` (BIGINT/UUID, NULLABLE): Set during registration ceremonies.
   - `passkey_user_id` (TEXT, NULLABLE): Stored during registration to ensure handle consistency.
   - `challenge_b64` (TEXT, NOT NULL): 32-byte cryptographically secure random challenge.
   - `ceremony` (TEXT, NOT NULL): "REGISTRATION" or "AUTHENTICATION".
   - `expected_user_verification` (TEXT, NOT NULL): "preferred" or "required".
   - `rp_id` (TEXT, NOT NULL): Validated Relying Party ID.
   - `origin` (TEXT, NOT NULL): Verified ceremony origin.
   - `expires_at` (TIMESTAMPTZ, NOT NULL): Expiration time (now + 2 minutes).
   - `consumed` (BOOLEAN, NOT NULL DEFAULT FALSE).
   - `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT now()).
   - Index on `expires_at`.

---

### Step 2: Backend Implementation
1. **Dependencies**:
   - For Java/Spring Boot: Add `com.webauthn4j:webauthn4j-core` (or equivalent vetted FIDO2 library in Node/Python/Go).
2. **Configuration**:
   - Configure Relying Party properties: `rpName`, `rpId` (defaults to server request host), and `challengeTtl` (2–5 minutes).
3. **Endpoints (`/api/auth/passkeys`)**:
   - `POST /register/options` (Authenticated):
     - Takes `{ promotion: boolean }`.
     - When `promotion: true`, sets `authenticatorAttachment: "platform"` to strictly force device biometrics (fingerprint/face).
     - Maps user's existing credentials to `excludeCredentials` to prevent duplicates.
     - Saves challenge and returns `CreationOptionsPublicKey`.
   - `POST /register/verify` (Authenticated):
     - Validates and consumes single-use challenge.
     - Verifies CBOR attestation object, extracts public key, saves to `passkey_credentials`.
   - `POST /login/options` (Public):
     - Issues 32-byte challenge with `allowCredentials: []` (discoverable credentials) and `userVerification: "preferred"`.
   - `POST /login/verify` (Public):
     - Validates challenge.
     - Loads credential by ID; returns HTTP 404 if not found (so client can call `signalUnknownCredential`).
     - Verifies assertion signature using stored public key and WebAuthn4J.
     - Enforces anti-replay check on `signCount`.
     - Issues standard application JWT / session tokens.
   - `GET /` (Authenticated): Lists user credentials with AAGUID metadata.
   - `PUT /{id}` (Authenticated): Renames passkey.
   - `DELETE /{id}` (Authenticated): Removes passkey and returns remaining IDs for Signal API sync.

---

### Step 3: Frontend Implementation
1. **Dependencies & Polyfills**:
   - Install/import `webauthn-polyfills` so `PublicKeyCredential.parseCreationOptionsFromJSON`, `parseRequestOptionsFromJSON`, and `credential.toJSON()` work in all browsers.
2. **Service (`PasskeyService`)**:
   - Feature detection: Gate biometric UI with `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` and `PublicKeyCredential.isConditionalMediationAvailable()`.
   - Provide `registerPasskey({ promotion: true })`:
     - Calls `navigator.credentials.create()`.
     - Handles `InvalidStateError` gracefully (informing user that biometrics are already registered on this device).
     - Handles `NotAllowedError` (user cancellation).
   - Provide `signInWithPasskey()`:
     - Calls `navigator.credentials.get()`.
   - Provide `startConditionalUi()`:
     - Calls `navigator.credentials.get({ mediation: 'conditional', signal })` with an `AbortController`.
   - Implement Signal API methods:
     - `signalUnknownCredential(rpId, credentialId)`
     - `signalAllAcceptedCredentials(rpId, passkeyUserId, remainingIds)`
     - `signalCurrentUserDetails(rpId, passkeyUserId, name, displayName)`
3. **Sign-In Page UI**:
   - Dedicated button: `[ 👆 Sign in with Face ID / Fingerprint ]`.
   - Username input: Add `autocomplete="username webauthn"` to trigger the native biometric autofill dropdown.
   - Responsive CSS: Ensure button uses `white-space: normal`, `line-height: 1.35`, and `text-wrap: balance` so the fingerprint SVG icon does not overflow on narrow mobile screens.
4. **Account Security Page UI**:
   - Show status banner when active: `✓ Biometric sign-in is active on your account`.
   - Button text: Dynamically switch between `Enable Face ID / Fingerprint` (if 0 passkeys) and `Add Another Device (Face ID / Fingerprint)` (if ≥ 1 passkeys).
   - List credentials with readable provider names (Google Password Manager, iCloud Keychain, Windows Hello, YubiKey) based on their AAGUID.
```
