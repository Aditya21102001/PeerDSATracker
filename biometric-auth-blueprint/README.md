# Biometric & Passkey Authentication Blueprint

A complete, production-ready implementation package for passwordless **Biometric (Fingerprint & Face ID) & Passkey Authentication** built on **W3C WebAuthn Level 3** and **FIDO2**.

Use this package to replicate and implement this feature in any other project.

---

## 📁 Package Structure

```
biometric-auth-blueprint/
├── README.md                      # This guide
├── HLD.md                         # High-Level Design (Architecture, Security Model, Ceremonies)
├── LLD.md                         # Low-Level Design (Database Schema DDL, API Contracts, Verification Algorithms)
├── IMPLEMENTATION_PROMPT.md       # Master AI Prompt (Copy-paste into Cursor, Claude Code, Antigravity)
└── code-reference/
    ├── backend/
    │   ├── pom-dependency.xml     # WebAuthn4J Core Maven dependency
    │   ├── migration/
    │   │   └── V23__passkeys.sql  # Complete PostgreSQL schema migration
    │   ├── PasskeyProperties.java # Configuration properties (RP ID, RP Name, TTL)
    │   ├── PasskeyCredential.java # JPA Entity for registered passkeys
    │   ├── PasskeyChallenge.java  # JPA Entity for single-use cryptographic nonces
    │   ├── PasskeyCredentialRepository.java
    │   ├── PasskeyChallengeRepository.java
    │   ├── PasskeyDtos.java       # Complete request/response records
    │   ├── PasskeyService.java    # Full cryptographic verification & options generation
    │   └── PasskeyController.java# REST endpoints under /api/auth/passkeys
    └── frontend/
        ├── passkey.models.ts      # TypeScript interfaces
        ├── aaguid-registry.ts     # Provider metadata lookup (Google, Apple, Microsoft, YubiKey)
        ├── passkey.service.ts     # Client WebAuthn service with Signal API & Polyfills
        ├── signin-biometric-button.html # Sign-In page button & Conditional UI markup
        ├── security-panel.html    # Account settings biometric enrollment & management
        └── biometric-auth.scss    # Responsive styling & flexbox overflow protection
```

---

## 🚀 Quick Start Guide

### Step 1: Run the Database Migration
Execute `code-reference/backend/migration/V23__passkeys.sql` in your database. This creates:
- `passkey_credentials`: stores the public keys and monotonic signature counters.
- `passkey_challenges`: tracks 32-byte single-use challenges with expiration.

### Step 2: Add Backend Dependencies & Logic
1. Add `com.webauthn4j:webauthn4j-core:0.29.1.RELEASE` to your `pom.xml` (or `package.json` for Node.js).
2. Copy the Java classes from `code-reference/backend/` into your authentication module.
3. In your Spring Security config (or equivalent middleware), ensure:
   - `/api/auth/passkeys/login/options` and `/api/auth/passkeys/login/verify` are **public**.
   - Registration and management endpoints require an **active authenticated session**.

### Step 3: Implement Frontend Service & Polyfills
1. Install polyfills: `npm install webauthn-polyfills`.
2. Import `import 'webauthn-polyfills';` in `main.ts` so JSON serialization methods (`parseCreationOptionsFromJSON`, `toJSON`) work across all browsers.
3. Copy `passkey.service.ts` and `aaguid-registry.ts` into your core services.

### Step 4: Add UI Components & Styles
1. In your login component, embed `signin-biometric-button.html` and add `autocomplete="username webauthn"` to the username input.
2. In your account settings component, embed `security-panel.html`.
3. Include `biometric-auth.scss` to guarantee zero flexbox overflow on narrow screens.

---

## 🤖 Using the Master Prompt
To generate the feature automatically in another application using an AI coding assistant, copy the entire content of [`IMPLEMENTATION_PROMPT.md`](./IMPLEMENTATION_PROMPT.md) and paste it into your assistant.
