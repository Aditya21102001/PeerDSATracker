"""Codeforces client.

Codeforces publishes a real, documented API. Public profile data needs no auth;
apiKey/apiSig are only for private data. Responses are always HTTP 200 with a
{"status": "OK" | "FAILED"} envelope, so a failed lookup must be read from the
body, not the status code.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.schemas import CodeforcesStats

# Recent submissions scanned for solved-by-tag. The full history of a prolific
# user is tens of thousands of rows; this keeps one request bounded.
SUBMISSION_SCAN_COUNT = 1000


async def fetch(handle: str) -> CodeforcesStats:
    now = datetime.now(timezone.utc)
    base = CodeforcesStats(handle=handle, found=False, fetched_at=now)

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            info = await client.get(f"{settings.codeforces_api_url}/user.info", params={"handles": handle})
            info_body = info.json()

            if info_body.get("status") != "OK" or not info_body.get("result"):
                return base.model_copy(update={"error": info_body.get("comment", "user not found")})

            user = info_body["result"][0]

            status = await client.get(
                f"{settings.codeforces_api_url}/user.status",
                params={"handle": handle, "from": 1, "count": SUBMISSION_SCAN_COUNT},
            )
            status_body = status.json()

    except (httpx.HTTPError, ValueError) as exc:
        return base.model_copy(update={"error": f"{type(exc).__name__}: {exc}"})

    solved: set[int | str] = set()
    tags: Counter[str] = Counter()

    if status_body.get("status") == "OK":
        for submission in status_body.get("result", []):
            if submission.get("verdict") != "OK":
                continue
            problem = submission.get("problem", {})
            key = f"{problem.get('contestId')}-{problem.get('index')}"
            if key in solved:
                continue  # the same problem solved twice is still one problem
            solved.add(key)
            tags.update(problem.get("tags", []))

    return CodeforcesStats(
        handle=handle,
        found=True,
        rating=user.get("rating"),
        max_rating=user.get("maxRating"),
        rank=user.get("rank"),
        solved_count=len(solved),
        solved_by_tag=dict(tags.most_common(20)),
        fetched_at=now,
    )
