# PeerDSATracker

A gamified peer DSA progress tracker: work through the Striver A2Z sheet, keep a daily streak,
compare progress with peers on a leaderboard, and keep notes with a spaced-repetition revision queue.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 22 (zoneless, signals, lazy-loaded routes) |
| Backend | Spring Boot 4.1, Java 17, Maven, Spring Data JPA, Flyway |
| Analytics / sync | Python 3.13 + FastAPI (stateless, DB-less) |
| Database | PostgreSQL (Neon) |
| Auth | Spring Security + BCrypt + JWT access/refresh with rotation |

Spring Boot owns the database. The FastAPI service takes rows in and returns computed rows out,
plus talks to LeetCode/Codeforces. Keeping a single DB writer means transactions, retries and
idempotency live in exactly one place.

## Prerequisites

JDK 17+, Maven 3.6.3+, Node 20.19+/22.12+/24+, Python 3.10+, and a Neon Postgres project.

## Setup

```bash
cp .env.example .env
```

Fill in `.env` from the Neon console. You need **both** endpoints:

- `NEON_UNPOOLED_URL` — the direct endpoint. Flyway uses this. Neon's PgBouncer runs in
  transaction mode, which breaks Flyway's session-level advisory lock.
- `NEON_POOLED_URL` — the `-pooler` endpoint. The running app uses this.

Both need `?sslmode=require&channelBinding=require`. Generate `JWT_SECRET` with at least 32 bytes:

```bash
openssl rand -base64 48
```

## Run

Three terminals.

```bash
# backend  -> http://localhost:8081   (applies Flyway migrations on startup)
cd backend && mvn spring-boot:run

# analytics -> http://localhost:8000  (optional; the app degrades without it)
cd analytics && python -m venv .venv && ./.venv/Scripts/pip install -r requirements.txt
./.venv/Scripts/uvicorn app.main:app --reload --port 8000

# frontend -> http://localhost:4300   (proxies /api to :8081, so no CORS in dev)
cd frontend && npm install && npx ng serve
```

Sign up at http://localhost:4300/signup, and `/sheet` will render the 474 seeded problems.

**Ports.** The backend defaults to 8080 but reads `SERVER_PORT` from `.env`; it is set to **8081**
here because another local service holds 8080. The frontend serves on **4300** (`angular.json`)
for the same reason. If you free the defaults, change `SERVER_PORT`, `proxy.conf.json`, and
`angular.json` together.

## Database

`V1__init.sql` creates the schema. `V2__seed_sheet.sql` seeds the Striver A2Z sheet:
**18 steps, 62 sub-steps, 474 problems** (152 easy / 186 medium / 136 hard; 262 with LeetCode links).
`V3` converts `users.email`/`username` from `citext` to `text` with unique indexes on `lower(...)`:
`citext` reports as `Types#OTHER` over JDBC, which Hibernate's `ddl-auto=validate` rejects.

The seed is **generated**, not hand-written. `tools/seed/build_striver_a2z.py` extracts the sheet
from the takeuforward page's Next.js RSC payload and emits the SQL. Regenerate with:

```bash
python tools/seed/build_striver_a2z.py           # fetch live and rewrite V2
python tools/seed/build_striver_a2z.py --check   # parse only, print stats
```

Because the generated SQL is committed, a broken scrape never affects the running app.

## Notes

- **Angular 22 makes `OnPush` the default.** Do not set `changeDetection` explicitly.
- **JWT refresh is single-flight.** Concurrent 401s share one refresh call
  (`AuthStore.refreshOnce`). Without it, parallel refreshes rotate each other's tokens and the
  backend correctly treats the second use as token theft, killing the session.
- **Refresh-token reuse revokes the whole chain**, and the revocation is committed in a
  `REQUIRES_NEW` transaction (`RefreshTokenRevoker`). Doing it inline would be rolled back by the
  401 that reports the theft — the revocation would silently never happen.
- **Spring Boot 4 split autoconfiguration into per-library modules.** `flyway-core` alone does not
  register `FlywayAutoConfiguration`; you need `org.springframework.boot:spring-boot-flyway`, or
  migrations silently never run.
- **The JWT filter must run on the ERROR dispatch.** `OncePerRequestFilter.shouldNotFilterErrorDispatch()`
  defaults to `true`, so the forward to `/error` arrives unauthenticated and every controller error
  comes back as a 401, hiding the real 400/404. `JwtAuthenticationFilter` overrides it to `false`.
- **A `user_problem_status` row means "the user has touched this problem"** — via a status, a star,
  or a scheduled revision. `status` is nullable (V4) so a problem can be starred without being
  marked, and the row is deleted once it carries neither.
- **XP, streak, `daily_activity` and badges are written in the same transaction as the SOLVED
  transition** (`ProgressService.applySolveTransition`), so the denormalized counters on `users`
  can't drift from the status rows. Un-solving refunds XP and decrements that day's activity row.
- **A broken streak writes nothing** — an idle day produces no row. So reads go through
  `StreakService.effectiveCurrentStreak` (which returns 0 once a day is missed) and a nightly job
  (`StreakScheduler`) reconciles the stored column that the leaderboard will read.
- **Set `STREAK_ZONE`** (e.g. `Asia/Kolkata`) in `.env`. It defaults to UTC, and a late-night solve
  in IST would otherwise land on the previous day's heatmap cell.
- **The leaderboard is a single indexed scan** over `users` (`idx_users_leaderboard`), not a
  `COUNT(*)` across everyone's progress rows. `RANK()` is evaluated before `LIMIT`, so page 2 keeps
  true global ranks. The native query quotes its aliases (`AS "userId"`) because Postgres would
  otherwise fold them to lowercase and the interface projection would not bind.
