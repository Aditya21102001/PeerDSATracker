-- A user_problem_status row exists whenever the user has *any* relationship with
-- a problem: a status, a star, or a scheduled revision. Starring an otherwise
-- untouched problem needs a row with no status, so status becomes nullable.
--
-- The V1 CHECK (status IN ('SOLVED','ATTEMPTED','REVISIT')) still holds: a CHECK
-- evaluates to NULL (not false) for a NULL value, so NULL passes.

ALTER TABLE user_problem_status ALTER COLUMN status DROP NOT NULL;

-- A row with neither a status nor a star is meaningless; it should have been deleted.
ALTER TABLE user_problem_status
    ADD CONSTRAINT chk_ups_not_empty CHECK (status IS NOT NULL OR is_starred);
