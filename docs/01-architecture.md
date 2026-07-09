# 01 — Architecture

> Read this first. Everything else assumes it.

## What the application does

PeerDSATracker is a progress tracker for the **Striver A2Z sheet**, a well-known curated list of
474 DSA problems organised into 18 steps and 62 sub-steps. The app adds four things on top of a
plain checklist:

1. **Gamification** — solving a problem earns XP, extends a daily streak, and unlocks badges.
2. **Spaced repetition** — you schedule a problem for revision and the app tells you when to
   come back to it.
3. **Peers** — you follow other users and compare progress on a leaderboard.
4. **External stats** — you link your LeetCode / Codeforces handles and see those numbers too.

## Three services, and why

| Service | Technology | Responsibility | Owns state? |
|---|---|---|---|
| **frontend** | Angular 22 (zoneless, signals) | Rendering, optimistic UI, token storage | Only the refresh token in `localStorage` |
| **backend** | Spring Boot 4.1, Java 17 | All business rules, all database access, auth | **Yes — sole owner of the database** |
| **analytics** | Python 3.13, FastAPI | Pure computation + external API calls | **No — completely stateless and DB-less** |

The interesting decision is the third row. The analytics service **cannot reach the database at
all**. It takes rows in as JSON, returns computed rows out as JSON, and separately knows how to
call LeetCode and Codeforces.

Why not let it read the database directly? Because the moment two services can write to the same
tables, you need distributed transactions, or you accept drift. Keeping **exactly one writer**
means transactions, retries and idempotency all live in one place — `ProgressService`,
`StreakService`, and friends. The Python service is a calculator that Spring Boot calls. It can
crash, be redeployed, or be missing entirely, and no user data is at risk.

That last point is a real design constraint, not a slogan:

> **The analytics service is optional.** If it is down, `/api/analytics/*` returns **503** (not
> 500), a platform sync records a `FAILED` run, and the dashboard renders everything else. The
> core app never depends on it.

## How a request travels

### The common case: an authenticated API call

```
Browser
  │ 1. Component calls a service method
  ▼
authInterceptor  ──────────────────────────────────────────────┐
  │ 2. Attaches `Authorization: Bearer <access token>`         │  on 401, see below
  ▼                                                            │
Vercel / ng serve proxy                                        │
  │ 3. Rewrites /api/* to the backend origin, server-side.     │
  │    The browser therefore never makes a cross-origin        │
  │    request — no CORS, no preflight.                        │
  ▼                                                            │
Spring Security filter chain                                   │
  │ 4. JwtAuthenticationFilter verifies the token's signature  │
  │    and loads the User, placing it in the SecurityContext.  │
  ▼                                                            │
@RestController                                                │
  │ 5. `@AuthenticationPrincipal User user` is that user.      │
  ▼                                                            │
@Service (@Transactional)                                      │
  │ 6. Business rules. One transaction per request.            │
  ▼                                                            │
Spring Data JPA ──▶ PostgreSQL (Neon, pooled endpoint)         │
                                                               │
◀──────────────────────────────────────────────────────────────┘
```

### The 401 case: token refresh

Access tokens live **15 minutes** and are held **in memory only**. Refresh tokens live **30 days**
and are held in `localStorage`. When an access token expires:

1. The API call comes back `401`.
2. `authInterceptor` catches it and calls `AuthStore.refreshOnce()`.
3. `refreshOnce()` posts the refresh token to `/api/auth/refresh`, receives a **new** access token
   *and a new refresh token*, and retries the original request.

Two things about this are easy to get wrong, and both are already handled:

- **Refresh is single-flight.** If six requests on the dashboard all 401 at once, they all
  subscribe to *one* in-flight refresh observable. If they each started their own refresh, they
  would rotate each other's tokens, and the backend would correctly see the second use of an
  already-rotated token as **token theft** and kill the session. See `AuthStore.refreshOnce`.
- **Refresh bypasses the interceptor.** `AuthStore` builds a second `HttpClient` straight from
  `HttpBackend` for this one call. Otherwise a 401 on `/auth/refresh` would recurse into refresh.

### Session restore on page load

The access token is deliberately *not* persisted, so a browser reload loses it while the refresh
token survives. Without intervention, `authGuard` would wave the user through and the landing page
would fire every one of its requests unauthenticated — six 401s on the dashboard — before the
interceptor noticed.

So `app.config.ts` registers `provideAppInitializer(() => ... AuthStore.restoreSession())`, which
exchanges the surviving refresh token for an access token **before the first route renders**. If
that refresh fails, the session is genuinely over: the tokens are cleared so the guard redirects to
`/signin` rather than letting a page load and fail.

## The security model in one page

- **Passwords** are BCrypt-hashed. Nothing else.
- **Access token**: a signed JWT (HS256), 15-minute TTL, carries only the user id as `sub`.
  Nothing from the client is ever trusted beyond the signature.
