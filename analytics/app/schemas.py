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
    """Request body for /fetch/leetcode and /fetch/codeforces; handle is the platform username."""

    handle: str = Field(min_length=1, max_length=100)


class LeetCodeStats(CamelModel):
    """Response of /fetch/leetcode; found=False means the best-effort lookup failed and error says why."""

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
    """Response of /fetch/codeforces; found=False means the lookup failed and error says why."""

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
    """One topic's solved/total counts, as Spring feeds them to both analytics endpoints."""

    topic: str
    solved: int = Field(ge=0)
    total: int = Field(ge=0)


class WeaknessRequest(CamelModel):
    """Request body for /analytics/weakness."""

    user_id: int
    by_topic: list[TopicStat]


class TopicMastery(CamelModel):
    """A scored topic in the /analytics/weakness response; mastery is solved/total, gap is problems left."""

    topic: str
    mastery: float
    solved: int
    total: int
    gap: int


class WeaknessResponse(CamelModel):
    """Response of /analytics/weakness; strongest is drawn only from topics not already named weakest."""

    user_id: int
    weakest: list[TopicMastery]
    strongest: list[TopicMastery]
    overall_mastery: float


class Candidate(CamelModel):
    """A problem eligible for revision in the /analytics/revise-next request; next_review_at drives overdue-ness."""

    problem_id: int
    title: str = ""
    topic: str | None = None
    difficulty: Difficulty = "MEDIUM"
    interval_days: int | None = None
    last_reviewed_at: datetime | None = None
    next_review_at: datetime | None = None


class ReviseNextRequest(CamelModel):
    """Request body for /analytics/revise-next; by_topic feeds the topic-weakness signal."""

    user_id: int
    by_topic: list[TopicStat] = Field(default_factory=list)
    candidates: list[Candidate]


class Recommendation(CamelModel):
    """One ranked problem in the /analytics/revise-next response; priority is 0..1, reason is human-readable."""

    problem_id: int
    title: str
    reason: str
    priority: float
    suggested_interval_days: int


class ReviseNextResponse(CamelModel):
    """Response of /analytics/revise-next; recommendations are ordered by descending priority."""

    user_id: int
    recommendations: list[Recommendation]


# ------------------------------------------------------------- code execution

class ExecuteRequest(CamelModel):
    """Body of POST /execute. `language` is a Piston language id or alias (e.g. `python`, `cpp`)."""

    language: str = Field(min_length=1, max_length=40)
    source: str = Field(max_length=100_000)
    stdin: str = Field(default="", max_length=50_000)


class ExecuteResult(CamelModel):
    """Outcome of one run. `ran` is False when the language is unknown or Piston was unreachable.

    `compile_output` carries compiler diagnostics for a program that never got to run; `error`
    carries a proxy-level failure (bad language, upstream down) that is not the user's code.
    """

    ran: bool
    language: str
    version: str | None = None
    stdout: str = ""
    stderr: str = ""
    compile_output: str | None = None
    exit_code: int | None = None
    signal: str | None = None
    error: str | None = None
