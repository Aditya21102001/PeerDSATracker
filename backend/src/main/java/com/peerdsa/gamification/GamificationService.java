package com.peerdsa.gamification;

import com.peerdsa.sheet.Difficulty;
import com.peerdsa.user.User;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * XP scoring and badge awarding. {@link #awardEarnedBadges} is idempotent and runs inside the
 * SOLVED-transition transaction, so it is safe to call on every solve without double-granting.
 */
@Service
public class GamificationService {

    /** One level per 500 XP. The full sheet is worth 10,680 XP. */
    private static final int XP_PER_LEVEL = 500;

    private final BadgeRepository badges;
    private final UserBadgeRepository userBadges;

    public GamificationService(BadgeRepository badges, UserBadgeRepository userBadges) {
        this.badges = badges;
        this.userBadges = userBadges;
    }

    public static int xpFor(Difficulty difficulty) {
        return switch (difficulty) {
            case EASY -> 10;
            case MEDIUM -> 20;
            case HARD -> 40;
        };
    }

    /**
     * Awards every badge whose threshold the user's counters now meet. Idempotent:
     * already-held badges are skipped, so this is safe to call on every solve.
     */
    @Transactional
    public List<Badge> awardEarnedBadges(User user) {
        Set<Long> held = userBadges.findByUserId(user.getId()).stream()
                .map(UserBadge::getBadgeId)
                .collect(Collectors.toSet());

        List<Badge> newlyAwarded = badges.findAll().stream()
                .filter(b -> !held.contains(b.getId()))
                .filter(b -> meets(user, b))
                .toList();

        newlyAwarded.forEach(b -> userBadges.save(new UserBadge(user.getId(), b.getId())));
        return newlyAwarded;
    }

    private boolean meets(User user, Badge badge) {
        return switch (badge.getCriteriaType()) {
            case TOTAL_SOLVED -> user.getTotalSolved() >= badge.getCriteriaValue();
            // longest_streak, not current: a badge earned is never taken away.
            case STREAK -> user.getLongestStreak() >= badge.getCriteriaValue();
            case XP -> user.getXp() >= badge.getCriteriaValue();
            case TOPIC_COMPLETE -> false; // not evaluated yet
        };
    }

    @Transactional(readOnly = true)
    public List<BadgeView> badgesFor(User user) {
        Map<Long, Instant> awardedAt = new HashMap<>();
        for (UserBadge ub : userBadges.findByUserId(user.getId())) {
            awardedAt.put(ub.getBadgeId(), ub.getAwardedAt());
        }

        return badges.findAllByOrderByIdAsc().stream()
                .map(b -> new BadgeView(
                        b.getCode(),
                        b.getName(),
                        b.getDescription(),
                        b.getIcon(),
                        b.getCriteriaType(),
                        b.getCriteriaValue(),
                        awardedAt.containsKey(b.getId()),
                        awardedAt.get(b.getId())))
                .toList();
    }

    /** Derives the 1-based level and progress within it from raw XP (level 1 starts at 0 XP). */
    public XpView xpFor(User user) {
        int xp = user.getXp();
        int level = 1 + xp / XP_PER_LEVEL;
        int intoLevel = xp % XP_PER_LEVEL;
        return new XpView(xp, level, intoLevel, XP_PER_LEVEL - intoLevel, XP_PER_LEVEL);
    }

    /** One badge as seen by a user: catalog fields plus whether and when they earned it. */
    public record BadgeView(
            String code,
            String name,
            String description,
            String icon,
            CriteriaType criteriaType,
            int criteriaValue,
            boolean earned,
            Instant awardedAt) {}

    /** XP progress payload: raw total, current level, and distance into and to the next level. */
    public record XpView(int xp, int level, int xpIntoLevel, int xpToNextLevel, int xpPerLevel) {}
}
