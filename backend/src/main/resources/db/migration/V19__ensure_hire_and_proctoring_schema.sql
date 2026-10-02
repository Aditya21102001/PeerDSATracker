-- Ensure all hire portal and proctoring tables and columns exist idempotently
CREATE TABLE IF NOT EXISTS candidate_profiles (
    id                  bigserial PRIMARY KEY,
    user_id             bigint NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    headline            text NOT NULL DEFAULT '',
    years_of_experience double precision NOT NULL DEFAULT 0.0,
    current_company     text NOT NULL DEFAULT '',
    current_role_title  text NOT NULL DEFAULT '',
    current_ctc         text NOT NULL DEFAULT '',
    expected_ctc        text NOT NULL DEFAULT '',
    notice_period_days  integer NOT NULL DEFAULT 30,
    preferred_locations text NOT NULL DEFAULT '',
    resume_url          text NOT NULL DEFAULT '',
    resume_summary      text NOT NULL DEFAULT '',
    skills              text NOT NULL DEFAULT '',
    certifications      text NOT NULL DEFAULT '',
    education           text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS current_role_title text NOT NULL DEFAULT '';
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS years_of_experience double precision NOT NULL DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_user ON candidate_profiles (user_id);

CREATE TABLE IF NOT EXISTS job_openings (
    id                  bigserial PRIMARY KEY,
    title               text NOT NULL,
    company             text NOT NULL,
    company_logo_url    text NOT NULL DEFAULT '',
    location            text NOT NULL,
    experience_min      integer NOT NULL DEFAULT 0,
    experience_max      integer NOT NULL DEFAULT 10,
    salary_range        text NOT NULL DEFAULT 'Competitive',
    job_type            text NOT NULL DEFAULT 'FULL_TIME',
    workplace_type      text NOT NULL DEFAULT 'HYBRID',
    required_skills     text NOT NULL,
    description         text NOT NULL,
    external_apply_url  text NOT NULL DEFAULT '',
    is_active           boolean NOT NULL DEFAULT true,
    openings_count      integer NOT NULL DEFAULT 1,
    posted_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_openings_active ON job_openings (is_active, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_openings_exp ON job_openings (experience_min, experience_max);

CREATE TABLE IF NOT EXISTS job_applications (
    id              bigserial PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id          bigint NOT NULL REFERENCES job_openings (id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'APPLIED'
        CHECK (status IN ('APPLIED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'OFFERED')),
    match_score     integer NOT NULL DEFAULT 0,
    notes           text NOT NULL DEFAULT '',
    applied_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_job_application UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications (user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications (job_id, applied_at DESC);

CREATE TABLE IF NOT EXISTS ai_interviews (
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

CREATE INDEX IF NOT EXISTS idx_ai_interviews_user ON ai_interviews (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_interview_turns (
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

CREATE INDEX IF NOT EXISTS idx_ai_interview_turns ON ai_interview_turns (interview_id, turn_index ASC);

CREATE TABLE IF NOT EXISTS proctored_tests (
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

CREATE INDEX IF NOT EXISTS idx_proctored_tests_user ON proctored_tests (user_id, started_at DESC);

-- Seed job openings if none exist
INSERT INTO job_openings (id, title, company, company_logo_url, location, experience_min, experience_max, salary_range, job_type, workplace_type, required_skills, description, external_apply_url)
SELECT 1, 'Software Development Engineer - II (Java / Spring Boot)', 'Amazon', 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg', 'Bengaluru, India', 2, 6, '₹28 - ₹42 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Microservices, System Design, DSA, AWS, DynamoDB', 'Join Amazon Consumer Payments team to architect ultra-low-latency transaction engines.', 'https://amazon.jobs'
WHERE NOT EXISTS (SELECT 1 FROM job_openings WHERE id = 1);

INSERT INTO job_openings (id, title, company, company_logo_url, location, experience_min, experience_max, salary_range, job_type, workplace_type, required_skills, description, external_apply_url)
SELECT 2, 'Senior Backend Engineer (Microservices)', 'Swiggy', 'https://upload.wikimedia.org/wikipedia/en/1/12/Swiggy_logo.svg', 'Bengaluru, India', 3, 7, '₹30 - ₹50 LPA', 'FULL_TIME', 'REMOTE', 'Java, Spring Boot, Kafka, Redis, PostgreSQL, Distributed Systems, DSA', 'Help power Indias largest food delivery network.', 'https://careers.swiggy.com'
WHERE NOT EXISTS (SELECT 1 FROM job_openings WHERE id = 2);

INSERT INTO job_openings (id, title, company, company_logo_url, location, experience_min, experience_max, salary_range, job_type, workplace_type, required_skills, description, external_apply_url)
SELECT 3, 'Full Stack Developer (Java + Angular)', 'JPMorgan Chase & Co.', 'https://upload.wikimedia.org/wikipedia/commons/a/af/J_P_Morgan_Logo_2008_1.svg', 'Bengaluru / Hyderabad', 2, 5, '₹18 - ₹28 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Angular, TypeScript, REST APIs, SQL, Docker', 'Develop and modernize wealth management and corporate banking trading portals.', 'https://careers.jpmorgan.com'
WHERE NOT EXISTS (SELECT 1 FROM job_openings WHERE id = 3);
