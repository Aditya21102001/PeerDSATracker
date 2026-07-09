"""Per-topic mastery. Pure compute: Spring supplies solved/total per topic, this ranks them.

Mastery is simply solved/total. Only topics with at least MIN_PROBLEMS_FOR_RANKING problems are
ranked, but mastery is still reported for every topic the caller sent.

`mastery_by_topic` is the lookup that `revision.py` reuses to weight a candidate by how weak its
topic is.
"""

from __future__ import annotations

from app.schemas import TopicMastery, TopicStat, WeaknessRequest, WeaknessResponse

# A topic with almost no problems in the sheet says little about mastery.
MIN_PROBLEMS_FOR_RANKING = 5
TOP_N = 3


def _mastery(stat: TopicStat) -> TopicMastery:
    ratio = stat.solved / stat.total if stat.total else 0.0
    return TopicMastery(
        topic=stat.topic,
        mastery=round(ratio, 4),
        solved=stat.solved,
        total=stat.total,
        gap=max(0, stat.total - stat.solved),
    )


def analyse(request: WeaknessRequest) -> WeaknessResponse:
    stats = [s for s in request.by_topic if s.total > 0]

    solved = sum(s.solved for s in stats)
    total = sum(s.total for s in stats)
    overall = round(solved / total, 4) if total else 0.0

    # Rank only topics with enough problems to be meaningful, but still report
    # mastery for every topic the caller sent.
    rankable = [_mastery(s) for s in stats if s.total >= MIN_PROBLEMS_FOR_RANKING]

    # Ties broken by the larger gap: more unsolved problems is the bigger hole.
    weakest = sorted(rankable, key=lambda m: (m.mastery, -m.gap))[:TOP_N]

    # Strongest is drawn from what is left, so a barely-touched topic can never be
    # reported as both a weakness and a strength.
    weakest_topics = {m.topic for m in weakest}
    remaining = [m for m in rankable if m.topic not in weakest_topics]
    strongest = sorted(remaining, key=lambda m: (-m.mastery, m.gap))[:TOP_N]

    return WeaknessResponse(
        user_id=request.user_id,
        weakest=weakest,
        strongest=strongest,
        overall_mastery=overall,
    )


def mastery_by_topic(by_topic: list[TopicStat]) -> dict[str, float]:
    return {s.topic: (s.solved / s.total if s.total else 0.0) for s in by_topic}
