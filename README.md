# PeerDSATracker

A gamified peer DSA progress tracker: work through the Striver A2Z sheet, keep a daily streak,
compare progress with peers on a leaderboard, keep notes with a spaced-repetition revision queue,
and write and run your solutions in an in-app editor.

## Documentation

New to the codebase? Start with **[docs/](docs/)**, which explains the architecture and every
feature from scratch — [architecture](docs/01-architecture.md), [data model](docs/02-data-model.md),
[backend](docs/03-backend.md), [frontend](docs/04-frontend.md), [analytics](docs/05-analytics.md),
[API reference](docs/06-api-reference.md), [glossary](docs/07-glossary.md).

This README is the *operational* document: setup, environment, deployment, and the gotchas that
will bite you. The two do not repeat each other.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 22 (zoneless, signals, lazy-loaded routes) |
| Backend | Spring Boot 4.1, Java 17, Maven, Spring Data JPA, Flyway |
| Analytics / sync | Python 3.13 + FastAPI (stateless, DB-less) |
| Code execution | Piston sandbox, proxied through the analytics service |
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

## Account recovery

Recovery runs on **one-time codes emailed through Brevo's HTTP API** (`/api/auth/otp/*`), not on
the older reset-link flow. Full detail in [docs/06-api-reference.md](docs/06-api-reference.md);
the shape of it:

1. `POST /auth/otp/request` — answers **202 whether or not the address is registered**. Codes are
   stored hashed, expire in 10 minutes, are single-use, and are rate limited per destination. The
   limit is applied *before* the account lookup, so a 429 cannot be used to test which addresses
   exist.
2. `POST /auth/otp/verify` — signs in, and the token carries the `vbc` claim for 15 minutes.
3. The SPA then **presents a set-a-password step**, which the `vbc` claim is what makes possible.
   Without that step the code becomes a permanent second credential: somebody who forgot their
   password would sign in by code forever and never actually recover the account.

`POST /auth/change-password` accepts exactly one of three proofs — a `vbc` token inside its window,
a fresh code, or the current password — and returns **one identical message** for every failure.
It reports back the **username** the password was set on, because recovery finds accounts by email
while sign-in wants a username, and for a Google-created account those differ.

**Email goes over HTTP, never SMTP.** Render blocks the outbound SMTP ports, so a `JavaMailSender`
passes every local test and then silently delivers nothing. `BrevoMailClient` is the single
transport; sign-in codes and the daily digest both use it.

**`OTP_DEMO_MODE=true` returns the code in the API response** so the flow works with no provider
configured. It is a separate branch, never a fallback when delivery fails — a failed send deletes
the stored code and answers 503. It must be `false` in production.

### Sign in with a username or an email

`POST /auth/login` takes `identifier`, tried as a username first and then as an email if it
contains `@`. Both are required: recovery is keyed by email while sign-in is keyed by username, and
an account created through Google gets a **generated** username its owner has never seen.

### Google sign-in

Off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set — absent credentials mean the
`/oauth2/**` endpoints do not exist and the SPA hides the button (it asks `GET /api/auth/options`
rather than guessing). Register `<backend-origin>/login/oauth2/code/google` in the Google console;
both hops must be the same origin or the flow fails on a state mismatch.

An existing account signs in **with the role it already has** — no path writes a role. An unknown
address is refused unless `OAUTH_AUTO_PROVISION=true`, and even then the account is created with
`OAUTH_DEFAULT_ROLE`, which the application **refuses to start** with if it names a privileged role.

## Daily practice digest

Two personalised emails a day, off unless `MAIL_ENABLED=true`:

- **09:00** — the full digest, to every subscriber.
- **18:15** — a reminder, and only to people who have **not practised yet that day**. Sending the
  same email twice is how people learn to ignore both.

Every figure comes from the database. A language model (OpenRouter, or Groq via the same
OpenAI-compatible client) writes **one line of encouragement and nothing else** — it is forbidden
from quoting statistics, because congratulating somebody on a streak they do not have costs more
trust than a plain template. Rate limit, cold start or no API key all fall back to written copy and
the mail still goes out.