- **Refresh token**: an opaque 48-byte random string. Only its **SHA-256 hash** is stored — the raw
  token never touches the database.
- **Rotation**: every use of a refresh token issues a new one and revokes the old. Presenting a
  token that was already rotated means someone has a copy, so **every refresh token for that user
  is revoked**.
- That revocation runs in a `REQUIRES_NEW` transaction (`RefreshTokenRevoker`). If it ran inline,
  the `401` thrown to report the theft would roll it back and the revocation would silently never
  happen. It lives in its own bean because Spring's transaction proxy does not intercept
  self-invocation.
- **`/api/auth/forgot` always returns 204**, whether or not the email is registered. Any other
  behaviour hands an anonymous caller a user-enumeration oracle. The per-user rate limit (5/hour)
  is silent for the same reason.
- **`/api/peers/search` requires authentication.** An open endpoint would let anyone enumerate
  every registered username.
- The analytics service is guarded by a shared secret (`X-Internal-Token`) on every route except
  `/health`. Spring Boot is its only legitimate caller.

## Cross-cutting rules you must not break

These are the invariants the whole system rests on. Each one has a home in the code.

### 1. Exactly one writer

Only the Spring Boot service writes to PostgreSQL. The analytics service has no database driver
and no credentials.

### 2. The SOLVED transition is atomic

XP, `total_solved`, the daily activity row, the streak counters and badge awards are all written
**in the same transaction** as the status change, in `ProgressService.applySolveTransition`. The
denormalized counters on `users` therefore can never drift from the `user_problem_status` rows.

Un-solving is the exact inverse: it refunds XP and decrements that day's activity row. The method
returns early when `wasSolved == isSolved`, so the transition fires exactly once in either
direction — never twice, never zero times.

### 3. A revision schedule is orthogonal to status

Scheduling a **SOLVED** problem for revision must leave it **SOLVED**. If scheduling forced the
status to `REVISIT`, `applySolveTransition` would read that as an un-solve and silently refund the
problem's XP. Only a problem with *no* status at all gets `REVISIT` when scheduled — and it must
get something, because a `user_problem_status` row is required to carry a status or a star.

### 4. A broken streak writes nothing

An idle day produces no row anywhere. Nothing runs at midnight to notice you did not solve
anything. So `users.current_streak` goes **stale** the moment a day is missed, and every read has
to correct it:

- `StreakService.effectiveCurrentStreak()` returns 0 once a day is missed.
- The leaderboard SQL corrects it inline with `CASE WHEN last_active_date >= CURRENT_DATE - 1 ...`.
- A nightly job (`StreakScheduler`) reconciles the stored column.

The nightly job is **cleanup, not a correctness requirement** — which is exactly why the app
survives Render's free tier, where `@Scheduled` jobs do not fire while the service is asleep.

### 5. External stats are cached, never merged

LeetCode's and Codeforces' numbers are stored as a JSON blob on `platform_accounts.external_stats`
and are shown *side by side* with your sheet progress. They are never folded into `daily_activity`,
because that table's `xp_earned` is tied to the write-time XP invariant on `users`. Merging them
would inflate streaks and XP the user never earned on this sheet.

## Local topology

```
localhost:4300   frontend   `ng serve`, proxies /api → :8081 (proxy.conf.json)
localhost:8081   backend    `mvn spring-boot:run`, applies Flyway migrations on startup
localhost:8000   analytics  `uvicorn app.main:app --reload`
Neon             database   two endpoints: pooled (app) and unpooled/direct (Flyway)
```

Non-default ports because 8080 and 4200 were already taken on the author's machine. If you free
them, change `SERVER_PORT`, `proxy.conf.json`, and `angular.json` **together**.

The two Neon endpoints are not optional. Flyway needs the **direct** endpoint because Neon's
PgBouncer runs in transaction mode, which breaks Flyway's session-level advisory lock. The running
app uses the **pooled** one.

## Production topology

| Service | Host | Notes |
|---|---|---|
| frontend | Vercel | static build; `vercel.json` rewrites `/api/*` to the backend |
| backend | Render | Docker — Render has **no native Java runtime** |
| analytics | Render | Docker, for parity with local |
| database | Neon | a separate project from the dev one |

Because Vercel rewrites `/api/*` **server-side**, the browser only ever sees one origin. There is
no CORS and no preflight in production. `CORS_ALLOWED_ORIGINS` is still set on the backend as
insurance: a same-origin `POST` still carries an `Origin` header, and if Vercel forwards it,
Spring's `CorsFilter` would answer 403.

The root README documents the free-tier consequences that were **accepted, not fixed**: 15-minute
spin-down, no scheduled jobs while asleep, and a 60-second analytics read timeout because Render
*queues* requests to a sleeping service rather than refusing them.

## Where to go next

- The tables and their invariants: [02-data-model.md](02-data-model.md)
- The Java packages: [03-backend.md](03-backend.md)
- The Angular app: [04-frontend.md](04-frontend.md)
