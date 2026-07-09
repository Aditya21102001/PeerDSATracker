-- V1 typed users.email/username as citext for case-insensitive uniqueness.
-- citext reports as Types#OTHER over JDBC, and Hibernate's ddl-auto=validate
-- rejects that against a String field ("found [citext (Types#OTHER)], but
-- expecting [varchar]").
--
-- Convert to plain text and keep the case-insensitive uniqueness with unique
-- indexes on lower(...). Spring Data's findByEmailIgnoreCase / existsBy...IgnoreCase
-- emit lower(email) = lower(?), which these indexes serve directly.
--
-- The citext extension is intentionally left installed: dropping it adds failure
-- modes for no benefit, and it costs nothing unused.

-- Postgres auto-names a column-level UNIQUE constraint <table>_<column>_key.
-- These are case-sensitive once the column becomes text, so they must go.
ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users DROP CONSTRAINT users_username_key;

-- citext is binary-coercible to text, so no USING clause is needed.
ALTER TABLE users ALTER COLUMN email TYPE text;
ALTER TABLE users ALTER COLUMN username TYPE text;

CREATE UNIQUE INDEX uq_users_email_lower    ON users (lower(email));
CREATE UNIQUE INDEX uq_users_username_lower ON users (lower(username));
