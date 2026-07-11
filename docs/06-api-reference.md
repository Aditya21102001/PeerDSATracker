# 06 — API reference

Base URL is the app's own origin: `/api/...`. The dev server proxies it to `:8081`; Vercel rewrites
it server-side in production. The browser never makes a cross-origin request.

**Authentication.** Every endpoint requires `Authorization: Bearer <access token>` unless marked
**public**. The `authInterceptor` attaches it automatically.

**Errors** share one shape, produced by `GlobalExceptionHandler`:

```json
{
  "timestamp": "2026-07-09T10:15:30Z",
  "status": 400,
  "message": "Validation failed",
  "fieldErrors": { "email": "must be a well-formed email address" }
}
```

`fieldErrors` is empty except on bean-validation failures, where it carries the first message per
field.

---

## Auth — `/api/auth`

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/signup` | **public** | `{email, username, password}` | `201` + `TokenResponse` |
| POST | `/login` | **public** | `{email, password}` | `TokenResponse` |
| POST | `/refresh` | **public** | `{refreshToken}` | `TokenResponse` |
| POST | `/logout` | | `{refreshToken}` | `204` |
| POST | `/forgot` | **public** | `{email}` | `204` — **always** |
| POST | `/reset` | **public** | `{token, newPassword}` | `204` |
| GET | `/me` | | — | `MeResponse` |

```ts
TokenResponse { accessToken: string; refreshToken: string; expiresInSeconds: number }
MeResponse    { id, email, username, displayName, xp, totalSolved, currentStreak, longestStreak }
```

Notes that matter:

- **`/refresh` rotates.** The returned refresh token replaces the one you sent. Presenting a token
  that was already rotated revokes **every** refresh token for that user — it is treated as theft.
  The client's refresh must be single-flight.
- **`/forgot` always returns 204**, registered email or not, rate-limited or not. Anything else is
  a user-enumeration oracle.
- **`/reset` revokes every refresh token** the user holds. A reset ends all other sessions.
- `/forgot` and `/reset` return **404** when `RESET_ENABLED=false` (the production default — there
  is no mailer).

---

## Sheet — `/api/sheet`

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/problems` | `step`, `difficulty`, `status`, `q`, `page=0`, `size=50` | `Page<ProblemDto>` |
| GET | `/problems/{problemId}` | — | `ProblemDto` |
| GET | `/progress` | — | `SheetProgress` |

- `difficulty` ∈ `EASY | MEDIUM | HARD`
- `status` ∈ `SOLVED | ATTEMPTED | REVISIT | UNSOLVED | STARRED` — the last two are pseudo-statuses
- `size` is clamped to 200
- Results are always in sheet order: step → sub-step → position

```ts
SheetProgress { total, solved, attempted, revisit, starred, steps: StepProgress[] }
StepProgress  { stepNo, stepTitle, total, solved }
```

---

## Status — `/api/status`

The write side of the sheet. **This is where XP moves.**

| Method | Path | Body | Returns |
|---|---|---|---|
| PUT | `/problems/{problemId}` | `{status}` | `{problemId, status, starred}` |
| DELETE | `/problems/{problemId}` | — | `204` |
| POST | `/problems/{problemId}/star` | — | `{problemId, starred}` |

Setting `SOLVED` (or clearing it) writes XP, `total_solved`, the day's activity row, the streak and
any newly earned badges **in one transaction**. Clearing a status deletes the row unless the
problem is still starred.

---

## Revision — `/api/revision`

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/queue` | — | `RevisionItem[]` — due now |
| GET | `/upcoming` | — | `RevisionItem[]` |
| POST | `/problems/{problemId}/schedule` | `{intervalDays?}` | `RevisionItem` |
| POST | `/problems/{problemId}/done` | — | `RevisionItem` — climb one rung |
| POST | `/problems/{problemId}/reset` | — | `RevisionItem` — back to 1 day |
| DELETE | `/problems/{problemId}` | — | `204` — stop revising |

```ts
RevisionItem { problemId, title, difficulty, stepNo, leetcodeUrl,
               nextReviewAt, intervalDays, lastReviewedAt, overdueDays }
```

**None of these can change a problem's status or move XP.** Scheduling a SOLVED problem leaves it
SOLVED. Only a problem with no status at all gets `REVISIT` when scheduled.

---

## Notes — `/api/notes`

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/problems/{problemId}` | — | `NoteView` — never 404s |
| PUT | `/problems/{problemId}` | `{content}` (max 20,000 chars) | `NoteView` |
| DELETE | `/problems/{problemId}` | — | `204` |
| GET | `` | `page=0`, `size=20` | `Page<NoteSummary>` |

An unwritten note comes back with empty content rather than a 404. Saving empty content deletes it.

---

