from app.schemas import TopicStat, WeaknessRequest
from app.services import weakness


def stats(pairs):
    return [TopicStat(topic=t, solved=s, total=n) for t, s, n in pairs]


def test_overall_mastery_is_solved_over_total():
    result = weakness.analyse(WeaknessRequest(user_id=1, by_topic=stats([("A", 5, 10), ("B", 5, 10)])))
    assert result.overall_mastery == 0.5


def test_no_topics_does_not_divide_by_zero():
    result = weakness.analyse(WeaknessRequest(user_id=1, by_topic=[]))
    assert result.overall_mastery == 0.0
    assert result.weakest == []


def test_topic_with_zero_problems_is_ignored():
    result = weakness.analyse(WeaknessRequest(user_id=1, by_topic=stats([("A", 0, 0), ("B", 3, 6)])))
    assert result.overall_mastery == 0.5
    assert [m.topic for m in result.weakest] == ["B"]


def test_tiny_topics_are_excluded_from_ranking():
    # 'Tries' has 3 problems -- too few to say anything about mastery.
    result = weakness.analyse(WeaknessRequest(user_id=1, by_topic=stats([("Tries", 0, 3), ("DP", 1, 50)])))
    ranked = [m.topic for m in result.weakest + result.strongest]
    assert "Tries" not in ranked
    assert "DP" in ranked


def test_weakest_and_strongest_never_name_the_same_topic():
    result = weakness.analyse(
        WeaknessRequest(
            user_id=1,
            by_topic=stats([("A", 9, 10), ("B", 1, 10), ("C", 5, 10), ("D", 2, 10), ("E", 8, 10), ("F", 3, 10)]),
        )
    )
    weakest = {m.topic for m in result.weakest}
    strongest = {m.topic for m in result.strongest}
    assert not (weakest & strongest)
    assert "B" in weakest and "A" in strongest


def test_ties_are_broken_by_the_larger_gap():
    # Same 0% mastery; the topic with more unsolved problems is the bigger hole.
    result = weakness.analyse(WeaknessRequest(user_id=1, by_topic=stats([("small", 0, 6), ("big", 0, 60)])))
    assert result.weakest[0].topic == "big"
