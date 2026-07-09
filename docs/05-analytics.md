# 05 — The analytics service

Python 3.13, FastAPI, **stateless and DB-less**. It has no database driver and no credentials.

```bash
cd analytics
python -m venv .venv && ./.venv/Scripts/pip install -r requirements.txt
./.venv/Scripts/uvicorn app.main:app --reload --port 8000
python -m pytest -q     # 15 tests
```

## What it is for

Two unrelated jobs, which is why it exists as one service rather than two:

1. **Pure computation.** Given per-topic solved/total counts and a list of revision candidates,
   rank them. No I/O, no state.
2. **External I/O.** Talk to LeetCode and Codeforces, whose APIs are respectively undocumented and
   awkward. Quarantining that fragility outside the Java service is the point.

Spring Boot gathers the rows, calls this service, and stores whatever comes back. **This service
never touches the database.** Keeping exactly one writer means transactions, retries and
idempotency live in exactly one place.

## Layout

```
analytics/app/
├── main.py                 the FastAPI app; six routes
├── config.py               pydantic-settings; reads ../.env
├── deps.py                 require_internal_token — the shared-secret guard
├── schemas.py              every request/response model
├── services/
│   ├── weakness.py         per-topic mastery, weakest/strongest
│   └── revision.py         priority ranking of revision candidates
└── clients/
    ├── leetcode.py         unofficial GraphQL. The fragile boundary.
    └── codeforces.py       official REST API
```

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness probe (Render pings this) |
| `GET /internal/ping` | token | proves the handshake with Spring Boot works |
| `POST /fetch/leetcode` | token | best-effort profile stats |
| `POST /fetch/codeforces` | token | profile stats + solved-by-tag |
| `POST /analytics/weakness` | token | per-topic mastery report |
| `POST /analytics/revise-next` | token | ranked revision recommendations |

Every route except `/health` requires the `X-Internal-Token` header. That shared secret is what
makes a public URL acceptable — Render's free tier cannot host private services. Spring Boot is
the only legitimate caller.

## The wire format

Python stays `snake_case`; the wire stays `camelCase`, because that is what Spring sends and
expects. `CamelModel` in `schemas.py` does this with a pydantic alias generator:

```python
model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

`populate_by_name` lets requests arrive in either form; FastAPI serialises responses by alias, so
replies are always camelCase.

## `weakness.py`

Mastery is simply `solved / total` per topic.

Two rules that are easy to get wrong:

- **Only topics with at least 5 problems are ranked.** A topic with two problems in the whole sheet
  says nothing about mastery. Mastery is still *reported* for every topic the caller sent — it is
  only the weakest/strongest ranking that is filtered.
- **`strongest` is drawn from what is left after `weakest`.** Otherwise a barely-touched topic could
  be reported as both a weakness and a strength.

Ties in the weakest list break by the **larger gap**: at equal mastery, more unsolved problems is
the bigger hole.

## `revision.py`

Priority is a weighted blend of three signals, each normalised to 0..1:

| Signal | Weight | Notes |
|---|---|---|
| overdue-ness | 0.55 | saturates at 14 days — two weeks late and a month late are equally urgent |
| topic weakness | 0.30 | `1 - mastery`. An **unknown topic is neutral (0.5)**, not maximally weak |
| difficulty | 0.15 | EASY 0.2 / MEDIUM 0.6 / HARD 1.0 — harder problems decay faster |

The resulting priority then picks the suggested next interval:

```
priority >= 0.66  →  1 day        (it is not sticking; pull the review closer)
priority >= 0.33  →  keep current
otherwise         →  climb one rung
```

Top 10 are returned, sorted by priority.

> ### The ladder is duplicated
>
> ```python
> LADDER = (1, 3, 7, 16, 35, 90)   # analytics/app/services/revision.py
> ```
> ```java
> static final int[] INTERVALS_DAYS = {1, 3, 7, 16, 35, 90};   // RevisionSchedule.java
> ```
>
> Neither can see the other. **If you change one, change both.**
> `RevisionScheduleTest` and `test_revision.py::test_low_priority_lets_the_interval_grow` will
> catch the drift, but only if you run them.

Also note: "a few hours late" is not reported as "0d overdue" — only whole days are worth showing.

## `clients/leetcode.py` — the fragile boundary

**LeetCode has no official public API.** This talks to the undocumented GraphQL endpoint the
website itself uses. Everything here is reverse-engineered and can break without notice, so every
failure degrades to `found=False` with an `error` string rather than raising.

Three shape gotchas, all learned the hard way:

- An **unknown user is HTTP 200** with `{"data": {"matchedUser": null}, "errors": [...]}`. You
  cannot read success from the status code.
- **`submissionCalendar` is a JSON-encoded *string***, not an object. It needs a second
  `json.loads`.
- `acSubmissionNum` includes an `"All"` bucket alongside Easy/Medium/Hard.

Browser-like headers (`User-Agent`, `Referer`, `Origin`) are sent because Cloudflare has demanded
them before, even when it does not today.

## `clients/codeforces.py`

Codeforces publishes a real, documented API. Public profile data needs no auth.

But responses carry a `{"status": "OK" | "FAILED"}` envelope, and an unknown handle comes back as
**HTTP 400** with `{"status":"FAILED"}`. So, like LeetCode, **a failed lookup must be read from the
body, not the status code.**

Only the most recent 1000 submissions are scanned for solved-by-tag. A prolific user's full history
is tens of thousands of rows; this keeps one request bounded. The same problem solved twice still
counts once.

## Failure is a first-class outcome

Nothing in this service is allowed to take the main application down.

- A network error, a timeout, or a malformed response → `found=False` plus an `error` string.
- Spring Boot turns an unreachable analytics service into a **503** on `/api/analytics/*` — not a
  500, because the app itself is fine.
- A sync against a handle that does not exist records a `FAILED` run and leaves the previously
  cached stats in place.
- The Angular dashboard renders its streak, XP, badges and heatmap regardless.

The external clients are **deliberately not covered in CI**: they hit live third-party APIs, and an
upstream outage must never turn the build red.

## Two deployment notes worth knowing

**Pin HTTP/1.1 on the caller.** Spring Boot 4's default JDK `HttpClient` negotiates HTTP/2, which
over plaintext means an h2c upgrade. uvicorn's h11 server does not support it and **silently drops
the request body** — FastAPI then rejects the call with `field required, input: null`. See
`AnalyticsClient`.

**Use `python:3.13-slim`, never `-alpine`.** `uvicorn[standard]` pulls `uvloop` and `httptools`,
which are C extensions with no manylinux wheels for musl. Alpine would compile them from source.
