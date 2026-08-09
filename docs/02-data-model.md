# 02 — Data model

The schema is owned by **Flyway**, not Hibernate. `spring.jpa.hibernate.ddl-auto=validate` means
Hibernate only *checks* that the entities match the tables; it never creates or alters anything.
To change the schema you add a new `V<n>__description.sql` under
`backend/src/main/resources/db/migration/`. You never edit an applied migration.

## Migration history

| File | What it did |
|---|---|
| `V1__init.sql` | The whole schema. |
| `V2__seed_sheet.sql` | Seeds the Striver A2Z sheet: 18 steps, 62 sub-steps, 474 problems. **Generated**, not hand-written — see below. |
| `V3__users_case_insensitive_via_lower_index.sql` | Converts `users.email`/`username` from `citext` to `text` with unique indexes on `lower(...)`. |
| `V4__nullable_problem_status.sql` | Makes `user_problem_status.status` nullable and adds `chk_ups_not_empty`. |
| `V5__seed_badges.sql` | Seeds the 13 badges. |
| `V6__password_reset_tokens.sql` | The password-reset token table. |
| `V7__code_submissions.sql` | Saved editor drafts and run history. |
| `V8__chat.sql` | Assistant conversations and messages. |
| `V9__otp_codes_and_session_cap.sql` | One-time sign-in codes; `users.password_hash` becomes nullable; `refresh_tokens.session_started_at`. |
| `V10__daily_digest_opt_out.sql` | `users.email_digest`, the digest opt-out. |
| `V11__mail_quota.sql` | `mail_quota` — how many emails have actually gone out today. |

Two of these have reasons worth internalising:

**V3** exists because `citext` reports as `Types#OTHER` over JDBC, which Hibernate's `validate`
rejects outright. Case-insensitive uniqueness now comes from a unique index on `lower(email)`
instead of the column type.

**V4** exists because a `user_problem_status` row means *"the user has touched this problem"* —
via a status, a star, **or** a scheduled revision. Starring an otherwise untouched problem needs a
row with no status. The V1 `CHECK (status IN (...))` still holds, because a `CHECK` evaluates to
`NULL` (not `false`) for a `NULL` value, and `NULL` passes.

**V9** carries three changes that belong together. `password_hash` becomes **nullable**,
because an account created through Google has never had one — everything reading it must now
treat `NULL` as "cannot sign in with a password" rather than handing it to the encoder.
`refresh_tokens.session_started_at` is the anchor for the absolute session cap: rotation pushes
`expires_at` forward every time, so without a fixed start a session that is merely *used* often
enough never ends. And `otp_codes` stores codes hashed, with a deliberately odd shape — see
below.

**The seed is generated.** `tools/seed/build_striver_a2z.py` extracts the sheet from the
takeuforward page's Next.js RSC payload and emits `V2__seed_sheet.sql`. The generated SQL is
**committed**, so a broken scrape never affects the running app.

## The tables

```
                        ┌───────────┐
                        │   users   │
                        └─────┬─────┘
        ┌─────────────┬───────┼────────┬──────────────┬─────────────┐
        │             │       │        │              │             │
        ▼             ▼       ▼        ▼              ▼             ▼
 refresh_tokens   follows  notes  daily_activity  user_badges  platform_accounts
 password_reset_               │                       │             │
      tokens                   │                       ▼             ▼
                               │                    badges       sync_runs
                               │
                        ┌──────┴──────────────┐
                        │ user_problem_status │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐        ┌────────┐
     sheet_steps ──▶ sheet_sub_steps ──▶  problems ────│ topics │
        (18)             (62)               (474)      └────────┘
                                                    via problem_topics
```

### Content: the sheet itself

`sheet_steps` → `sheet_sub_steps` → `problems`, a plain three-level hierarchy, each level ordered
by a `position` column. A `problem` also links to many `topics` through `problem_topics`; that
many-to-many is what feeds the analytics weakness report.

