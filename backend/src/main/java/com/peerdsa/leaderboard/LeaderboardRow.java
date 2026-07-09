package com.peerdsa.leaderboard;

/**
 * Interface projection over the native leaderboard query. The SQL quotes its aliases
 * ("userId") so Postgres preserves the camelCase the projection binds to.
 */
public interface LeaderboardRow {

    long getRank();

    Long getUserId();

    String getUsername();

    String getDisplayName();

    String getAvatarUrl();

    int getXp();

    int getTotalSolved();

    int getCurrentStreak();
}
