# 03 — Backend tour

Spring Boot 4.1, Java 17, Maven. The **only** service that talks to the database.

```bash
cd backend && mvn spring-boot:run   # → http://localhost:8081, applies Flyway migrations on startup
cd backend && mvn -B test           # 29 unit tests, no database required
```

## Package layout

Packages are organised **by feature**, not by layer. There is no `controllers/`, `services/`,
`repositories/` triple. Everything about revision lives in `revision/`. When you add a feature, add
a package.

```
com.peerdsa
├── PeerDsaApplication.java     the @SpringBootApplication entry point
├── analytics/     bridge to the FastAPI service
├── auth/          signup, login, refresh, logout, password change, OAuth sign-in
│   └── otp/       one-time codes: issue, verify, rate limit, delivery
├── common/        GlobalExceptionHandler
├── config/        SecurityConfig, the @ConfigurationProperties records, FrontendUrl
├── gamification/  XP, levels, badges
├── leaderboard/   global + peers rankings
├── mail/          the one outbound-email transport, and the daily practice digest
├── notes/         per-problem notes
├── peers/         follow / unfollow / search
├── progress/      status, stars, and the SOLVED transition  ← the heart of the app
├── revision/      the spaced-repetition ladder
├── security/      JwtService, JwtAuthenticationFilter, the OAuth2 handlers
├── sheet/         the Striver A2Z content (steps, sub-steps, problems, topics)
├── streak/        daily activity, heatmap, streak counters
├── sync/          LeetCode / Codeforces account linking and sync runs
└── user/          the User entity and its repository
```

A typical package holds an entity, a repository, a service, and a controller. Controllers are thin;
they do parameter handling and delegate. Business rules and `@Transactional` boundaries live in
services.

## Diagrams

`docs/diagrams/` holds PlantUML sources — render with `plantuml docs/diagrams/*.puml`, or paste
one into <https://www.plantuml.com/plantuml>.

| File | What it shows |
|---|---|
| `class-auth.puml` | Where each authentication rule lives: the three JWT claims, the three password proofs, the OAuth refusals. |
| `class-mail.puml` | One transport, two senders. Sign-in codes and the digest both go through `BrevoMailClient`. |
| `flow-account-recovery.puml` | Code request → verify → the set-a-password step that makes it a recovery. |
| `flow-google-signin.puml` | The redirect dance, and both ways it is refused. |
| `flow-token-lifecycle.puml` | Rotation, the benign race, theft, and the two ceilings. |
| `flow-daily-digest.puml` | One digest run, morning or evening. |

## The classes that matter most

### `progress/ProgressService`

Read this one first. `applySolveTransition` is where XP, `total_solved`, the streak, the daily
activity row and badge awards all move — **in one transaction**, so the denormalized counters on
`users` can never drift from the status rows.

```java
boolean wasSolved = previous == ProblemStatus.SOLVED;
boolean isSolved  = next     == ProblemStatus.SOLVED;
if (wasSolved == isSolved) {
    return;   // ← the transition fires exactly once, in either direction
}
```

`findOrCreate` / `isEmpty` implement the `chk_ups_not_empty` rule from
[02-data-model.md](02-data-model.md): a row must carry a status or a star, and is deleted once it
carries neither.

### `streak/StreakService`

`recordSolve` bumps today's `daily_activity` row inside the caller's transaction. `recordUnsolve`
deliberately does **not** rewind the streak counters — recomputing a streak backwards needs the
full history, un-solving is rare, and the nightly job owns that.

`effectiveCurrentStreak` is the read-time correction for the fact that **an idle day writes
nothing**. Use it. Do not read `user.getCurrentStreak()` directly outside this class.

### `revision/RevisionSchedule`

A fixed ladder: `{1, 3, 7, 16, 35, 90}` days, saturating at the top so reviews never stop.
`nextInterval` returns the smallest rung *strictly above* the current interval, so a hand-picked
off-ladder interval (say 5 days) climbs to 7, not to 16.

Deliberately not SM-2: without a self-reported recall quality per review there is nothing to drive
an ease factor.

> This ladder is mirrored in `analytics/app/services/revision.py` as `LADDER`. **The two must stay
> in sync.**

### `auth/AuthService` + `auth/RefreshTokenRevoker`

Rotation and reuse detection. The revoker is a *separate bean* with
`@Transactional(propagation = REQUIRES_NEW)` because:

