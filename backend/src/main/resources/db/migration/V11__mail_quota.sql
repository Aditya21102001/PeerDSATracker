-- How many emails have actually been sent today.
--
-- The digest runs twice a day now, and the send cap has to be a *daily* budget rather than a
-- per-run one -- otherwise two runs of 200 quietly become 400 against a provider allowance of 300.
-- Exceeding it does not merely truncate the digest: the same allowance carries one-time sign-in
-- codes, so a greedy morning run would leave people unable to sign in for the rest of the day.
--
-- Persisted rather than counted in memory because Render's free tier restarts instances freely,
-- and an in-memory counter resets to zero on every restart -- which is precisely the situation
-- where it would let the budget be spent twice.
CREATE TABLE mail_quota (
    day  date    PRIMARY KEY,
    sent integer NOT NULL DEFAULT 0
);
