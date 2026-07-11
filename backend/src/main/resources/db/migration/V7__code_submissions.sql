-- Per-problem code drafts. One row per (user, problem, language) so a user's C++ and Python
-- attempts at the same problem are kept independently and reload when they return.
--
-- This stores only the source the user last saved; running it is stateless and goes to the
-- Piston sandbox via the analytics service, so nothing about a run is persisted here.

CREATE TABLE code_submissions (
    id         bigserial   PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    problem_id bigint      NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    -- Piston language id (e.g. 'python', 'c++', 'java'), not a display label.
    language   text        NOT NULL,
    source     text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_code_user_problem_lang UNIQUE (user_id, problem_id, language)
);

-- The editor loads every saved language for a problem at once, so index the (user, problem) prefix.
CREATE INDEX idx_code_user_problem ON code_submissions (user_id, problem_id);
