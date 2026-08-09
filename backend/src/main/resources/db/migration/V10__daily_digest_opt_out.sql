-- Opt-out for the daily digest.
--
-- Defaults to true, so existing accounts start subscribed -- this is a study tracker people
-- signed up to be nudged by, and the nudge is the product. But bulk mail without a working
-- unsubscribe is how a sending domain gets blocked: recipients who cannot opt out press
-- "spam" instead, and Brevo suspends accounts on complaint rate rather than on intent.
--
-- Cleared from two places: the in-app toggle, and the one-click link in every digest footer
-- (MailUnsubscribeController), which needs no password and no session -- somebody who has
-- abandoned the account is exactly the person most likely to report it as spam.
ALTER TABLE users ADD COLUMN email_digest boolean NOT NULL DEFAULT true;

-- The digest run selects every subscribed user with an address, once a day. Partial index
-- because the unsubscribed are the rows it never wants and they need not be indexed at all.
CREATE INDEX idx_users_email_digest ON users (id) WHERE email_digest;
