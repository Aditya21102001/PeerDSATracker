-- One-time email codes, passwordless (Google) accounts, and the absolute session cap.

-- Only the SHA-256 of a code is stored, never the code. Note text, not citext: V3 had to
-- convert users.email away from citext because it reports as Types#OTHER over JDBC and
-- ddl-auto=validate rejects it against a String field. Case-insensitivity comes from the
-- lower(email) index below, and OtpService normalises to lowercase before it writes.
--
-- code_hash is NULLABLE on purpose. A row outlives its secret: the hash is nulled the
-- instant the code is consumed or superseded, so the credential is destroyed while the
-- (address, timestamp) audit row survives to count against the per-destination rate limit.
-- Deleting the row instead would let anyone reset their own rate-limit budget by burning a
-- code, and would leave requests for unregistered addresses uncounted entirely -- which is
-- an account-enumeration oracle, because only registered addresses could ever be throttled.
-- A NULL never equals the hash of any code, so a spent row cannot be replayed.
CREATE TABLE otp_codes (
    id         bigserial PRIMARY KEY,
    email      text        NOT NULL,
    code_hash  text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Serves both the rate-limit count and the (email, code) verification lookup.
--
-- Plain (email, ...), NOT lower(email): OtpService normalises to lowercase before every read and
-- every write, so the stored values are already lowercase and the queries compare them directly.
-- A functional index on lower(email) would simply never be used by `where email = ?`.
CREATE INDEX idx_otp_codes_email_created ON otp_codes (email, created_at DESC);

-- An account created through Google has never had a password. Everything reading
-- password_hash must now treat NULL as "cannot sign in with a password" rather than handing
-- it to the encoder, which throws instead of returning false.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Sliding refresh-token expiry renews itself forever without this. session_started_at is
-- set once, when the session is created, and copied unchanged onto every rotation, so the
-- chain always carries the instant the user actually proved who they were.
ALTER TABLE refresh_tokens ADD COLUMN session_started_at timestamptz;
UPDATE refresh_tokens SET session_started_at = created_at WHERE session_started_at IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN session_started_at SET NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN session_started_at SET DEFAULT now();
