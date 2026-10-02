-- AI Mock Interview sessions and AI-Proctored Technical Assessments

CREATE TABLE ai_interviews (
    id                  bigserial PRIMARY KEY,
    user_id             bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    track               text NOT NULL DEFAULT 'JAVA_SPRING',
    target_role         text NOT NULL DEFAULT 'Backend Software Engineer',
    level               text NOT NULL DEFAULT 'MID',
    status              text NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    overall_score       integer NOT NULL DEFAULT 0,
    technical_depth     integer NOT NULL DEFAULT 0,
    problem_solving     integer NOT NULL DEFAULT 0,
    communication       integer NOT NULL DEFAULT 0,
    feedback_summary    text NOT NULL DEFAULT '',
    strengths           text NOT NULL DEFAULT '',
    weaknesses          text NOT NULL DEFAULT '',
    recommended_topics  text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz
);

CREATE INDEX idx_ai_interviews_user ON ai_interviews (user_id, created_at DESC);

CREATE TABLE ai_interview_turns (
    id                  bigserial PRIMARY KEY,
    interview_id        bigint NOT NULL REFERENCES ai_interviews (id) ON DELETE CASCADE,
    turn_index          integer NOT NULL,
    question            text NOT NULL,
    topic               text NOT NULL DEFAULT '',
    candidate_answer    text NOT NULL DEFAULT '',
    ai_evaluation       text NOT NULL DEFAULT '',
    score               integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_interview_turns ON ai_interview_turns (interview_id, turn_index ASC);

CREATE TABLE proctored_tests (
    id                  bigserial PRIMARY KEY,
    user_id             bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title               text NOT NULL,
    track               text NOT NULL DEFAULT 'FULL_STACK',
    duration_minutes    integer NOT NULL DEFAULT 45,
    status              text NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'DISQUALIFIED')),
    score               integer NOT NULL DEFAULT 0,
    integrity_score     integer NOT NULL DEFAULT 100,
    proctoring_verdict  text NOT NULL DEFAULT 'CLEARED'
        CHECK (proctoring_verdict IN ('CLEARED', 'FLAGGED_FOR_REVIEW', 'DISQUALIFIED')),
    violations_json     text NOT NULL DEFAULT '[]',
    mcq_answers_json    text NOT NULL DEFAULT '{}',
    code_submission     text NOT NULL DEFAULT '',
    code_language       text NOT NULL DEFAULT 'java',
    test_cases_passed   integer NOT NULL DEFAULT 0,
    test_cases_total    integer NOT NULL DEFAULT 0,
    feedback            text NOT NULL DEFAULT '',
    started_at          timestamptz NOT NULL DEFAULT now(),
    submitted_at        timestamptz
);

CREATE INDEX idx_proctored_tests_user ON proctored_tests (user_id, started_at DESC);
