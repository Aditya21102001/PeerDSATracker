package com.peerdsa.streak;

import com.peerdsa.user.User;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StreakService {

    private final DailyActivityRepository activities;
    private final ZoneId zone;

    public StreakService(
            DailyActivityRepository activities, @Value("${app.streak.zone:UTC}") String zone) {
        this.activities = activities;
        this.zone = ZoneId.of(zone);
    }

    public LocalDate today() {
        return LocalDate.now(zone);
    }

    /** Calendar day of an instant, in the streak zone. */
    public LocalDate dateOf(java.time.Instant instant) {
        return instant == null ? null : instant.atZone(zone).toLocalDate();
    }

    /**
     * Records one solve against today, in the same transaction as the status write.
     * Streak reads then cost nothing: they just read `users`.
     */
    @Transactional
    public void recordSolve(User user, int xp) {
        LocalDate today = today();
        bumpActivity(user.getId(), today, 1, xp);

        LocalDate last = user.getLastActiveDate();
        if (last == null || last.isBefore(today.minusDays(1))) {
            user.setCurrentStreak(1);
        } else if (last.equals(today.minusDays(1))) {
            user.setCurrentStreak(user.getCurrentStreak() + 1);
        } else if (last.equals(today)) {
            // Already active today; the streak was counted on the first solve.
            user.setCurrentStreak(Math.max(user.getCurrentStreak(), 1));
        }

        user.setLongestStreak(Math.max(user.getLongestStreak(), user.getCurrentStreak()));
        if (last == null || today.isAfter(last)) {
            user.setLastActiveDate(today);
        }
    }

    /**
     * Undoes one solve on the day it happened. Streak counters are deliberately not
     * rewound: recomputing a streak backwards needs the full history, and the nightly
     * reconciliation job owns that. Un-solving is rare and this keeps the hot path cheap.
     */
    @Transactional
    public void recordUnsolve(Long userId, LocalDate solvedOn, int xp) {
        if (solvedOn == null) {
            return;
        }
        bumpActivity(userId, solvedOn, -1, -xp);
    }

    private void bumpActivity(Long userId, LocalDate date, int problems, int xp) {
        DailyActivity existing = activities.findByUserIdAndActivityDate(userId, date).orElse(null);

        if (existing == null) {
            if (problems <= 0) {
                return; // nothing recorded for that day; nothing to undo
            }
            DailyActivity fresh = new DailyActivity(userId, date);
            fresh.add(problems, xp);
            activities.save(fresh);
            return;
        }

        existing.add(problems, xp);
        if (existing.isEmpty()) {
            // The day has nothing left to show; drop it so the heatmap has no dead cell.
            activities.delete(existing);
        } else {
            activities.save(existing);
        }
    }

    /**
     * The stored current_streak goes stale the moment a user misses a day, because an
     * idle day writes nothing. Correct it on read; the nightly job fixes the column.
     */
    public int effectiveCurrentStreak(User user) {
        LocalDate last = user.getLastActiveDate();
        if (last == null || last.isBefore(today().minusDays(1))) {
            return 0;
        }
        return user.getCurrentStreak();
    }

    @Transactional(readOnly = true)
    public StreakSummary summary(User user) {
        return new StreakSummary(
                effectiveCurrentStreak(user),
                user.getLongestStreak(),
                user.getLastActiveDate(),
                activities.countByUserId(user.getId()));
    }

    @Transactional(readOnly = true)
    public List<HeatmapDay> heatmap(Long userId, Integer year) {
        LocalDate to = year == null ? today() : LocalDate.of(year, 12, 31);
        LocalDate from = year == null ? to.minusDays(370) : LocalDate.of(year, 1, 1);

        return activities.findByUserIdAndActivityDateBetweenOrderByActivityDate(userId, from, to).stream()
                .map(a -> new HeatmapDay(a.getActivityDate(), a.getProblemsSolved(), a.getXpEarned()))
                .toList();
    }

    public record HeatmapDay(LocalDate date, int count, int xp) {}

    public record StreakSummary(int current, int longest, LocalDate lastActiveDate, long totalActiveDays) {}
}
