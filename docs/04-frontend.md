# 04 — Frontend tour

Angular 22, **zoneless**, signals for state, standalone components, every feature route lazy-loaded.

```bash
cd frontend && npm install && npx ng serve   # → http://localhost:4300
```

`proxy.conf.json` forwards `/api` to `http://localhost:8081`, so the browser makes no cross-origin
request and you never meet CORS in development. Production does the same thing with a Vercel
rewrite.

## Layout

```
src/app/
├── app.ts / app.html / app.scss   the shell: a theme toggle and a <router-outlet>
├── app.config.ts                  providers, interceptors, the session-restore initializer
├── app.routes.ts                  every route, all lazy
├── core/                          singletons. No component lives here.
│   ├── guards/       authGuard, guestGuard
│   ├── interceptors/ authInterceptor
│   ├── models/       api.models.ts — the TypeScript mirror of the backend's DTOs
│   └── services/     stores and HTTP services
├── features/                      one folder per page, each lazy-loaded
│   ├── auth/         signin, signup, forgot, reset
│   ├── dashboard/    streak, XP, badges, heatmap, analytics panels
│   ├── sheet/        the 474 problems
│   ├── revision/     the spaced-repetition queue
│   ├── notes/        the note index and the per-problem editor
│   ├── peers/        follow / unfollow / search
│   ├── leaderboard/  global and peers
│   └── profile/      linked LeetCode / Codeforces accounts
└── shared/                        heatmap-calendar, theme-toggle, spinner
```

## House rules

These are enforced by convention and by `frontend/.claude/CLAUDE.md`. Read that file too.

- **Standalone components only.** Never write `standalone: true` — it is the default since v20.
- **Never set `changeDetection: OnPush`.** It is the default since v22. Setting it is noise.
- **Signals for state**, `computed()` for derived state. Never `mutate` — use `set` or `update`.
- **`inject()` over constructor injection.** `@Service()` over `@Injectable({providedIn:'root'})`.
- **`input()` / `output()` functions**, not the decorators.
- **Native control flow** (`@if`, `@for`, `@switch`), never `*ngIf` / `*ngFor`.
- **`class` and `style` bindings**, never `ngClass` / `ngStyle`.
- **Accessibility is a requirement, not a nicety.** It must pass AXE and meet WCAG AA: focus
  management, colour contrast, ARIA. Look at `shared/spinner.ts` for the standard being held to.

## State: two stores and some HTTP services

The distinction matters.

**Stores hold signals.** `AuthStore` and `ProgressStore` own state that outlives a component.
Components read their readonly signals and call their methods.

**Services are stateless HTTP wrappers.** `SheetService`, `NotesService`, `PeerService`,
`ActivityService`, `InsightsService`. They return `Observable`s and hold nothing.

`TokenService` is the sole owner of token storage. Nothing else may touch `localStorage` for auth.

### `AuthStore` — the part to understand

```
                  ┌──────────────────────────────────────┐
  request 401 ───▶│ authInterceptor                      │
                  │   is it a PUBLIC_PATH?  → pass through│
                  │   no refresh token?     → rethrow     │
                  └──────────────┬───────────────────────┘
                                 │
                                 ▼
                     AuthStore.refreshOnce()
                                 │
             ┌───────────────────┴────────────────────┐
             │ already an in-flight refresh?          │
             │   yes → subscribe to that same one ────┼──▶ shareReplay
             │   no  → start one, store it            │
             └───────────────────┬────────────────────┘
                                 │
                                 ▼
                  POST /api/auth/refresh   (via rawHttp,
                                            bypassing the interceptor)
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
              new tokens stored        failure → forceSignOut()
              original request retried
```

Two guards, both load-bearing:

1. **Single-flight.** Six dashboard requests that all 401 at once share **one** refresh. Six
   parallel refreshes would each rotate the token, the backend would see the second use of an
   already-rotated token as **theft**, and it would revoke the entire chain. The session would die
   on a perfectly normal page load.
2. **`rawHttp`.** `AuthStore` builds a second `HttpClient` from `HttpBackend` for the refresh call
   alone. Routed through the interceptor, a 401 on `/auth/refresh` would recurse into refresh.

### Session restore

`app.config.ts`:

```ts
provideAppInitializer(() => firstValueFrom(inject(AuthStore).restoreSession()))
```

The access token is held **in memory only**, so a reload loses it while the refresh token survives
in `localStorage`. Without this initializer, `authGuard` would wave the user through and the
dashboard would fire six unauthenticated requests before the interceptor noticed.

If the refresh fails, the session is genuinely over — the tokens are cleared so the guard redirects
to `/signin` rather than letting a page load and fail.

### `ProgressStore` — optimistic mutation

```ts
setStatus(problem, status) {
  const previous = problem.status;
  this.patch(problem.id, { status });        // 1. flip the row immediately

  request.subscribe({
    next:  () => this.loadProgress(),        // 2. re-fetch counters — server owns them
    error: () => this.patch(problem.id, { status: previous }),   // 3. roll back
  });
}
```

Step 2 is the interesting one. The counters are **not** recomputed locally, because marking a
problem SOLVED also moves XP, the streak, the day's activity row and possibly a badge — none of
which the client can derive. Ask the server.

## Routing

Every feature route uses `loadComponent`, so the initial bundle carries only the shell plus
whichever route the user landed on.

```ts
provideRouter(routes, withComponentInputBinding())
```

`withComponentInputBinding()` is what lets `notes/:problemId` bind straight to a
`problemId = input.required<string>()` on `NoteEditor`.

