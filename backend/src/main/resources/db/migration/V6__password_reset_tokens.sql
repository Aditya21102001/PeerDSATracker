-- Password reset. Same discipline as refresh_tokens: only the SHA-256 of the token
-- is stored, so a database leak cannot be replayed against /api/auth/reset.
--
-- A token is single-use (used_at) and short-lived (expires_at). Consuming one revokes
-- every refresh token for that user, because a reset is exactly the case where the
-- old sessions may belong to whoever compromised the account.

CREATE TABLE password_reset_tokens (
    id         bigserial PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Supports both "find this user's recent requests" (rate limiting) and cleanup.
CREATE INDEX idx_prt_user_created ON password_reset_tokens (user_id, created_at DESC);
