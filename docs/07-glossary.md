# 07 — Glossary

Terms this codebase uses in a specific way. When a comment says "the ladder", it means the thing
defined here.

### The sheet

The **Striver A2Z sheet** — a curated list of 474 DSA problems, organised into 18 **steps** and 62
**sub-steps**, published by takeuforward. It is the content of this app, and it is seeded into the
database by `V2__seed_sheet.sql`, which is **generated** by `tools/seed/build_striver_a2z.py` and
committed.

### Step / sub-step / problem

The three-level content hierarchy. Step 1 is "Learn the basics"; a sub-step under it is "Things to
know in C++/Java/Python"; a problem under that is "User Input / Output". Each level is ordered by a
`position` column.

### Topic

A cross-cutting label on a problem (`Arrays`, `Binary Search`, `DP`, …), independent of the step
hierarchy. Many-to-many via `problem_topics`. Topics are what the **weakness report** analyses.

### Status

A problem's state for one user: `SOLVED`, `ATTEMPTED`, `REVISIT`, or **null**.

Null does *not* mean unsolved-and-untouched. It means the row exists for another reason — the
problem is starred. **No row at all** means untouched. See `chk_ups_not_empty`.

### The SOLVED transition

The moment a problem crosses into or out of `SOLVED`. It is the single most important event in the
system: XP, `total_solved`, the daily activity row, the streak counters and badge awards all move
here, in one transaction, exactly once, in either direction.

It lives in `ProgressService.applySolveTransition`. Nothing else may touch `users.xp`.

### XP and level

Experience points. `EASY` 10, `MEDIUM` 20, `HARD` 40. The whole sheet is worth **10,680 XP**.
One **level** per 500 XP, so a completed sheet is level 22.

### Streak

Consecutive calendar days on which you solved at least one problem. Which calendar depends on
`STREAK_ZONE` (default UTC; set it to your audience's zone or late-night solves land on the wrong
day).

### The stale streak problem

**An idle day writes nothing.** Nothing runs at midnight to notice you did not solve anything, so
`users.current_streak` is stale the moment you miss a day.

Three things compensate, and you must know which one you are relying on:

1. `StreakService.effectiveCurrentStreak()` — the read-time correction. Returns 0 once a day is
   missed. **Use this**, not the raw column.
2. The leaderboard SQL corrects it inline with a `CASE WHEN last_active_date >= CURRENT_DATE - 1`.
3. `StreakScheduler` — a nightly job that reconciles the stored column. **Cleanup, not correctness.**

Because (3) is not load-bearing, the app survives Render's free tier, where scheduled jobs do not
fire while the service is asleep.

### The ladder

The fixed spaced-repetition interval sequence: **1, 3, 7, 16, 35, 90 days**, saturating at 90 so
reviews never stop.

"Got it" (`/done`) climbs one rung. "Forgot" (`/reset`) drops to 1 day. An off-ladder interval
climbs to the next rung *above* it — 5 becomes 7, not 16.

Deliberately **not SM-2**: without a self-reported recall quality per review there is nothing to
drive an ease factor.

The ladder is written down **twice** — `RevisionSchedule.INTERVALS_DAYS` in Java and `LADDER` in
`analytics/app/services/revision.py`. Neither can see the other. Change one, change both.

### Orthogonal (of a revision schedule)

A revision schedule and a problem's status are independent. Scheduling a `SOLVED` problem leaves it
`SOLVED`; retiring a schedule leaves the status untouched. If scheduling forced `REVISIT`, the
SOLVED transition would fire as an un-solve and silently refund the problem's XP.

### Denormalized counters

`users.xp`, `total_solved`, `current_streak`, `longest_streak`, `last_active_date`. They duplicate
information derivable from `user_problem_status`, on purpose: they make the leaderboard a single
indexed scan instead of a `COUNT(*)` across every user's progress rows.

The price is that `applySolveTransition` must keep them honest, in the same transaction.

### Single-flight (refresh)

When several requests 401 at once, they all subscribe to **one** in-flight refresh call rather than
each starting their own. Implemented by `AuthStore.refreshOnce` with `shareReplay`.

Without it, N parallel refreshes rotate each other's tokens, and the backend correctly reads the
second use of an already-rotated token as **token theft**.

### Refresh-token rotation and reuse detection

Every use of a refresh token issues a new one and revokes the old, recording the chain in
`replaced_by`. Presenting an already-revoked token means a copy exists somewhere, so every refresh
token for that user is revoked.

