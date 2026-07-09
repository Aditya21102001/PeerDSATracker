package com.peerdsa.leaderboard;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only ranking queries returning {@link LeaderboardRow} projections. Extends the bare
 * {@link Repository} rather than {@code JpaRepository} so it exposes only these native reads
 * and no entity CRUD over {@link User}.
 */
public interface LeaderboardRepository extends Repository<User, Long> {

    /**
     * Ranks off the denormalized counters on `users`, so this is one indexed scan
     * (idx_users_leaderboard) rather than a COUNT(*) over every user's progress rows.
     *
     * <p>RANK() is evaluated before LIMIT, so page 2 keeps the true global ranks.
     * current_streak is corrected inline: the stored column goes stale on an idle day
     * and the nightly job has not necessarily run yet.
     */
    @Query(
            value =
                    """
                    SELECT RANK() OVER (ORDER BY u.xp DESC, u.total_solved DESC) AS "rank",
                           u.id            AS "userId",
                           u.username      AS "username",
                           u.display_name  AS "displayName",
                           u.avatar_url    AS "avatarUrl",
                           u.xp            AS "xp",
                           u.total_solved  AS "totalSolved",
                           CASE WHEN u.last_active_date >= CURRENT_DATE - 1
                                THEN u.current_streak ELSE 0 END AS "currentStreak"
                    FROM users u
                    ORDER BY u.xp DESC, u.total_solved DESC
                    LIMIT :limit OFFSET :offset
                    """,
            nativeQuery = true)
    List<LeaderboardRow> global(@Param("limit") int limit, @Param("offset") int offset);

    /** Me plus everyone I follow. Ranks are relative to that set, not the world. */
    @Query(
            value =
                    """
                    WITH peers AS (
                        SELECT followee_id AS uid FROM follows WHERE follower_id = :me
                        UNION ALL
                        SELECT CAST(:me AS bigint)
                    )
                    SELECT RANK() OVER (ORDER BY u.xp DESC, u.total_solved DESC) AS "rank",
                           u.id            AS "userId",
                           u.username      AS "username",
                           u.display_name  AS "displayName",
                           u.avatar_url    AS "avatarUrl",
                           u.xp            AS "xp",
                           u.total_solved  AS "totalSolved",
                           CASE WHEN u.last_active_date >= CURRENT_DATE - 1
                                THEN u.current_streak ELSE 0 END AS "currentStreak"
                    FROM users u
                    JOIN peers p ON p.uid = u.id
                    ORDER BY u.xp DESC, u.total_solved DESC
                    """,
            nativeQuery = true)
    List<LeaderboardRow> peers(@Param("me") Long me);

    @Query(value = "SELECT count(*) FROM users", nativeQuery = true)
    long countUsers();
}
