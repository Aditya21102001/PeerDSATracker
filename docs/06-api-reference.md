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
| POST | `/login` | **public** | `{identifier, password}` | `TokenResponse` |
| POST | `/refresh` | **public** | `{refreshToken}` | `TokenResponse` |
| POST | `/logout` | | `{refreshToken}` | `204` |
| POST | `/otp/request` | **public** | `{email}` | `202` + `OtpRequestResponse` |
| POST | `/otp/verify` | **public** | `{email, code}` | `TokenResponse` |
| POST | `/change-password` | yes | `{newPassword, currentPassword?, code?}` | `ChangePasswordResponse` |
| GET | `/options` | **public** | — | `AuthOptions` |
| POST | `/forgot` | **public** | `{email}` | `204` — **always** |
| POST | `/reset` | **public** | `{token, password}` | `204` |
| GET | `/me` | yes | — | `MeResponse` |

```ts
TokenResponse          { accessToken, refreshToken, expiresInSeconds }
OtpRequestResponse     { demoMode: boolean; demoCode: string | null }
ChangePasswordResponse { username: string; tokens: TokenResponse }
AuthOptions            { googleEnabled: boolean; otpDemoMode: boolean }
MeResponse             { id, email, username, displayName, hasPassword,
                         xp, totalSolved, currentStreak, longestStreak }
```

### Sign-in takes a username **or** an email

`identifier` is tried as a username first, then as an email if it contains `@`. Both have to work:
recovery is keyed by email while sign-in is keyed by username, and an account created through
Google has a **generated** username its owner has never seen. If one person's username is another's
email address, the username wins — the field is labelled "username".

`email` is still accepted as a legacy alias, because the SPA and the backend deploy separately and
for a few minutes the old SPA is still posting it.

An account with **no password hash** (created through Google) is refused, not crashed on: the null
never reaches the encoder, and a dummy hash is matched instead so a miss costs the same bcrypt as a
wrong password. One message — `Invalid username or password` — for every way it can fail.

### One-time codes

`POST /otp/request` answers **202 whether or not the address is registered**. Anything else is a
user-enumeration oracle. Two other outcomes are possible and neither leaks anything:

- **429** — over the hourly budget for that address. The limit is applied *before* the account
  lookup, so unregistered addresses are throttled identically. Otherwise a 429 would mean "this
  address is registered".
- **503** — the provider would not take the message. The code that was about to be issued is
  **deleted**.

`demoCode` is populated **only** when `OTP_DEMO_MODE=true`, never as a fallback when delivery
fails. It is a development affordance: with it on, anyone who asks for a code for your address is
handed it. It must be `false` in production.

`POST /otp/verify` resolves the account from the address the code was **issued to**, which the
server already knows — never from anything else in the request. The token it returns carries the
`vbc` claim (below).

### Changing a password: one endpoint, three proofs

Tried in this order, and exactly one need hold:

1. the caller's own token, if it was issued by code verification and is **within 15 minutes** of
   issue (`vbc`) — nothing is sent in the body at all;
2. a fresh one-time code;
3. the current password.

The first two are what make this a *recovery*: somebody who has forgotten their password has no
current password to give, and an account created through Google has never had one.

- The account comes from the **session**. There is no field in the body naming a user.
- **One identical message for every proof failure.** Distinguishing "wrong current password" from
  "wrong code" tells an attacker which half they got right.
- The response reports the **username the password was set on**, and the SPA shows it — for a
  Google-created account that name is genuinely news, and without it the next sign-in fails with
  "invalid username or password" with nothing on screen to explain why.
- Every existing refresh token is revoked and the caller is handed a replacement pair, so this
  signs out the *other* devices rather than all of them.

### Access-token claims

| Claim | Meaning |
|---|---|
| `typ` | Only `access` authenticates a request. A scoped or challenge token added later cannot become a session merely by being a valid signature over a subject. |
| `sst` | When the session began. Set once, copied onto every rotation, enforced against `app.jwt.session-max` — refresh expiry slides forward on each use, so without this a busy session never ends. |
| `vbc` | "This session began by proving control of the registered address." Honoured only within `app.jwt.verified-window`, **never carried across a refresh**, and grants nothing else. |

### Notes that still matter

- **`/refresh` rotates.** The returned refresh token replaces the one you sent. Presenting a token
  that was already rotated revokes **every** refresh token for that user — it is treated as theft,
  unless it is a rotation race inside `app.jwt.refresh-grace`. The client's refresh must be
  single-flight.
- **`/forgot` always returns 204**, registered email or not, rate-limited or not.
- `/forgot` and `/reset` return **404** when `RESET_ENABLED=false` (the production default). That
  older link-by-email flow still has no mailer; recovery in production goes through `/otp/*`, which
  does. Nothing in the UI links to `/forgot` any more.

---

## OAuth2 — Google

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/oauth2/authorization/google` | **public** | Starts the flow. A full-page navigation, not a fetch. |
| GET | `/login/oauth2/code/google` | **public** | Google's callback. Register this exact URL in the Google console. |

Neither exists unless `app.oauth.google.client-id` and `client-secret` are both set — absent
credentials mean the feature is not installed, and `GET /api/auth/options` reports
`googleEnabled: false` so the SPA hides the button rather than showing one that 401s.

Both hops must be on the **same origin**. Spring holds the pending authorization request in a
session cookie, so starting the flow through a proxy and returning to the backend fails on a state
mismatch — which is why production points `apiOrigin` straight at the backend rather than through
Vercel's rewrite.

The callback ends in a redirect to `<app.frontend-base-url>/oauth/callback` carrying either
`#token=<refreshToken>` or `#error=<message>` — always the fragment, never the query string, so it
never reaches a server log. The SPA spends the token immediately, so the value that briefly sat in
the address bar is already rotated away.

| Outcome | Result |
|---|---|
| Address already has an account | Signs in **with the role it already has**. No path here writes a role. |
| Unknown address, `OAUTH_AUTO_PROVISION=false` | Refused, with a message telling them to sign up first. |
| Unknown address, auto-provisioning on | Created with `OAUTH_DEFAULT_ROLE`, no password hash, generated username. Startup **fails** if that role is privileged. |
| No email in the profile | Refused — there is nothing to match on. |

Every refusal is caught and redirected. Letting one propagate would render the backend's error page,
on the backend's domain, to somebody who clicked a button on the frontend.

---

## Mail — `/api/mail`

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/unsubscribe?u={id}&t={token}` | **public** | — | `200` HTML |
| GET | `/preferences` | yes | — | `MailPreferences` |
| POST | `/preferences` | yes | `{dailyDigest}` | `MailPreferences` |

`/unsubscribe` needs no session **by design**: the person most likely to want out is the one who has
abandoned the account and cannot sign in, and making them log in first is how an unsubscribe link
becomes a "report spam" click — and complaint rate, not intent, is what gets a sending domain
suspended. The token is an HMAC of the user id, carries no expiry (a link in a year-old email must
still work), and is one-way: it can stop mail and do nothing else. Re-subscribing requires the
authenticated toggle. A bad token returns the same page as a good one.

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
