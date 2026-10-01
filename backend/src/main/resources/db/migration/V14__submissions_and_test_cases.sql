-- Test cases for problems (both sample cases visible to user and evaluation cases)
CREATE TABLE problem_test_cases (
    id              bigserial   PRIMARY KEY,
    problem_id      bigint      NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    input           text        NOT NULL DEFAULT '',
    expected_output text        NOT NULL DEFAULT '',
    is_sample       boolean     NOT NULL DEFAULT true,
    position        integer     NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_cases_problem ON problem_test_cases (problem_id, position);

-- Historical submission records: immutable audit log of each submission attempt
CREATE TABLE problem_submissions (
    id                 bigserial   PRIMARY KEY,
    user_id            bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    problem_id         bigint      NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    language           text        NOT NULL,
    source             text        NOT NULL,
    verdict            text        NOT NULL, -- 'ACCEPTED', 'WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED'
    passed_test_cases  integer     NOT NULL DEFAULT 0,
    total_test_cases   integer     NOT NULL DEFAULT 0,
    stdout             text,
    stderr             text,
    compile_output     text,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_user_problem ON problem_submissions (user_id, problem_id, created_at DESC);
CREATE INDEX idx_submissions_user ON problem_submissions (user_id, created_at DESC);

-- Seed initial test cases for starter problems so out of the box problems have test cases
-- Problem 1: 'Input Output'
INSERT INTO problem_test_cases (problem_id, input, expected_output, is_sample, position) VALUES
  (1, '42', '42', true, 1),
  (1, 'Hello World', 'Hello World', true, 2),
  (1, '-17', '-17', false, 3);

-- Problem 2: 'Cpp Basics'
INSERT INTO problem_test_cases (problem_id, input, expected_output, is_sample, position) VALUES
  (2, '5', '5', true, 1),
  (2, '10', '10', false, 2);
