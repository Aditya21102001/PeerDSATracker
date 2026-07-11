-- AI assistant chat, persisted per user. A conversation owns an ordered list of messages;
-- deleting a user or a conversation cascades to its messages so no orphan rows survive.
--
-- Only 'user' and 'assistant' messages are stored. The system prompt is injected at call
-- time from configuration, never persisted -- so changing it later takes effect immediately
-- and a stored history cannot pin an old prompt.

CREATE TABLE chat_conversations (
    id         bigserial PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title      text        NOT NULL DEFAULT 'New chat',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The widget lists a user's conversations most-recently-active first.
CREATE INDEX idx_chat_conv_user_updated ON chat_conversations (user_id, updated_at DESC);

CREATE TABLE chat_messages (
    id              bigserial PRIMARY KEY,
    conversation_id bigint      NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
    role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Messages are always read in insertion order within one conversation; the serial id is that order.
CREATE INDEX idx_chat_msg_conversation ON chat_messages (conversation_id, id);