That revocation runs in a `REQUIRES_NEW` transaction (`RefreshTokenRevoker`), because the `401` that
reports the theft would otherwise roll it back.

### User-enumeration oracle

Any endpoint whose response tells an anonymous caller whether an account exists. `/api/auth/forgot`
returns `204` unconditionally, and its rate limit is silent, precisely to avoid being one.
`/api/peers/search` requires authentication for the same class of reason.

### Best-effort (of a sync)

A platform sync that is allowed to fail without consequence. LeetCode has no official API, so
`clients/leetcode.py` degrades to `found: false` rather than raising. A failed sync records a
`FAILED` run, leaves the cached stats in place, and never touches sheet progress.

### External stats

Whatever LeetCode or Codeforces last returned, cached verbatim as `jsonb` on
`platform_accounts.external_stats`. **Never merged into `daily_activity`** — folding LeetCode's
submission calendar into the heatmap would inflate streaks and XP the user never earned on this
sheet. Shown side by side on `/profile` instead.

### Optional (of the analytics service)

The FastAPI service can be down and the app still works. `/api/analytics/*` answers **503** rather
than 500, syncs record `FAILED` runs, and the dashboard renders everything else. Nothing in the core
app depends on it.

### Pooled vs unpooled (Neon)

Neon exposes two endpoints for the same database. The **pooled** one (host contains `-pooler`) goes
through PgBouncer and is what the running app uses. The **direct/unpooled** one is what Flyway must
use, because PgBouncer's transaction mode breaks Flyway's session-level advisory lock.

Both are required. Both need `?sslmode=require&channelBinding=require`.

### Spin-down (Render free tier)

A free Render service stops after 15 minutes of inactivity. The next request waits 30–60 seconds
(or 1–3 minutes for a JVM cold start) while it wakes.

Consequences accepted, not fixed: `@Scheduled` jobs do not fire while asleep, `ANALYTICS_READ_TIMEOUT`
is 60s because Render *queues* rather than refuses requests to a sleeping service, and platform sync
becomes manual via the button on `/profile`.

### Zoneless (Angular)

The app runs without `zone.js`. Change detection is driven by **signals**, not by monkey-patched
async APIs. In practice: use `signal()`, `computed()`, and `input()`; never rely on a `setTimeout`
to trigger a re-render.

### `typ`, `sst`, `vbc` (JWT claims)

Three claims on the access token, each carrying a rule.

**`typ`** — what the token is for. Only `access` authenticates a request. Every token the app mints
carries it, and anything else is refused by the authentication filter, so a scoped or challenge
token added later cannot become a session merely by being a valid signature over a subject.

**`sst`** — session start. Set once, copied unchanged onto every rotation, and checked against
`app.jwt.session-max`. Refresh expiry slides forward on each use, so without a fixed anchor a
session that is merely *used* often enough never ends — and neither would a stolen token.

**`vbc`** — "verified by code": this session began by proving control of the registered address.
It exists so somebody who has forgotten their password can set a new one without producing the old
one. It is honoured only within `app.jwt.verified-window` (15 minutes), is **never carried across a
refresh** — a renewed session is no longer "just verified" — and grants nothing else, ever.

### Demo mode (`OTP_DEMO_MODE`)

Returns the one-time code in the HTTP response instead of emailing it, so the flow works with no
mail provider configured. It is a **separate branch**, taken before delivery is even attempted —
never a fallback when a send fails. The shape that looks natural,

```java
if (!demoMode && delivery.send(email, code)) return null;
return code;
```

hands a working credential to anyone who can make delivery fail, and making it fail is easy: ask
for a code for an address the provider rejects. It must be `false` in production.

### Rotation race vs. token theft

Two tabs, or a reload during an in-flight refresh, both present the same refresh token. One wins the
rotation; the loser's replay looks exactly like a stolen token being reused.

The difference is the successor's age. A replay is a **race** when the presented token has a
successor rotated within `app.jwt.refresh-grace` (seconds, never minutes) — the racer is handed a
fresh chain and nothing is revoked. Otherwise it is **theft**, and every refresh token for that user
dies. A token revoked *without* a successor was logged out, so there is no rotation to date a
window from; replaying that is theft however fresh it looks.

### Reflow (WCAG 1.4.10)

Content must work at a **320 CSS px** viewport with no two-dimensional scrolling — which is what
400% zoom on a 1280px screen actually means. Wide content may scroll inside its own container (the
leaderboard table, the heatmap); the page itself may not.
