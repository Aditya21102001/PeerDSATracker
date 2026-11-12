-- WebAuthn / Passkey credentials and single-use ceremony challenges.

CREATE TABLE passkey_credentials (
    id                            text        PRIMARY KEY,
    user_id                       bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    passkey_user_id               text        NOT NULL,
    attested_credential_data_b64  text        NOT NULL,
    sign_count                    bigint      NOT NULL DEFAULT 0,
    aaguid                        text        NOT NULL,
    name                          text        NOT NULL,
    device_type                   text        NOT NULL,
    backed_up                     boolean     NOT NULL DEFAULT false,
    uv_initialized                boolean     NOT NULL DEFAULT false,
    transports                    text        NOT NULL DEFAULT '',
    rp_id                         text        NOT NULL,
    registered_at                 timestamptz NOT NULL DEFAULT now(),
    last_used_at                  timestamptz
);

CREATE INDEX idx_passkey_credentials_user ON passkey_credentials (user_id, registered_at DESC);

CREATE TABLE passkey_challenges (
    id                         text        PRIMARY KEY,
    user_id                    bigint      REFERENCES users (id) ON DELETE CASCADE,
    passkey_user_id            text,
    challenge_b64              text        NOT NULL,
    ceremony                   text        NOT NULL,
    expected_user_verification text        NOT NULL,
    rp_id                      text        NOT NULL,
    origin                     text        NOT NULL,
    expires_at                 timestamptz NOT NULL,
    consumed                   boolean     NOT NULL DEFAULT false,
    created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passkey_challenges_expires ON passkey_challenges (expires_at);