Problems carry optional `leetcode_url`, `gfg_url`, `youtube_url`, `article_url`. 262 of the 474
have a LeetCode link.

Note that enums are stored as `text` with a `CHECK` constraint rather than as native Postgres
enums. Adding a value to a native enum cannot run inside Flyway's transactional migration on older
Postgres, and JPA maps `text` cleanly via `@Enumerated(EnumType.STRING)`.

### `users` — and the denormalized counters

```sql
xp               integer NOT NULL DEFAULT 0
total_solved     integer NOT NULL DEFAULT 0
current_streak   integer NOT NULL DEFAULT 0
longest_streak   integer NOT NULL DEFAULT 0
last_active_date date
```

These five columns are **denormalized**: they duplicate information you could in principle derive
by counting `user_problem_status` rows. That is intentional. It is what makes the leaderboard a
single indexed scan over `idx_users_leaderboard (xp DESC, total_solved DESC)` instead of a
`COUNT(*)` across every user's progress rows.

The price of denormalization is that something must keep them honest. That something is
`ProgressService.applySolveTransition`, which writes them **in the same transaction** as the status
row. `User.addXp` and `User.addSolved` clamp at zero, so an un-solve can never drive a counter
negative.

### `user_problem_status` — the most important table

One row per (user, problem) that the user has touched. **Absence of a row means "untouched".**

```sql
status               text        -- SOLVED | ATTEMPTED | REVISIT, or NULL
is_starred           boolean     NOT NULL DEFAULT false
solved_at            timestamptz
next_review_at       timestamptz -- spaced-repetition queue
review_interval_days integer
last_reviewed_at     timestamptz

CONSTRAINT uq_ups_user_problem UNIQUE (user_id, problem_id)
CONSTRAINT chk_ups_not_empty   CHECK (status IS NOT NULL OR is_starred)
```

Read `chk_ups_not_empty` carefully — it is the invariant that shapes several services:

> A row must carry **a status or a star**. A row that carries neither is meaningless and is
> deleted. `UserProblemStatus.isEmpty()` is that test in Java.

This has a consequence that trips people up. Scheduling an *untouched* problem for revision needs
to write a row, and that row must carry something — so it gets `REVISIT`. But scheduling a
**SOLVED** problem must leave it **SOLVED**, because forcing `REVISIT` would look like an un-solve
to `applySolveTransition` and would silently refund the problem's XP. See `RevisionService.schedule`.

`solved_at` tracks the first time the problem reached `SOLVED` and clears when it leaves.

### `daily_activity` — the heatmap and the streak

```sql
UNIQUE (user_id, activity_date)
problems_solved integer NOT NULL DEFAULT 0
xp_earned       integer NOT NULL DEFAULT 0
source          text    NOT NULL DEFAULT 'APP'  -- APP | LEETCODE | CODEFORCES
```

One row per active day. **A day with no activity has no row at all.** Un-solving decrements the
day's counters, and a row that falls back to zero is *deleted* so the heatmap has no dead cell.

Which "day" a solve belongs to depends on `app.streak.zone` (set `STREAK_ZONE`, e.g.
`Asia/Kolkata`). It defaults to UTC, and a late-night solve in IST would otherwise land on the
previous day's cell.

The `source` column exists but external stats are **never** written here — see below.

### `refresh_tokens` and `password_reset_tokens`

Both store only the **SHA-256 hash** of the token. A database leak cannot be replayed.

`refresh_tokens.replaced_by` records the rotation chain. `revoked` plus reuse detection is what
turns a stolen token into a dead session rather than a permanent backdoor.

`password_reset_tokens` adds `used_at` (single use) and `expires_at` (30 minutes).

### `otp_codes` — and why a row outlives its secret

```sql
id         bigserial PRIMARY KEY,
email      text        NOT NULL,   -- always lowercase; OtpService normalises before writing
code_hash  text,                   -- NULLABLE, and that is the interesting part
expires_at timestamptz NOT NULL,
created_at timestamptz NOT NULL DEFAULT now()
```