## Activity & gamification

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/activity/heatmap` | `year?` | `HeatmapDay[]` |
| GET | `/api/activity/streak` | — | `StreakSummary` |
| GET | `/api/gamification/badges` | — | `BadgeView[]` — earned and unearned |
| GET | `/api/gamification/xp` | — | `XpView` |

```ts
HeatmapDay    { date: "yyyy-MM-dd"; count: number; xp: number }
StreakSummary { current, longest, lastActiveDate, totalActiveDays }
XpView        { xp, level, xpIntoLevel, xpToNextLevel, xpPerLevel }
```

`heatmap` returns **only days with activity**. Gaps are normal — an idle day writes no row. Without
`year`, it returns the last 370 days.

`current` is corrected at read time; it reads 0 once a day is missed, even if the stored column has
not yet been reconciled by the nightly job.

---

## Peers & leaderboard

| Method | Path | Query | Returns |
|---|---|---|---|
| POST | `/api/peers/follow/{userId}` | — | `204` — idempotent |
| DELETE | `/api/peers/follow/{userId}` | — | `204` |
| GET | `/api/peers/following` | — | `PeerView[]` |
| GET | `/api/peers/followers` | — | `PeerView[]` |
| GET | `/api/peers/search` | `q` | `PeerView[]` — max 20 |
| GET | `/api/leaderboard/global` | `page`, `size` | `LeaderboardResponse` |
| GET | `/api/leaderboard/peers` | — | `LeaderboardRow[]` |

Following yourself is a `400`. `/search` **requires authentication** — an open endpoint would let
anyone enumerate every registered username.

`LeaderboardRow.rank` is a **true global rank**: `RANK()` is computed before `LIMIT`, so page 2
continues from where page 1 left off. Never re-derive a rank from a row's index.

`/leaderboard/peers` ranks you plus everyone you follow, **relative to that set**, not the world.

---

## Sync — `/api/sync`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/accounts` | `{platform, handle}` | `AccountView` |
| GET | `/accounts` | — | `AccountView[]` |
| DELETE | `/accounts/{platform}` | — | `204` |
| POST | `/run` | — | `RunView[]` — sync every linked account now |
| GET | `/runs` | — | `RunView[]` — last 20 |

`platform` ∈ `LEETCODE | CODEFORCES`.

`AccountView.externalStats` is whatever the platform last returned, cached verbatim. Its shape
varies by platform. A handle that does not exist produces a `FAILED` `RunView`, **not** an error
response, and the previously cached stats stay.

These numbers are never merged into your streak or XP, which are earned on this sheet only.

---

## Code — `/api/code`

The in-app code editor: write, save, and run code per problem.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/languages` | — | `LanguageOption[]` — the runnable languages |
| GET | `/problems/{problemId}` | — | `CodeDraft[]` — one per saved language |
| PUT | `/problems/{problemId}` | `{language, source}` | `CodeDraft` |
| POST | `/run` | `{language, source, stdin}` | `RunResult` |

```ts
LanguageOption { id, label, editorMode, template }
CodeDraft      { problemId, language, source, updatedAt }
RunResult      { ran, language, version, stdout, stderr, compileOutput, exitCode, signal, error }
```

`language` must be one of the ids from `/languages` (Python, C++, Java, JavaScript, C, Go) — any
other value is a `400`. Drafts are keyed by (user, problem, **language**), so each language keeps
its own solution.

`/run` proxies to Piston through the analytics service; **nothing runs on the backend or in the
browser**. A program that fails to compile or crashes is a normal `RunResult` (`ran: false` or a
non-zero `exitCode`, with `compileOutput`/`stderr` filled). Only the execution service being
unreachable is an error:

> **`/run` returns `503`** when the analytics/Piston service can't be reached — usually a cold
> start on Render's free tier. The editor tells the user to retry in a moment.

---

## Analytics — `/api/analytics`

| Method | Path | Returns |
|---|---|---|
| GET | `/weakness` | `WeaknessResponse` |
| GET | `/revise-next` | `ReviseNextResponse` |

Both proxy to the FastAPI service.

> **Both return `503` when that service is unreachable** — not 500, because the app itself is fine.
> Callers must degrade. The Angular `InsightsService` retries a 503 twice with a growing delay,
> because on Render's free tier the service is probably just waking up (30–60 seconds).

```ts
WeaknessResponse   { userId, weakest: TopicMastery[], strongest: TopicMastery[], overallMastery }
TopicMastery       { topic, mastery, solved, total, gap }
ReviseNextResponse { userId, recommendations: Recommendation[] }
Recommendation     { problemId, title, reason, priority, suggestedIntervalDays }
```

`weakest` and `strongest` never name the same topic, and only topics with at least 5 problems are
ranked.

---

## Actuator

| Path | Auth | Notes |
|---|---|---|
| `/actuator/health` | **public** | Render's health check. `MANAGEMENT_HEALTH_DB_ENABLED=false` in production |
| `/actuator/info` | **public** | |

---

## Internal: the analytics service

Not reachable from the browser. Every route except `/health` requires `X-Internal-Token`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness (public) |
| GET | `/internal/ping` | handshake check |
| POST | `/fetch/leetcode` | `{handle}` → `LeetCodeStats` |
| POST | `/fetch/codeforces` | `{handle}` → `CodeforcesStats` |
| POST | `/analytics/weakness` | `{userId, byTopic}` → `WeaknessResponse` |
| POST | `/analytics/revise-next` | `{userId, byTopic, candidates}` → `ReviseNextResponse` |
| POST | `/execute` | `{language, source, stdin}` → `ExecuteResult` (runs code in Piston's sandbox) |

`LeetCodeStats.found` / `CodeforcesStats.found` is `false` with an `error` string when the handle
does not exist or the upstream call failed. That is a normal response, not an error.
