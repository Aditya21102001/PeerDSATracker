"""Ranks revision candidates. Pure compute: Spring supplies the rows, this orders them.

Priority blends three signals, each normalised to 0..1 and weighted:
  overdue-ness   -- how far past its review date the problem is
  topic weakness -- 1 - mastery of the problem's topic
  difficulty     -- harder problems decay faster, so they earn a nudge
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas import Candidate, Recommendation, ReviseNextRequest, ReviseNextResponse
from app.services.weakness import mastery_by_topic

W_OVERDUE = 0.55
W_WEAKNESS = 0.30
W_DIFFICULTY = 0.15

# Saturate overdue-ness here; two weeks late and a month late are equally urgent.
OVERDUE_SATURATION_DAYS = 14.0

DIFFICULTY_WEIGHT = {"EASY": 0.2, "MEDIUM": 0.6, "HARD": 1.0}

# Mirrors RevisionSchedule.INTERVALS_DAYS on the Java side.
LADDER = (1, 3, 7, 16, 35, 90)

TOP_N = 10


def _overdue_days(candidate: Candidate, now: datetime) -> float:
    if candidate.next_review_at is None:
        return 0.0
    due = candidate.next_review_at
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    return max(0.0, (now - due).total_seconds() / 86_400)


def _suggested_interval(candidate: Candidate, priority: float) -> int:
    """High priority means it is not sticking; pull the next review closer."""
    current = candidate.interval_days or LADDER[0]
    if priority >= 0.66:
        return LADDER[0]
    if priority >= 0.33:
        return current
    for rung in LADDER:
        if rung > current:
            return rung
    return LADDER[-1]


def _reason(overdue: float, weakness: float) -> str:
    parts = []
    # A few hours late is not "0d overdue"; only whole days are worth reporting.
    if overdue >= 1:
        parts.append(f"{int(overdue)}d overdue")
    if weakness >= 0.6:
        parts.append("weak topic")
    return " + ".join(parts) or "scheduled"


def recommend(request: ReviseNextRequest) -> ReviseNextResponse:
    now = datetime.now(timezone.utc)
    mastery = mastery_by_topic(request.by_topic)

    recommendations: list[Recommendation] = []
    for candidate in request.candidates:
        overdue = _overdue_days(candidate, now)
        overdue_score = min(overdue / OVERDUE_SATURATION_DAYS, 1.0)

        # An unknown topic is treated as neutral rather than maximally weak.
        weakness = 1.0 - mastery.get(candidate.topic or "", 0.5)
        difficulty = DIFFICULTY_WEIGHT.get(candidate.difficulty, 0.6)

        priority = round(
            W_OVERDUE * overdue_score + W_WEAKNESS * weakness + W_DIFFICULTY * difficulty, 4
        )

        recommendations.append(
            Recommendation(
                problem_id=candidate.problem_id,
                title=candidate.title,
                reason=_reason(overdue, weakness),
                priority=priority,
                suggested_interval_days=_suggested_interval(candidate, priority),
            )
        )

    recommendations.sort(key=lambda r: r.priority, reverse=True)
    return ReviseNextResponse(user_id=request.user_id, recommendations=recommendations[:TOP_N])