1. Throwing the 401 that reports the theft would roll back an inline revocation, so the revocation
   must commit in its own transaction; and
2. Spring's transaction proxy does not intercept self-invocation, so calling a `REQUIRES_NEW`
   method on `this` would silently join the caller's transaction.

Both halves of that are load-bearing. This is the kind of thing that looks like over-engineering
until you delete it.

### `security/JwtAuthenticationFilter`

```java
@Override
protected boolean shouldNotFilterErrorDispatch() {
    return false;
}
```

`OncePerRequestFilter` skips the ERROR dispatch by default. Spring Security still runs its chain
there, so without this override the internal forward to `/error` arrives unauthenticated and
**every controller error comes back as a 401**, hiding the real 400/404.

### `leaderboard/LeaderboardRepository`

Two native queries. Three details, all deliberate:

- Ranking runs off the denormalized counters on `users`, so it is one indexed scan.
- `RANK()` is evaluated before `LIMIT`, so page 2 keeps **true global ranks**.
- Aliases are quoted (`AS "userId"`) because Postgres would otherwise fold them to lowercase and
  the Spring Data interface projection would not bind.

`current_streak` is corrected inline in SQL, since the stored column is stale until the nightly job
runs.

### `analytics/AnalyticsClient`

The only caller of the FastAPI service, authenticated with `X-Internal-Token`.

It pins **HTTP/1.1**. Spring Boot 4's default JDK `HttpClient` negotiates HTTP/2, which over
plaintext means an h2c upgrade. uvicorn's h11 server does not support it and **silently drops the
request body** — FastAPI then rejects the call with `field required, input: null`. This cost
someone an afternoon; leave the pin alone.

## Spring Boot 4 gotchas

Boot 4 split autoconfiguration into **per-library modules**. Adding the library is no longer
enough:

- `flyway-core` alone does not register `FlywayAutoConfiguration`. You need
  `org.springframework.boot:spring-boot-flyway`, or migrations silently never run.
- `RestClient.Builder` needs `spring-boot-restclient`.

Boot 4 also ships **Jackson 3**: `tools.jackson.databind.ObjectMapper`, not
`com.fasterxml.jackson.databind`. Watch the import.

## Conventions

**Errors.** Throw `ResponseStatusException` with the status and a short reason.
`GlobalExceptionHandler` turns that, plus bean-validation failures and unparseable bodies, into a
consistent `ApiError` JSON shape. Do not invent per-feature error types.

**The current user.** `@AuthenticationPrincipal User user` in a controller method. The filter has
already loaded it. Never read a user id from the request body or a path variable.

**Transactions.** `@Transactional(readOnly = true)` on reads, `@Transactional` on writes, both on
the service, never on the controller. Remember that self-invocation bypasses the proxy.

**Lazy loading.** `open-in-view=false`. Fetch the object graph you need up front with
`@EntityGraph` (see `ProblemRepository.findWithStepById`), or Jackson will hit a closed session.

**DTOs.** Java `record`s, usually nested inside the service or controller that owns them
(`ProgressService.SheetProgress`, `PeerService.PeerView`). Entities are never returned directly.

## Tests

```bash
mvn -B test   # 29 tests
```

Unit tests with **mocked repositories** — no database, which is why CI runs them without Neon
credentials. They exist to pin the two invariants that would otherwise break silently:

1. XP and `total_solved` move **if and only if** a problem crosses the SOLVED boundary, exactly
   once, in either direction (`ProgressServiceTest`).
2. Refresh-token reuse revokes the whole chain via the `REQUIRES_NEW` revoker (`AuthServiceTest`).

There are **no integration tests**. Each phase was verified by driving the running system end to
end against real Neon and real LeetCode/Codeforces, but that is not a regression suite.

## Adding a feature: the checklist

1. Write the migration. `V<n>__what_it_does.sql`. Never edit an applied one.
2. Add the entity and repository in a new (or existing) feature package.
3. Put the rules in a `@Transactional` service. If the feature can change whether a problem is
   solved, it must go through `ProgressService` — do not touch `users.xp` yourself.
4. Add a thin controller. Take `@AuthenticationPrincipal User`. Return a record.
5. If the endpoint should be public, add it to `SecurityConfig`. Think first: `/api/peers/search`
   is authenticated precisely because an open version would leak the username list.
6. Add the TypeScript interface to `frontend/src/app/core/models/api.models.ts`.
7. Unit-test the invariant, not the plumbing.
