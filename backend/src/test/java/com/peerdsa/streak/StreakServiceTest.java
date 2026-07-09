package com.peerdsa.streak;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.peerdsa.user.User;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Streak transitions depend on "yesterday", which cannot be exercised against a live
 * server without waiting a day. These pin the arithmetic instead.
 */
class StreakServiceTest {

    private DailyActivityRepository activities;
    private StreakService streaks;

    @BeforeEach
    void setUp() {
        activities = mock(DailyActivityRepository.class);
        when(activities.findByUserIdAndActivityDate(any(), any())).thenReturn(Optional.empty());
        streaks = new StreakService(activities, "UTC");
    }

    private User userWith(int current, int longest, LocalDate lastActive) {
        User user = new User();
        user.setCurrentStreak(current);
        user.setLongestStreak(longest);
        user.setLastActiveDate(lastActive);
        return user;
    }

    @Test
    void firstEverSolveStartsStreakAtOne() {
        User user = userWith(0, 0, null);

        streaks.recordSolve(user, 10);

        assertThat(user.getCurrentStreak()).isEqualTo(1);
        assertThat(user.getLongestStreak()).isEqualTo(1);
        assertThat(user.getLastActiveDate()).isEqualTo(streaks.today());
    }

    @Test
    void solvingOnConsecutiveDayExtendsStreak() {
        User user = userWith(4, 4, streaks.today().minusDays(1));

        streaks.recordSolve(user, 10);

        assertThat(user.getCurrentStreak()).isEqualTo(5);
        assertThat(user.getLongestStreak()).isEqualTo(5);
    }

    @Test
    void secondSolveSameDayDoesNotExtendStreak() {
        User user = userWith(3, 7, streaks.today());

        streaks.recordSolve(user, 10);

        assertThat(user.getCurrentStreak()).isEqualTo(3);
        assertThat(user.getLongestStreak()).isEqualTo(7);
    }

    @Test
    void solvingAfterAMissedDayRestartsStreakAtOne() {
        User user = userWith(9, 9, streaks.today().minusDays(2));

        streaks.recordSolve(user, 10);

        assertThat(user.getCurrentStreak()).isEqualTo(1);
        // A personal best is never lost when the streak breaks.
        assertThat(user.getLongestStreak()).isEqualTo(9);
    }

    @Test
    void effectiveStreakIsZeroOnceADayIsMissed() {
        // The stored column still says 9; nothing writes on an idle day.
        User user = userWith(9, 9, streaks.today().minusDays(2));

        assertThat(streaks.effectiveCurrentStreak(user)).isZero();
    }

    @Test
    void effectiveStreakSurvivesUntilYesterday() {
        User yesterday = userWith(9, 9, streaks.today().minusDays(1));
        User todayUser = userWith(9, 9, streaks.today());

        assertThat(streaks.effectiveCurrentStreak(yesterday)).isEqualTo(9);
        assertThat(streaks.effectiveCurrentStreak(todayUser)).isEqualTo(9);
    }

    @Test
    void neverActiveUserHasNoStreak() {
        assertThat(streaks.effectiveCurrentStreak(userWith(0, 0, null))).isZero();
    }
}
