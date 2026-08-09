package com.peerdsa.mail;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import com.peerdsa.user.User;

/**
 * Everything the morning digest needs about every subscriber, in one query.
 *
 * <p>One query rather than a loop, deliberately. The obvious shape -- iterate users, then for each
 * one ask for their rank, their week, their revision queue -- is four round trips per person, and
 * the run happens against Neon's free tier where the compute may be cold and each trip is real
 * latency. At a few hundred users that is the difference between a run that finishes and one that
 * is still going when people have already opened the app.
 *
 * <p>Extends the bare {@link Repository} so it exposes this read and nothing else -- no entity CRUD
 * over {@link User} leaks in through the mail package.
 */
public interface DigestRepository extends Repository<User, Long> {

    /** One subscriber's figures. Field names match the quoted aliases below. */
    interface DigestRow {
        Long getUserId();

        String getEmail();

        String getUsername();

        String getDisplayName();

        int getXp();

        int getTotalSolved();

        int getCurrentStreak();

        int getLongestStreak();

        LocalDate getLastActiveDate();

        long getRank();

        int getSolvedThisWeek();

        int getRevisionsDue();
    }

    /**
     * Subscribed users with an address, most recently active first.
     *
     * <p>That ordering is what the daily cap cuts against: Brevo's free tier is 300 messages a day
     * shared with sign-in codes, so a large enough audience will not all fit. Sending to the people
     * who were here yesterday, and dropping the ones dormant for months, is both the more useful
     * choice and the safer one -- mail to long-abandoned accounts is what generates spam
     * complaints, and a complaint rate is what gets a sending domain suspended.
     *
     * <p>{@code currentStreak} is corrected inline: the stored column goes stale the moment a day
     * is missed, and the nightly reset job has not necessarily run by 9am.
     */
    @Query(
            value =
                    """
                    SELECT u.id             AS "userId",
                           u.email          AS "email",
                           u.username       AS "username",
                           u.display_name   AS "displayName",
                           u.xp             AS "xp",
                           u.total_solved   AS "totalSolved",
                           CASE WHEN u.last_active_date >= CAST(:today AS date) - 1
                                THEN u.current_streak ELSE 0 END AS "currentStreak",
                           u.longest_streak AS "longestStreak",
                           u.last_active_date AS "lastActiveDate",
                           r.rnk            AS "rank",
                           COALESCE(w.solved, 0) AS "solvedThisWeek",
                           COALESCE(d.due, 0)    AS "revisionsDue"
                    FROM users u
                    JOIN (
                        SELECT id, RANK() OVER (ORDER BY xp DESC, total_solved DESC) AS rnk
                        FROM users
                    ) r ON r.id = u.id
                    LEFT JOIN (
                        SELECT user_id, SUM(problems_solved) AS solved
                        FROM daily_activity
                        WHERE activity_date > CAST(:today AS date) - 7
                        GROUP BY user_id
                    ) w ON w.user_id = u.id
                    LEFT JOIN (
                        SELECT user_id, COUNT(*) AS due
                        FROM user_problem_status
                        WHERE next_review_at IS NOT NULL AND next_review_at <= now()
                        GROUP BY user_id
                    ) d ON d.user_id = u.id
                    WHERE u.email_digest
                      AND u.email IS NOT NULL
                      AND u.email <> ''
                    ORDER BY u.last_active_date DESC NULLS LAST, u.id
                    """,
            nativeQuery = true)
    List<DigestRow> subscribers(@Param("today") LocalDate today);
}
