-- Direct messages between peers.
--
-- One row per PAIR, not per direction. The two participant columns are stored in canonical order
-- (lower id first) and the CHECK enforces it, so the UNIQUE below makes "exactly one conversation
-- per pair" a database guarantee rather than something the service has to remember. Without it,
-- two people opening a thread at the same moment create two conversations and each sees half the
-- messages -- a race that is very hard to reproduce and very confusing to receive.
CREATE TABLE dm_conversations (
    id              bigserial PRIMARY KEY,
    user_lo_id      bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_hi_id      bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    -- Unread counts are derived from these rather than stored, so they cannot drift out of step
    -- with the messages they describe. Null means "never opened it".
    lo_last_read_at timestamptz,
    hi_last_read_at timestamptz,

    -- Denormalised so the conversation list can sort without touching dm_messages.
    last_message_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_dm_pair_ordered CHECK (user_lo_id < user_hi_id),
    CONSTRAINT uq_dm_pair UNIQUE (user_lo_id, user_hi_id)
);

-- "My conversations, most recent first" is the only way this table is ever read, and a participant
-- can be on either side of the pair -- hence two indexes rather than one.
CREATE INDEX idx_dm_conv_lo ON dm_conversations (user_lo_id, last_message_at DESC);
CREATE INDEX idx_dm_conv_hi ON dm_conversations (user_hi_id, last_message_at DESC);

CREATE TABLE dm_messages (
    id              bigserial PRIMARY KEY,
    conversation_id bigint      NOT NULL REFERENCES dm_conversations (id) ON DELETE CASCADE,
    sender_id       bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Length is capped in the DTO, not here: a CHECK would reject the write with a 500 after the
    -- request had already been accepted, where validation rejects it with a 400 and a message.
    body            text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Reading a thread is always "newest first, from this conversation".
CREATE INDEX idx_dm_messages_conv ON dm_messages (conversation_id, created_at DESC);
