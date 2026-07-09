"""LeetCode client -- the fragile boundary of this system.

LeetCode has NO official public API. This talks to the undocumented GraphQL
endpoint the website itself uses. Everything here is reverse-engineered and can
break without notice, so every failure degrades to `found=False` with an `error`
string rather than raising.

Observed behaviour (verified 2026-07-09):
  * an unknown user is HTTP 200 with {"data": {"matchedUser": null}, "errors": [...]}
  * `submissionCalendar` is a JSON-encoded *string*, not an object
  * `acSubmissionNum` includes an "All" bucket alongside Easy/Medium/Hard
  * browser-like headers were not required on this date, but Cloudflare has
    demanded them before -- send them anyway
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.schemas import LeetCodeStats

_QUERY = """
query userStats($username: String!) {
  matchedUser(username: $username) {
    username
    profile { ranking }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
}
"""

_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Referer": "https://leetcode.com",
    "Origin": "https://leetcode.com",
}


async def fetch(handle: str) -> LeetCodeStats:
    now = datetime.now(timezone.utc)
    missing = LeetCodeStats(handle=handle, found=False, fetched_at=now)

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(
                settings.leetcode_graphql_url,
                headers=_HEADERS,
                json={"query": _QUERY, "variables": {"username": handle}},
            )
            body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        return missing.model_copy(update={"error": f"{type(exc).__name__}: {exc}"})

    user = (body.get("data") or {}).get("matchedUser")
    if not user:
        errors = body.get("errors") or [{}]
        return missing.model_copy(update={"error": errors[0].get("message", "user not found")})

    counts = {
        entry["difficulty"]: entry["count"]
        for entry in (user.get("submitStatsGlobal") or {}).get("acSubmissionNum", [])
    }
    calendar_raw = (user.get("userCalendar") or {}).get("submissionCalendar")

    return LeetCodeStats(
        handle=user.get("username", handle),
        found=True,
        total_solved=counts.get("All", 0),
        easy=counts.get("Easy", 0),
        medium=counts.get("Medium", 0),
        hard=counts.get("Hard", 0),
        ranking=(user.get("profile") or {}).get("ranking"),
        streak=(user.get("userCalendar") or {}).get("streak"),
        total_active_days=(user.get("userCalendar") or {}).get("totalActiveDays"),
        submission_calendar=_parse_calendar(calendar_raw),
        fetched_at=now,
    )


def _parse_calendar(raw: str | None) -> dict[str, int]:
    """submissionCalendar arrives as a JSON string of {unix_seconds: count}."""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return {str(k): int(v) for k, v in parsed.items()} if isinstance(parsed, dict) else {}
