from datetime import datetime, timedelta, timezone

from app.schemas import Candidate, ReviseNextRequest, TopicStat
from app.services import revision


def now():
    return datetime.now(timezone.utc)


def candidate(**kwargs):
    defaults = dict(problem_id=1, title="p", topic="T", difficulty="MEDIUM", interval_days=7)
    return Candidate(**{**defaults, **kwargs})


def test_no_candidates_returns_nothing():
    result = revision.recommend(ReviseNextRequest(user_id=1, candidates=[]))
    assert result.recommendations == []


def test_more_overdue_ranks_higher():
    result = revision.recommend(
        ReviseNextRequest(
            user_id=1,
            candidates=[
                candidate(problem_id=1, title="slightly", next_review_at=now() - timedelta(days=1)),
                candidate(problem_id=2, title="very", next_review_at=now() - timedelta(days=10)),
            ],
        )
    )
    assert [r.title for r in result.recommendations] == ["very", "slightly"]


def test_weak_topic_outranks_a_strong_one_at_equal_overdueness():
    due = now() - timedelta(days=2)
    result = revision.recommend(
        ReviseNextRequest(
            user_id=1,
            by_topic=[TopicStat(topic="strong", solved=9, total=10), TopicStat(topic="weak", solved=1, total=10)],
            candidates=[
                candidate(problem_id=1, title="strong-topic", topic="strong", next_review_at=due),
                candidate(problem_id=2, title="weak-topic", topic="weak", next_review_at=due),
            ],
        )
    )
    assert result.recommendations[0].title == "weak-topic"


def test_sub_day_lateness_is_not_reported_as_overdue():
    result = revision.recommend(
        ReviseNextRequest(user_id=1, candidates=[candidate(next_review_at=now() - timedelta(hours=3))])
    )
    assert result.recommendations[0].reason == "scheduled"


def test_whole_day_lateness_is_reported():
    result = revision.recommend(
        ReviseNextRequest(user_id=1, candidates=[candidate(next_review_at=now() - timedelta(days=4))])
    )
    assert "4d overdue" in result.recommendations[0].reason


def test_overdueness_saturates():
    a = revision.recommend(
        ReviseNextRequest(user_id=1, candidates=[candidate(next_review_at=now() - timedelta(days=14))])
    ).recommendations[0]
    b = revision.recommend(
        ReviseNextRequest(user_id=1, candidates=[candidate(next_review_at=now() - timedelta(days=400))])
    ).recommendations[0]
    assert a.priority == b.priority


def test_high_priority_pulls_the_next_review_closer():
    urgent = revision.recommend(
        ReviseNextRequest(
            user_id=1,
            by_topic=[TopicStat(topic="T", solved=0, total=100)],
            candidates=[candidate(difficulty="HARD", next_review_at=now() - timedelta(days=30))],
        )
    ).recommendations[0]
    assert urgent.priority >= 0.66
    assert urgent.suggested_interval_days == 1


def test_low_priority_lets_the_interval_grow():
    easy = revision.recommend(
        ReviseNextRequest(
            user_id=1,
            by_topic=[TopicStat(topic="T", solved=100, total=100)],
            candidates=[candidate(difficulty="EASY", interval_days=7, next_review_at=now() + timedelta(days=5))],
        )
    ).recommendations[0]
    assert easy.priority < 0.33
    assert easy.suggested_interval_days == 16  # the next rung up from 7


def test_an_unknown_topic_is_neutral_not_maximally_weak():
    due = now() - timedelta(days=2)
    result = revision.recommend(
        ReviseNextRequest(
            user_id=1,
            by_topic=[TopicStat(topic="weak", solved=0, total=10)],
            candidates=[
                candidate(problem_id=1, title="unknown-topic", topic=None, next_review_at=due),
                candidate(problem_id=2, title="known-weak", topic="weak", next_review_at=due),
            ],
        )
    )
    assert result.recommendations[0].title == "known-weak"