Both runs share **one daily budget**, counted in `mail_quota` so a restart cannot reset it. The
provider allowance is shared with sign-in codes: overspending it would stop people signing in,
which is far worse than a missed nudge. Truncation is always logged with the number skipped.

Every digest carries a one-click, HMAC-signed **unsubscribe** link that needs no session — the
person most likely to want out is the one who cannot sign in, and making them log in first is how
an unsubscribe link becomes a "report spam" click.

## Deployment

| Service | Host | Notes |
|---|---|---|
| frontend | Vercel | static build, root directory `frontend`, `vercel.json` rewrites `/api/*` |
| backend | Render | Docker (Render has **no native Java**), free instance |
| analytics | Render | Docker, free instance |
| database | Neon | a **separate** project from the dev one |

Both services run as containers. The backend *must* — Render has no Java runtime. The analytics
service could use Render's native Python runtime; it ships as a container for parity, so the same
image runs locally and in production and the Python version is pinned in the Dockerfile rather than
a dashboard variable. Use `python:3.13-slim`, never `-alpine`: `uvicorn[standard]` pulls `uvloop`
and `httptools`, which are C extensions with no manylinux wheels for musl, so Alpine would compile
them from source.

The browser only ever talks to the Vercel origin: `vercel.json` rewrites `/api/:path*` to the Render
backend server-side, so there is no CORS and no preflight. Vercel checks the filesystem *before*
applying rewrites, so the SPA catch-all (`/(.*) -> /index.html`) never shadows a hashed asset.

Set `CORS_ALLOWED_ORIGINS` on the backend to the Vercel domain anyway. A same-origin `POST` still
carries an `Origin` header, and whether Vercel forwards it upstream is undocumented; if it does,
Spring's `CorsFilter` would answer **403**. `allowCredentials(true)` makes a `*` wildcard illegal, so
the exact domain has to be named.

### Deploy order

The backend needs the frontend's URL and vice versa. Both backend values are runtime env vars, so
they are patched last (a restart, not a rebuild).

1. **Neon** — create the prod project in Render's region. Collect the pooled + unpooled URLs.
2. **Analytics → Render** — set `INTERNAL_TOKEN`. Note its public URL.
3. **Backend → Render** — set the Neon vars, a fresh `JWT_SECRET`, the same `INTERNAL_TOKEN`,
   `ANALYTICS_BASE_URL` from step 2, and `RESET_ENABLED=false`. Flyway runs V1–V6 and seeds the
   474 problems on first boot. Note the backend URL.
4. **Frontend → Vercel** — root directory `frontend`; point the rewrite at step 3's URL.
5. **Patch the backend** — `FRONTEND_BASE_URL` and `CORS_ALLOWED_ORIGINS` = the Vercel domain.

`ANALYTICS_BASE_URL` must be the analytics service's **public** `https://…onrender.com` URL. Render's
`fromService` only yields `host`/`port`, never a scheme — and the public URL is what wakes a
spun-down instance.

### Free-tier consequences (accepted, not bugs)

- Services **spin down after 15 minutes idle**; the next request waits ~1–3 min for a JVM cold start
  on 0.1 CPU.
- **Neither `@Scheduled` job fires while the backend sleeps.** This is survivable: streaks are
  already corrected at read time by `StreakService.effectiveCurrentStreak` and inline in the
  leaderboard SQL, so `StreakScheduler` is cleanup rather than a correctness requirement. Platform
  sync becomes manual, via the button on `/profile`.
- **`ANALYTICS_READ_TIMEOUT` defaults to 60s.** Render *queues* a request to a spun-down service
  rather than refusing it: the TCP connect succeeds at the edge instantly, but the response is
  withheld for 30–60s while the instance wakes. The old 30s read timeout failed every first call
  after idle.
- 750 free instance-hours per workspace per month. Keeping one service warm with an external pinger
  costs ~730h; keeping *both* warm exceeds the cap and suspends them mid-month.