- **`current_streak` is corrected inline in the leaderboard SQL** (`CASE WHEN last_active_date >=
  CURRENT_DATE - 1 ...`), since the stored column is stale until the nightly job runs.
- **`GET /api/peers/search` requires auth.** The original plan had it public; an open endpoint
  would let anyone enumerate every registered username.
- **A revision schedule is orthogonal to status.** Scheduling a SOLVED problem for revision must
  leave it SOLVED — forcing `REVISIT` would read as an un-solve to
  `ProgressService.applySolveTransition` and silently refund the problem's XP. Only a problem with
  no status at all gets `REVISIT` on schedule (a row must carry a status or a star).
- **Review intervals follow a fixed ladder** (1, 3, 7, 16, 35, 90 days), saturating at the top.
  "Got it" climbs one rung, "Forgot" drops to 1 day. Not SM-2: without a self-reported recall
  quality there is nothing to drive an ease factor.
- **`spring.jpa.open-in-view=false` means every DTO's object graph must be fetched up front.**
  `findById` returns lazy proxies that blow up with `LazyInitializationException` once the session
  closes; use the `@EntityGraph` variants (e.g. `ProblemRepository.findWithStepById`).
- **LeetCode has no official API.** The sync uses their unofficial GraphQL endpoint, quarantined in
  `analytics/app/clients/leetcode.py`. It degrades to `found: false` rather than failing a sync.
  Treat it as best-effort. Two shape gotchas: an unknown user is HTTP **200** with
  `matchedUser: null`, and `submissionCalendar` is a JSON-encoded *string*. Codeforces has a real
  API, but an unknown handle is HTTP **400** with a `{"status":"FAILED"}` body — neither client can
  rely on the HTTP status alone.
- **External stats are cached, never merged into `daily_activity`.** That table is `UNIQUE(user_id,
  activity_date)` and its `xp_earned` is tied to the write-time XP invariant on `users`. Folding
  LeetCode's submission calendar into it would inflate streaks and XP the user never earned on this
  sheet. The numbers are shown side by side on `/profile` instead.
- **The analytics service is optional.** If it is down, `/api/analytics/*` returns **503** (not 500),
  a sync records a `FAILED` run, and the dashboard renders everything else. The core app never
  depends on it.
- **Pin HTTP/1.1 on the RestClient talking to FastAPI.** Spring Boot 4's default JDK `HttpClient`
  negotiates HTTP/2, which over plaintext means an h2c upgrade (`Upgrade: h2c` + `HTTP2-Settings`).
  uvicorn's h11 server does not support it and the **request body is silently dropped** — FastAPI
  then rejects the call with `field required, input: null`. See `AnalyticsClient`.
- **Spring Boot 4 ships Jackson 3**: `tools.jackson.databind.ObjectMapper`, not
  `com.fasterxml.jackson.databind`. And `RestClient.Builder` needs the `spring-boot-restclient`
  module, the same per-library autoconfiguration split as `spring-boot-flyway`.

## Password reset

`POST /api/auth/forgot` **always returns 204**, whether or not the email is registered. Any other
behaviour hands an anonymous caller a user-enumeration oracle. The per-user rate limit (5/hour) is
silent for the same reason.

Only the SHA-256 of the reset token is stored, like refresh tokens. A token is single-use and
expires in 30 minutes, requesting a new link invalidates the outstanding one, and **consuming a
token revokes every refresh token the user holds** — a reset is exactly the case where an existing
session may belong to whoever compromised the account.

**There is no mail server.** `ResetLinkDeliverer` writes the link to the application log at WARN.
That is fine locally and honest about what it is, but a production deployment must replace it, or
reset links sit in logs where operators can read them.

## Testing

```bash
cd backend   && mvn -B test        # 29 tests
cd analytics && python -m pytest -q # 15 tests
```

These are unit tests with mocked repositories — no database needed, which is why CI runs them
without Neon credentials. They pin the two invariants that would otherwise break silently: XP and
`total_solved` move if and only if a problem crosses the SOLVED boundary, exactly once, in either
direction; and refresh-token reuse revokes the whole chain via the `REQUIRES_NEW` revoker.

**There are no integration tests.** Every phase was additionally verified by driving the running
system end to end (real HTTP, real Neon, real LeetCode/Codeforces), but that is not a regression
suite. `analytics`' external clients are deliberately not covered in CI: they hit live third-party
APIs, and an upstream outage must never turn the build red.

*Note on JWT:* appending a single base64url character to a signature is **not** rejected — those
6 bits do not complete a byte, so the decoder drops them and recovers the same signature. That is
decoder laxness, not a forgery vector. Tampered payloads, flipped signature characters, and tokens
signed with another key are all rejected; `AuthServiceTest` pins those.
- **Low-memory Windows machines:** `npm install` can hard-OOM (`node::Realloc` assertion) if the
  commit charge is near the limit. Use `npm install --maxsockets 3`, set `MAVEN_OPTS=-Xmx1g`, and
  don't run Maven and npm concurrently.

## Roadmap

Phase 1 (done): auth + seeded sheet, end to end.
Phase 2 (done): status tracking (Solved/Attempted/Revisit), starring, status filters, progress bars.
Phase 3 (done): daily streak, GitHub-style activity heatmap, XP + levels, 13 badges, dashboard.
Phase 4 (done): peers (follow/unfollow, search) + global and peers leaderboards.
Phase 5 (done): per-problem notes + spaced-repetition revision queue.
Phase 6 (done): FastAPI topic-weakness + revise-next analytics, LeetCode/Codeforces sync.
Phase 7 (partly done): password reset flow, unit tests for the XP and refresh-token invariants, CI.
Still open: refresh token in an httpOnly cookie, a real mailer, integration tests, deploy config.
