package com.peerdsa.analytics;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire contract with the FastAPI service. camelCase on both sides. */
public final class AnalyticsDtos {

    private AnalyticsDtos() {}

    public record TopicStat(String topic, long solved, long total) {}

    public record TopicMastery(String topic, double mastery, long solved, long total, long gap) {}

    public record WeaknessRequest(Long userId, List<TopicStat> byTopic) {}

    public record WeaknessResponse(
            Long userId, List<TopicMastery> weakest, List<TopicMastery> strongest, double overallMastery) {}

    public record Candidate(
            Long problemId,
            String title,
            String topic,
            String difficulty,
            Integer intervalDays,
            Instant lastReviewedAt,
            Instant nextReviewAt) {}

    public record ReviseNextRequest(Long userId, List<TopicStat> byTopic, List<Candidate> candidates) {}

    public record Recommendation(
            Long problemId, String title, String reason, double priority, int suggestedIntervalDays) {}

    public record ReviseNextResponse(Long userId, List<Recommendation> recommendations) {}

    public record FetchRequest(String handle) {}

    public record LeetCodeStats(
            String handle,
            boolean found,
            int totalSolved,
            int easy,
            int medium,
            int hard,
            Integer ranking,
            Integer streak,
            Integer totalActiveDays,
            Map<String, Integer> submissionCalendar,
            Instant fetchedAt,
            String source,
            String error) {}

    public record CodeforcesStats(
            String handle,
            boolean found,
            Integer rating,
            Integer maxRating,
            String rank,
            int solvedCount,
            Map<String, Integer> solvedByTag,
            Instant fetchedAt,
            String source,
            String error) {}
}
