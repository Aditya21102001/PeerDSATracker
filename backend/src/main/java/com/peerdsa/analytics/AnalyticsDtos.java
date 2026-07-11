package com.peerdsa.analytics;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire contract with the FastAPI service. camelCase on both sides. */
public final class AnalyticsDtos {

    private AnalyticsDtos() {}

    /** One topic's solved/total counts, the raw input FastAPI scores into mastery. */
    public record TopicStat(String topic, long solved, long total) {}

    /** FastAPI's computed mastery for a topic; {@code gap} is the unsolved remainder. */
    public record TopicMastery(String topic, double mastery, long solved, long total, long gap) {}

    /** Request for {@code /analytics/weakness}: this user's per-topic progress. */
    public record WeaknessRequest(Long userId, List<TopicStat> byTopic) {}

    /** FastAPI's weakest/strongest topic ranking for {@code /analytics/weakness}. */
    public record WeaknessResponse(
            Long userId, List<TopicMastery> weakest, List<TopicMastery> strongest, double overallMastery) {}

    /** A scheduled problem offered to {@code /analytics/revise-next} for ranking. */
    public record Candidate(
            Long problemId,
            String title,
            String topic,
            String difficulty,
            Integer intervalDays,
            Instant lastReviewedAt,
            Instant nextReviewAt) {}

    /** Request for {@code /analytics/revise-next}: progress plus the due candidates. */
    public record ReviseNextRequest(Long userId, List<TopicStat> byTopic, List<Candidate> candidates) {}

    /** One prioritised revision suggestion returned by {@code /analytics/revise-next}. */
    public record Recommendation(
            Long problemId, String title, String reason, double priority, int suggestedIntervalDays) {}

    /** FastAPI's ordered revision suggestions for {@code /analytics/revise-next}. */
    public record ReviseNextResponse(Long userId, List<Recommendation> recommendations) {}

    /** Shared request body for both {@code /fetch/leetcode} and {@code /fetch/codeforces}. */
    public record FetchRequest(String handle) {}

    /** Cached LeetCode profile; {@code found} is false, not an error, for an unknown handle. */
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

    /** Cached Codeforces profile; {@code found} is false, not an error, for an unknown handle. */
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

    /** Request for {@code /execute}: {@code language} is a Piston language id or alias. */
    public record ExecuteRequest(String language, String source, String stdin) {}

    /**
     * Result of one run in Piston's sandbox. {@code ran} is false when the language is unknown or
     * the sandbox was unreachable; {@code compileOutput} carries diagnostics for a program that
     * never got to run, and {@code error} a proxy-level failure that is not the user's code.
     */
    public record ExecuteResult(
            boolean ran,
            String language,
            String version,
            String stdout,
            String stderr,
            String compileOutput,
            Integer exitCode,
            String signal,
            String error) {}
}
