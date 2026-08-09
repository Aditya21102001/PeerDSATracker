-- Whether the account's owner ever picked their own username.
--
-- An account provisioned through Google is given a generated one (derived from the email's local
-- part) because the column is NOT NULL and something has to go there. Its owner has never seen
-- that name -- and sign-in asks for a username -- so the SPA prompts them to confirm or change it
-- on first arrival. This flag is what tells it to.
--
-- DEFAULT true, so every existing account is treated as having chosen already and nobody is
-- prompted retroactively. Only OAuthSignInService writes false.
ALTER TABLE users ADD COLUMN username_chosen boolean NOT NULL DEFAULT true;