### `MANAGEMENT_HEALTH_DB_ENABLED=false`

Set on the Render backend. Render allows a health check **5 seconds**; a DB-backed health indicator
could block on the 30s Hikari `connection-timeout` while Neon's compute is cold.

Measured honestly: `DataSourceHealthContributorAutoConfiguration` *does* match on this classpath, but
`/actuator/health` still answers in **~17 ms** while real DB requests take 1–2 s — so it is not
touching the database, and the stall could not be reproduced locally. The flag stays as cheap
insurance, not as a fix for an observed bug.

### The old reset-link flow stays disabled

`RESET_ENABLED=false` on the backend (`/forgot` and `/reset` return **404**) and
`resetEnabled: false` in `environment.prod.ts`. That flow still has no mailer — `ResetLinkDeliverer`
only writes the link to the log — so enabling it would promise an email it cannot send and leak
working reset links to anyone who can read the log stream.

It is also no longer needed: recovery goes through `/code` (one-time codes), which has a working
transport. Nothing in the UI links to `/forgot`; the routes remain only so an old emailed link
still resolves.

### Production email settings

| Variable | Must be |
|---|---|
| `OTP_DEMO_MODE` | **`false`** — `true` returns sign-in codes in the HTTP response |
| `OTP_EMAIL_API_KEY` / `OTP_EMAIL_FROM` | A Brevo key, and a sender **verified in the Brevo console**. An unverified sender is rejected outright and every code request answers 503. |
| `MAIL_ENABLED` | `true` only when you actually want to start mailing every registered user |
| `STREAK_ZONE` | The audience's zone. `MAIL_ZONE` follows it, so a wrong value sends the "morning" digest in the middle of their afternoon. |
| `OAUTH_DEFAULT_ROLE` | `USER`. Startup fails if it names a privileged role. |

A healthy first run logs the two settings that are otherwise wrong-but-silent:

```
Daily digest (morning): treating 2026-08-10 as today in zone Asia/Kolkata;
                        unsubscribe links point at https://<backend>.onrender.com
```

## Testing

```bash
cd backend   && mvn -B test          # 170 tests
cd frontend  && npm test             # 116 tests
cd analytics && python -m pytest -q  # 15 tests
```

These are unit tests with mocked repositories — no database needed, which is why CI runs them
without Neon credentials. They pin the invariants that would otherwise break silently: XP and
`total_solved` move if and only if a problem crosses the SOLVED boundary, exactly once, in either
direction; refresh-token reuse revokes the whole chain via the `REQUIRES_NEW` revoker; and the
authentication rules in [docs/06-api-reference.md](docs/06-api-reference.md) — sign-in by username
*or* email, the code returned **only** in demo mode, `vbc` absent from refreshed tokens, an unknown
Google identity refused, an existing account keeping its role.

**Each of those auth tests was checked by reintroducing the bug it guards** and confirming the test
fails. A test that passes with and without the fix reports safety it never checked.

### Frontend: accessibility is tested, not reviewed

`npm test` includes three suites that exist because accessibility regressions are invisible to
everyone who is not affected by them:

- `a11y.spec.ts` — **axe-core** over every routed screen (WCAG 2.1 A + AA), plus a guard test that
  deliberately breaks markup and asserts axe catches it. Without the guard, a misconfigured rule set
  would show green ticks while checking nothing.
- `design-tokens.spec.ts` — **colour contrast**, computed from the tokens parsed out of
  `styles.scss`. axe cannot do this: its `color-contrast` rule needs a layout engine and jsdom has
  none, so it reports "incomplete" rather than failing.
- `keyboard-a11y.spec.ts` — the skip link has a target on every page, one `main` per page, heading
  levels never skip, no control announced as nothing.

Note `frontend/vitest-base.config.ts`: spec files run **sequentially**. In parallel, jsdom+axe
exhausts memory and workers are killed — and a killed worker reports "Worker exited unexpectedly"
while the summary still counts the survivors as passed, so the run looks green having silently
skipped whole files.

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
