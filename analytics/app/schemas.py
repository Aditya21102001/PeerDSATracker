from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Difficulty = Literal["EASY", "MEDIUM", "HARD"]


class CamelModel(BaseModel):
    """Python stays snake_case; the wire stays camelCase, which is what Spring sends.

    populate_by_name lets requests arrive in either form; FastAPI serialises
    responses by alias, so replies are always camelCase.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------------------------------------------------------------- fetch

class FetchRequest(CamelModel):
    handle: str = Field(min_length=1, max_length=100)


class LeetCodeStats(CamelModel):
    handle: str
    found: bool
    total_solved: int = 0
    easy: int = 0
    medium: int = 0
    hard: int = 0
    ranking: int | None = None
    streak: int | None = None
    total_active_days: int | None = None
    # unix-second (as string) -> submissions that day
    submission_calendar: dict[str, int] = Field(default_factory=dict)
    fetched_at: datetime
    source: str = "leetcode-graphql-unofficial"
    error: str | None = None


class CodeforcesStats(CamelModel):
    handle: str
    found: bool
    rating: int | None = None
    max_rating: int | None = None
    rank: str | None = None
    solved_count: int = 0
    solved_by_tag: dict[str, int] = Field(default_factory=dict)
    fetched_at: datetime
    source: str = "codeforces-api"
    error: str | None = None


# ------------------------------------------------------------ analytics

class TopicStat(CamelModel):
    topic: str
    solved: int = Field(ge=0)
    total: int = Field(ge=0)


class WeaknessRequest(CamelModel):
    user_id: int
    by_topic: list[TopicStat]


class TopicMastery(CamelModel):
    topic: str
    mastery: float
    solved: int
    total: int
    gap: int


class WeaknessResponse(CamelModel):
    user_id: int
    weakest: list[TopicMastery]
    strongest: list[TopicMastery]
    overall_mastery: float


class Candidate(CamelModel):
    problem_id: int
    title: str = ""
    topic: str | None = None
    difficulty: Difficulty = "MEDIUM"
    interval_days: int | None = None
    last_reviewed_at: datetime | None = None
    next_review_at: datetime | None = None


class ReviseNextRequest(CamelModel):
    user_id: int
    by_topic: list[TopicStat] = Field(default_factory=list)
    candidates: list[Candidate]


class Recommendation(CamelModel):
    problem_id: int
    title: str
    reason: str
    priority: float
    suggested_interval_days: int


class ReviseNextResponse(CamelModel):
    user_id: int
    recommendations: list[Recommendation]
