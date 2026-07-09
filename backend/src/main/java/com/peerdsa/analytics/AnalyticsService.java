package com.peerdsa.analytics;

import com.peerdsa.analytics.AnalyticsDtos.Candidate;
import com.peerdsa.analytics.AnalyticsDtos.ReviseNextRequest;
import com.peerdsa.analytics.AnalyticsDtos.ReviseNextResponse;
import com.peerdsa.analytics.AnalyticsDtos.TopicStat;
import com.peerdsa.analytics.AnalyticsDtos.WeaknessRequest;
import com.peerdsa.analytics.AnalyticsDtos.WeaknessResponse;
import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.UserProblemStatusRepository;
import com.peerdsa.sheet.ProblemRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gathers the rows FastAPI needs, calls it, returns what it computed. Spring owns
 * the database; the analytics service never touches it.
 */
@Service
public class AnalyticsService {

    private final ProblemRepository problems;
    private final UserProblemStatusRepository statuses;
    private final AnalyticsClient client;

    public AnalyticsService(
            ProblemRepository problems, UserProblemStatusRepository statuses, AnalyticsClient client) {
        this.problems = problems;
        this.statuses = statuses;
        this.client = client;
    }

    @Transactional(readOnly = true)
    public WeaknessResponse weakness(Long userId) {
        return client.weakness(new WeaknessRequest(userId, byTopic(userId)));
    }

    @Transactional(readOnly = true)
    public ReviseNextResponse reviseNext(Long userId) {
        List<Candidate> candidates = statuses.findScheduled(userId).stream()
                .map(s -> new Candidate(
                        s.getProblem().getId(),
                        s.getProblem().getTitle(),
                        s.getProblem().primaryTopicName(),
                        s.getProblem().getDifficulty().name(),
                        s.getReviewIntervalDays(),
                        s.getLastReviewedAt(),
                        s.getNextReviewAt()))
                .toList();

        return client.reviseNext(new ReviseNextRequest(userId, byTopic(userId), candidates));
    }

    /** Per-topic solved/total for this user: two grouped queries, merged here. */
    private List<TopicStat> byTopic(Long userId) {
        Map<String, Long> solved = new HashMap<>();
        for (var row : statuses.countPerTopicByStatus(userId, ProblemStatus.SOLVED)) {
            solved.put(row.getTopic(), row.getSolved());
        }

        return problems.countPerTopic().stream()
                .map(t -> new TopicStat(t.getTopic(), solved.getOrDefault(t.getTopic(), 0L), t.getTotal()))
                .toList();
    }
}
