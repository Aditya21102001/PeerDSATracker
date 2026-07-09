package com.peerdsa.gamification;

public enum CriteriaType {
    TOTAL_SOLVED,
    /** Compared against longest_streak, so a badge survives a broken streak. */
    STREAK,
    XP,
    TOPIC_COMPLETE
}
