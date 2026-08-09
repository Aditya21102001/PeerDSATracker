# PeerDSATracker — Documentation

Everything you need to understand this codebase, in the order you should read it.

If you have never seen this project before, read [01-architecture.md](01-architecture.md) first
and do not skip it. Everything else assumes you know why there are three services.

| # | Document | What it answers |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | What are the three services, why three, and how does one request travel through them? |
| 02 | [Data model](02-data-model.md) | What tables exist, how do they relate, and which invariants must never break? |
| 03 | [Backend tour](03-backend.md) | What lives in each Java package, and where do I put new code? |
| 04 | [Frontend tour](04-frontend.md) | How is the Angular app organised, and how does state flow? |
| 05 | [Analytics service](05-analytics.md) | What does the Python service do, and why is it separate? |
| 06 | [API reference](06-api-reference.md) | Every HTTP endpoint, what it takes, what it returns. |
| 07 | [Glossary](07-glossary.md) | What does "XP", "the ladder", "single-flight", "the sheet" mean here? |
| — | [Diagrams](diagrams/) | PlantUML class and flow diagrams for authentication, recovery and the mail pipeline. |

### Diagrams

`docs/diagrams/*.puml`. Render with `plantuml docs/diagrams/*.puml`, or paste one into
<https://www.plantuml.com/plantuml>.

| File | What it shows |
|---|---|
| `class-auth.puml` | Where each authentication rule lives: the three JWT claims, the three password proofs, the OAuth refusals. |
| `class-mail.puml` | One transport, two senders — sign-in codes and the digest both go through `BrevoMailClient`. |
| `flow-account-recovery.puml` | Code request → verify → the set-a-password step that makes it a recovery rather than a permanent workaround. |
| `flow-google-signin.puml` | The redirect dance, and both ways it is refused. |
| `flow-token-lifecycle.puml` | Rotation, the benign race, theft, and the two ceilings. |
| `flow-daily-digest.puml` | One digest run, morning or evening. |

The root [README.md](../README.md) is the operational document: setup, environment variables,
deployment, and the hard-won gotchas that will bite you (Neon's pooler versus Flyway, HTTP/2
versus uvicorn, Render's free-tier spin-down). This folder is the conceptual document. They do
not repeat each other.

## The one-paragraph version

PeerDSATracker helps you work through the **Striver A2Z sheet** — a curated list of 474 data
structures and algorithms problems — and stay motivated while you do it. You mark problems as
solved, which earns you XP and keeps a daily streak alive. You star problems, take notes on them,
and put them into a spaced-repetition queue that tells you what to revise and when. You follow
peers and compare progress on a leaderboard. Optionally you link your LeetCode and Codeforces
handles and see those numbers alongside your sheet progress.

## The shape of the thing

```
  Browser
     │
     │  HTTPS, same origin only (Vercel rewrites /api/* server-side)
     ▼
┌─────────────────┐         ┌──────────────────┐
│  Angular SPA    │────────▶│  Spring Boot     │  ← the ONLY writer to the database
│  (Vercel)       │  /api   │  (Render)        │
└─────────────────┘         └────────┬─────────┘
                                     │
                    ┌────────────────┴───────────────┐
                    │                                │
                    ▼                                ▼
           ┌─────────────────┐            ┌──────────────────────┐
           │  PostgreSQL     │            │  FastAPI analytics   │
           │  (Neon)         │            │  (Render)            │
           └─────────────────┘            │  stateless, DB-less  │
                                          └──────────┬───────────┘
                                                     │
                                          ┌──────────┴───────────┐
                                          ▼                      ▼
                                     LeetCode              Codeforces
                                    (unofficial)            (official)
```

The browser never talks to the analytics service, and the analytics service never talks to the
database. Both of those are deliberate. [01-architecture.md](01-architecture.md) explains why.

## Where to start reading code

If you learn best by following one feature end to end, follow **"mark a problem as solved"**.
It is the single most important path in the system, and it touches almost everything:

1. `frontend/src/app/features/sheet/sheet-page.ts` — the checkbox you click.
2. `frontend/src/app/core/services/progress.store.ts` — flips the row optimistically.
3. `frontend/src/app/core/services/sheet.service.ts` — `PUT /api/status/problems/{id}`.
4. `frontend/src/app/core/interceptors/auth.interceptor.ts` — attaches the bearer token.
5. `backend/.../security/JwtAuthenticationFilter.java` — turns the token into a `User`.
6. `backend/.../progress/StatusController.java` — the endpoint.
7. `backend/.../progress/ProgressService.java` — **read `applySolveTransition` slowly.** XP, the
   streak, the day's activity row and badge awards all move here, in one transaction.

That one method is where most of this project's correctness lives.
