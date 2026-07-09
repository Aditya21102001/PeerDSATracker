package com.peerdsa.gamification;

/** The user metric a {@link Badge} compares its {@code criteriaValue} against when awarding. */
public enum CriteriaType {
    TOTAL_SOLVED,
    /** Compared against longest_streak, so a badge survives a broken streak. */
    STREAK,
    XP,
    /** Declared but not evaluated yet; {@link GamificationService} treats it as never met. */
    TOPIC_COMPLETE
}
