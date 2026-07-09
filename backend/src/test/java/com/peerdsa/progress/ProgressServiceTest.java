package com.peerdsa.progress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.gamification.GamificationService;
import com.peerdsa.sheet.Difficulty;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import com.peerdsa.streak.StreakService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;

/**
 * The XP invariant: `users.xp` and `users.total_solved` must move if and only if a
 * problem crosses the SOLVED boundary, exactly once, in either direction. Everything
 * else in the app -- the leaderboard, badges, levels -- reads those two counters, so a
 * regression here would be silent and would corrupt every user's standing.
 */
class ProgressServiceTest {

    private static final long USER_ID = 7L;
    private static final long PROBLEM_ID = 42L;

    private UserProblemStatusRepository statuses;
    private ProblemRepository problems;
    private UserRepository users;
    private StreakService streaks;
    private GamificationService gamification;
    private ProgressService progress;

    private User user;
    private Problem hardProblem;

    @BeforeEach
    void setUp() {
        statuses = mock(UserProblemStatusRepository.class);
        problems = mock(ProblemRepository.class);
        users = mock(UserRepository.class);
        streaks = mock(StreakService.class);
        gamification = mock(GamificationService.class);
        progress = new ProgressService(statuses, problems, users, streaks, gamification);

        user = new User();
        hardProblem = problemWith(Difficulty.HARD);

        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
        when(problems.findById(PROBLEM_ID)).thenReturn(Optional.of(hardProblem));
        // save() returns its argument, as Spring Data does.
        when(statuses.save(any())).thenAnswer((Answer<UserProblemStatus>) i -> i.getArgument(0));
    }

    private Problem problemWith(Difficulty difficulty) {
        Problem problem = mock(Problem.class);
        when(problem.getId()).thenReturn(PROBLEM_ID);
        when(problem.getDifficulty()).thenReturn(difficulty);
        return problem;
    }

    /** No existing row: the user has never touched this problem. */
    private void noExistingRow() {
        when(statuses.findByUserIdAndProblemId(USER_ID, PROBLEM_ID)).thenReturn(Optional.empty());
    }

    private void existingRow(ProblemStatus status) {
        UserProblemStatus row = new UserProblemStatus(USER_ID, hardProblem);
        row.setStatus(status);
        when(statuses.findByUserIdAndProblemId(USER_ID, PROBLEM_ID)).thenReturn(Optional.of(row));
    }

    @Test
    void solvingAHardProblemAwardsFortyXpAndOneSolve() {
        noExistingRow();

        progress.setStatus(USER_ID, PROBLEM_ID, ProblemStatus.SOLVED);

        assertThat(user.getXp()).isEqualTo(40);
        assertThat(user.getTotalSolved()).isEqualTo(1);
        verify(streaks).recordSolve(eq(user), eq(40));
        verify(gamification).awardEarnedBadges(user);
    }

    @Test
    void solvingAnAlreadySolvedProblemDoesNotDoubleCount() {
        existingRow(ProblemStatus.SOLVED);
        user.addXp(40);
        user.addSolved(1);

        progress.setStatus(USER_ID, PROBLEM_ID, ProblemStatus.SOLVED);

        assertThat(user.getXp()).isEqualTo(40);
        assertThat(user.getTotalSolved()).isEqualTo(1);
        verify(streaks, never()).recordSolve(any(), anyInt());
    }

    @Test
    void movingFromSolvedToAttemptedRefundsTheXp() {
        existingRow(ProblemStatus.SOLVED);
        user.addXp(40);
        user.addSolved(1);

        progress.setStatus(USER_ID, PROBLEM_ID, ProblemStatus.ATTEMPTED);

        assertThat(user.getXp()).isZero();
        assertThat(user.getTotalSolved()).isZero();
        verify(streaks, never()).recordSolve(any(), anyInt());
    }

    @Test
    void attemptedToRevisitNeverTouchesXp() {
        existingRow(ProblemStatus.ATTEMPTED);

        progress.setStatus(USER_ID, PROBLEM_ID, ProblemStatus.REVISIT);

        assertThat(user.getXp()).isZero();
        assertThat(user.getTotalSolved()).isZero();
        verify(users, never()).save(any());
    }

    @Test
    void clearingASolvedProblemRefundsExactlyOnce() {
        existingRow(ProblemStatus.SOLVED);
        user.addXp(40);
        user.addSolved(1);

        progress.clearStatus(USER_ID, PROBLEM_ID);

        assertThat(user.getXp()).isZero();
        assertThat(user.getTotalSolved()).isZero();
    }

    @Test
    void clearingAnUnsolvedProblemDoesNotDriveCountersNegative() {
        existingRow(ProblemStatus.ATTEMPTED);

        progress.clearStatus(USER_ID, PROBLEM_ID);

        assertThat(user.getXp()).isZero();
        assertThat(user.getTotalSolved()).isZero();
    }

    @Test
    void markingRevisitSchedulesTheFirstReview() {
        noExistingRow();

        UserProblemStatus row = progress.setStatus(USER_ID, PROBLEM_ID, ProblemStatus.REVISIT);

        assertThat(row.getNextReviewAt()).isNotNull();
        assertThat(row.getReviewIntervalDays()).isEqualTo(1);
    }

    @Test
    void xpIsAwardedByDifficulty() {
        assertThat(GamificationService.xpFor(Difficulty.EASY)).isEqualTo(10);
        assertThat(GamificationService.xpFor(Difficulty.MEDIUM)).isEqualTo(20);
        assertThat(GamificationService.xpFor(Difficulty.HARD)).isEqualTo(40);
    }
}
