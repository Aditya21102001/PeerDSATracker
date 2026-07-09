-- PeerDSATracker initial schema.
-- Enums are text + CHECK rather than native Postgres enums: adding a value to a
-- native enum can't run inside Flyway's transactional migration on older PG, and
-- JPA maps text cleanly via @Enumerated(EnumType.STRING).

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- identity

CREATE TABLE users (
    id               bigserial PRIMARY KEY,
    email            citext      NOT NULL UNIQUE,
    username         citext      NOT NULL UNIQUE,
    password_hash    text        NOT NULL,
    display_name     text,
    avatar_url       text,
    role             text        NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),

    -- Denormalized counters, maintained at write time. See streak/leaderboard
    -- notes in the plan: this is what keeps leaderboard reads a single indexed
    -- scan instead of a COUNT(*) across every user's user_problem_status.
    xp               integer     NOT NULL DEFAULT 0,
    total_solved     integer     NOT NULL DEFAULT 0,
    current_streak   integer     NOT NULL DEFAULT 0,
    longest_streak   integer     NOT NULL DEFAULT 0,
    last_active_date date,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_leaderboard ON users (xp DESC, total_solved DESC);

CREATE TABLE refresh_tokens (
    id          bigserial PRIMARY KEY,
    user_id     bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- SHA-256 of the token. The raw token never touches the database.
    token_hash  text        NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    revoked     boolean     NOT NULL DEFAULT false,
    -- Rotation chain: lets a token used twice inside the refresh grace window
    -- resolve to its successor instead of nuking the session.
    replaced_by bigint      REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    user_agent  text,
    ip          text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- ------------------------------------------------------- sheet content

CREATE TABLE sheet_steps (
    id       bigserial PRIMARY KEY,
    step_no  integer NOT NULL UNIQUE,
    title    text    NOT NULL,
    position integer NOT NULL
);

CREATE TABLE sheet_sub_steps (
    id       bigserial PRIMARY KEY,
    step_id  bigint  NOT NULL REFERENCES sheet_steps (id) ON DELETE CASCADE,
    title    text    NOT NULL,
    position integer NOT NULL
);

CREATE INDEX idx_sub_steps_step ON sheet_sub_steps (step_id, position);

CREATE TABLE topics (
    id   bigserial PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE
);

CREATE TABLE problems (
    id            bigserial PRIMARY KEY,
    sub_step_id   bigint      NOT NULL REFERENCES sheet_sub_steps (id) ON DELETE CASCADE,
    title         text        NOT NULL,
    difficulty    text        NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    position      integer     NOT NULL,
    leetcode_url  text,
    gfg_url       text,
    youtube_url   text,
    article_url   text,
    external_slug text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_problems_substep    ON problems (sub_step_id, position);
CREATE INDEX idx_problems_difficulty ON problems (difficulty);

CREATE TABLE problem_topics (
    problem_id bigint NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    topic_id   bigint NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, topic_id)
);

CREATE INDEX idx_problem_topics_topic ON problem_topics (topic_id);

-- --------------------------------------------------------- user progress

-- Absence of a row means "unsolved". Only three states are ever stored.
CREATE TABLE user_problem_status (
    id                   bigserial PRIMARY KEY,
    user_id              bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    problem_id           bigint      NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    status               text        NOT NULL CHECK (status IN ('SOLVED', 'ATTEMPTED', 'REVISIT')),
    is_starred           boolean     NOT NULL DEFAULT false,
    solved_at            timestamptz,

    -- Spaced-repetition revision queue.
    next_review_at       timestamptz,
    review_interval_days integer,
    last_reviewed_at     timestamptz,

    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_ups_user_problem UNIQUE (user_id, problem_id)
);

CREATE INDEX idx_ups_user_status ON user_problem_status (user_id, status);
CREATE INDEX idx_ups_revision    ON user_problem_status (user_id, next_review_at)
    WHERE next_review_at IS NOT NULL;

CREATE TABLE notes (
    id         bigserial PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    problem_id bigint      NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
    content    text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_notes_user_problem UNIQUE (user_id, problem_id)
);

-- ---------------------------------------------------------------- peers

CREATE TABLE follows (
    follower_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    followee_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT chk_no_self_follow CHECK (follower_id <> followee_id)
);

-- Supports "who follows me" and the peers-leaderboard CTE.
CREATE INDEX idx_follows_followee ON follows (followee_id);

-- ------------------------------------------------------ streak & heatmap

CREATE TABLE daily_activity (
    id              bigserial PRIMARY KEY,
    user_id         bigint  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    activity_date   date    NOT NULL,
    problems_solved integer NOT NULL DEFAULT 0,
    xp_earned       integer NOT NULL DEFAULT 0,
    source          text    NOT NULL DEFAULT 'APP'
        CHECK (source IN ('APP', 'LEETCODE', 'CODEFORCES')),

    CONSTRAINT uq_activity_user_date UNIQUE (user_id, activity_date)
);

CREATE INDEX idx_activity_user_date ON daily_activity (user_id, activity_date);

-- ---------------------------------------------------------- gamification

CREATE TABLE badges (
    id             bigserial PRIMARY KEY,
    code           text NOT NULL UNIQUE,
    name           text NOT NULL,
    description    text,
    icon           text,
    criteria_type  text NOT NULL CHECK (criteria_type IN ('TOTAL_SOLVED', 'STREAK', 'XP', 'TOPIC_COMPLETE')),
    criteria_value integer NOT NULL
);

CREATE TABLE user_badges (
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    badge_id   bigint      NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
    awarded_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, badge_id)
);

-- -------------------------------------------------------- external sync

CREATE TABLE platform_accounts (
    id             bigserial PRIMARY KEY,
    user_id        bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    platform       text        NOT NULL CHECK (platform IN ('LEETCODE', 'CODEFORCES')),
    handle         text        NOT NULL,
    verified       boolean     NOT NULL DEFAULT false,
    last_synced_at timestamptz,
    -- Cached blob of whatever the platform last returned. Lets the UI degrade
    -- gracefully when LeetCode's unofficial GraphQL endpoint is unreachable.
    external_stats jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_platform_account UNIQUE (user_id, platform)
);

CREATE TABLE sync_runs (
    id              bigserial PRIMARY KEY,
    user_id         bigint      REFERENCES users (id) ON DELETE CASCADE,
    platform        text        NOT NULL CHECK (platform IN ('LEETCODE', 'CODEFORCES')),
    status          text        NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
    trigger_source  text        NOT NULL CHECK (trigger_source IN ('SCHEDULED', 'MANUAL')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    items_processed integer     NOT NULL DEFAULT 0,
    error_message   text
);

CREATE INDEX idx_sync_user_platform ON sync_runs (user_id, platform, started_at DESC);