`code_hash` is nulled the moment a code is consumed or superseded. The credential is destroyed
while the `(address, timestamp)` row survives, and it survives for a reason: requests are rate
limited per destination by counting rows, and that count has to include codes already spent
**and requests for addresses with no account at all**. Delete the row instead and two things
break — anyone can clear their own budget by burning a code, and only registered addresses
could ever be throttled, which turns the rate limit itself into an account-enumeration oracle.

`text`, not `citext`, for the same reason as V3. Case-insensitivity comes from normalising in
Java and a plain `(email, created_at)` index — a functional index on `lower(email)` would never
be used, because the query compares the column directly.

### `mail_quota` — one row per day

`(day, sent)`. The digest runs twice daily and the send cap has to be a **daily** budget rather
than a per-run one, or two runs of 200 quietly become 400 against a provider allowance of 300.
Overspending it is not merely a truncated digest: the same allowance carries one-time sign-in
codes, so a greedy morning run would leave people unable to sign in for the rest of the day.

Persisted rather than counted in memory because Render restarts instances freely, and an
in-memory counter resets to zero exactly when it would let the budget be spent twice. Keyed by
calendar day, so it needs no cleanup job.

### `platform_accounts` and `sync_runs`

`platform_accounts.external_stats` is a `jsonb` blob holding verbatim whatever LeetCode or
Codeforces last returned. It is cached so the profile page degrades gracefully when the unofficial
LeetCode endpoint is unreachable.

> **External stats are never merged into `daily_activity`.** That table is `UNIQUE(user_id,
> activity_date)` and its `xp_earned` is tied to the write-time XP invariant on `users`. Folding
> LeetCode's submission calendar into it would inflate streaks and XP the user never earned on this
> sheet. The two sets of numbers are shown side by side on `/profile` instead.

`sync_runs` is an audit log: one row per attempt, with `status` (`PENDING`/`RUNNING`/`SUCCESS`/
`FAILED`) and `trigger_source` (`SCHEDULED`/`MANUAL`). A handle that does not exist is a `FAILED`
run, not an exception — the previously cached stats stay.

### `badges` and `user_badges`

13 badges seeded by V5. A badge has a `criteria_type` (`TOTAL_SOLVED`, `STREAK`, `XP`,
`TOPIC_COMPLETE`) and a `criteria_value` threshold.

`GamificationService.awardEarnedBadges` is idempotent — already-held badges are skipped — so it is
safe to call on every solve, which is exactly what happens inside the SOLVED transaction.

`STREAK` badges test `longest_streak`, **not** `current_streak`: a badge once earned is never taken
away. `TOPIC_COMPLETE` is declared but not yet evaluated.

### `follows`

A composite primary key `(follower_id, followee_id)` with `CHECK (follower_id <> followee_id)`.
`idx_follows_followee` supports both "who follows me" and the peers-leaderboard CTE.

Following is directional: a follower is not necessarily someone you follow back.

## Lazy loading: a trap you will hit

`spring.jpa.open-in-view=false`. The Hibernate session closes when the transaction ends, **before**
the controller serialises its response. So a lazy proxy fetched by `findById` will throw
`LazyInitializationException` when Jackson touches it.

Every DTO's object graph must therefore be fetched up front. That is why `ProblemRepository` has
`@EntityGraph` variants such as `findWithStepById`. If you add a DTO that walks a new relation, you
must add or extend an entity graph.

## XP arithmetic

| Difficulty | XP | Count in sheet | Total |
|---|---|---|---|
| EASY | 10 | 152 | 1,520 |
| MEDIUM | 20 | 186 | 3,720 |
| HARD | 40 | 136 | 5,440 |
| | | **474** | **10,680** |

One level per 500 XP. A fully completed sheet is level 22.