### Recovery and sign-in routes

| Route | Guard | Purpose |
|---|---|---|
| `/signin` | guest | Username **or** email, plus "Forgot password?" and the Google button. |
| `/code` | guest | Sign in with a one-time code, then set a password. The real recovery path. |
| `/oauth/callback` | **none** | Where the backend lands the browser after Google, successful or refused. |
| `/security` | auth | Change or set a password; offers the current password *or* a code. |

`/oauth/callback` is deliberately **not** guest-guarded: establishing the session is the whole
job of that route, and a guard would fire on the very reload that follows it.

Both "Forgot password?" and "Signed up with Google?" point at `/code`. One destination, two
wordings — somebody who forgot a password will not click "sign in with a code", and somebody
who signed up with Google has no password to have forgotten.

**The older link-by-email reset routes are conditional:**

```ts
const resetRoutes: Routes = environment.resetEnabled ? [ /* forgot, reset */ ] : [];
```

When disabled, the routes are **absent entirely** — the lazy chunks never ship, and a stale
bookmark falls through to the wildcard redirect. The backend 404s the matching endpoints, and the
"Forgot?" link is hidden. All three must be flipped on the same day a mailer exists.

Note that `/reset` is deliberately **not** guest-guarded: a signed-in user following a reset link
from their inbox should still reach the form. `/forgot` is guest-only.

Nothing in the UI links to `/forgot` any more — `/code` supersedes it and has a working
transport. The routes remain only so an old emailed link still resolves.

## Accessibility

The bar is **WCAG 2.1 AA**, and it is enforced by tests rather than by review — accessibility
regressions are invisible to everyone who is not affected by them. A button that loses its
label, an input whose `for` stops matching, a heading level skipped during a refactor: none of
these look wrong, none break a build, and none are noticed by anybody using a mouse and a
screen.

| Spec | Covers |
|---|---|
| `a11y.spec.ts` | axe-core over every routed screen, WCAG 2.1 A + AA. Includes a **guard test** that deliberately breaks markup and asserts axe catches it — without it, a misconfigured rule set would show green ticks while checking nothing. |
| `design-tokens.spec.ts` | Colour contrast, computed from the real tokens parsed out of `styles.scss`. axe **cannot** do this: its `color-contrast` rule needs a layout engine, and jsdom has none, so it reports "incomplete" rather than failing. |
| `keyboard-a11y.spec.ts` | Behaviours axe cannot see — the skip link has a target on every page, one `main` per page, heading levels never skip, no control announced as nothing. |

Things worth knowing before changing styles:

- **`--border-control`, not `--border`, outlines form fields.** `--border` is 1.3:1 against
  white — deliberately faint, and deliberately only for decorative separators. A field's edge
  is how somebody knows the field is there, so it owes the 3:1 of WCAG 1.4.11.
- **`--text-faint` is real text**, including placeholders, so it owes 4.5:1 on every surface it
  can sit on. If the contrast test fails, darken the token — do not reclassify the text as
  decorative.
- **The skip link targets `#main-content`**, which every routed page carries on its `<main>`,
  along with `tabindex="-1"`. Without the tabindex the browser scrolls but leaves focus on the
  link, so the next Tab walks straight back into the nav the user just skipped.
- **Reflow is 320px**, i.e. 400% zoom at a 1280px baseline (WCAG 1.4.10). No fixed pixel widths;
  every breakpoint sits at 26rem or wider so it applies there; wide content (the leaderboard
  table, the heatmap) scrolls inside its own `.scroll-x` box rather than widening the page.
- **Touch targets** are keyed on `@media (pointer: coarse)`, not viewport width — a 1024px
  tablet has the same thumbs as a 375px phone, and a width breakpoint sails straight past it.

One caveat, stated plainly: axe in jsdom checks what lives in the markup. It is not a
substitute for testing with a real screen reader.

## Theming

`ThemeService` owns the `data-theme` attribute on `<html>`. Three values: `light`, `dark`,
`system`. `'system'` **removes** the attribute and lets the `prefers-color-scheme` media query in
`styles.scss` decide.

An inline script in `index.html` applies the stored value **before first paint** — otherwise the
page flashes the wrong theme. The service keeps it in sync afterwards, and listens for OS-level
changes so `resolved()` recomputes under a `system` setting.

Writes to `localStorage` are wrapped in `try/catch`: in private mode the choice simply will not
survive a reload, which is fine.

## Degrading when analytics is down

`InsightsService` wraps `/api/analytics/*` in a retry that fires **only on 503**:

```ts
retry({
  count: WAKE_RETRIES,
  delay: (error, attempt) =>
    error.status === 503 ? timer(WAKE_DELAY_MS * attempt) : throwError(() => error),
})
```

A 503 means the backend could not reach the analytics service — almost always because Render is
spinning it back up after 15 minutes idle, which takes 30–60 seconds. Any other status is a real
failure and fails fast.

The dashboard must render its streak, XP, badges and heatmap **regardless**. The analytics panels
degrade; they do not break the page.

## Adding a page

1. Add the interface to `core/models/api.models.ts`, matching the backend record exactly.
2. Add a method to the relevant HTTP service (or add a new one, single-responsibility).
3. Create `features/<name>/<name>-page.ts` — standalone, inline template, signals.
4. Register a lazy route in `app.routes.ts` with `canActivate: [authGuard]`.
5. Check it against AXE and keyboard navigation before you call it done.
