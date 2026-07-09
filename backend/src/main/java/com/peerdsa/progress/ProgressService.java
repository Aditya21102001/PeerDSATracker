package com.peerdsa.progress;

import com.peerdsa.gamification.GamificationService;
import com.peerdsa.revision.RevisionSchedule;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import com.peerdsa.streak.StreakService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProgressService {

    private final UserProblemStatusRepository statuses;
    private final ProblemRepository problems;
    private final UserRepository users;
    private final StreakService streaks;
    private final GamificationService gamification;

    public ProgressService(
            UserProblemStatusRepository statuses,
            ProblemRepository problems,
            UserRepository users,
            StreakService streaks,
            GamificationService gamification) {
        this.statuses = statuses;
        this.problems = problems;
        this.users = users;
        this.streaks = streaks;
        this.gamification = gamification;
    }

    @Transactional(readOnly = true)
    public Map<Long, UserProblemStatus> statusesFor(Long userId, Collection<Long> problemIds) {
        if (problemIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, UserProblemStatus> byProblem = new HashMap<>();
        for (UserProblemStatus s : statuses.findByUserIdAndProblemIdIn(userId, problemIds)) {
            byProblem.put(s.getProblem().getId(), s);
        }
        return byProblem;
    }

    /**
     * The SOLVED transition is what drives XP, the daily activity row, the streak and
     * badge awards -- all inside this one transaction, so the denormalized counters on
     * `users` can never disagree with the status rows.
     */
    @Transactional
    public UserProblemStatus setStatus(Long userId, Long problemId, ProblemStatus status) {
        UserProblemStatus row = findOrCreate(userId, problemId);

        ProblemStatus previous = row.getStatus();
        Instant previouslySolvedAt = row.getSolvedAt();

        row.setStatus(status);
        // Marking something for revision with no schedule yet starts the ladder tomorrow.
        // Existing schedules are left alone -- they survive a status change on purpose.
        if (status == ProblemStatus.REVISIT && row.getNextReviewAt() == null) {
            int first = RevisionSchedule.firstInterval();
            row.scheduleReview(Instant.now().plus(Duration.ofDays(first)), first);
        }
        UserProblemStatus saved = statuses.save(row);

        applySolveTransition(userId, row.getProblem(), previous, status, previouslySolvedAt);
        return saved;
    }

    /** Clears the status. The row survives only if the problem is still starred. */
    @Transactional
    public void clearStatus(Long userId, Long problemId) {
        Optional<UserProblemStatus> existing = statuses.findByUserIdAndProblemId(userId, problemId);
        if (existing.isEmpty()) {
            return;
        }
        UserProblemStatus row = existing.get();
        ProblemStatus previous = row.getStatus();
        Instant previouslySolvedAt = row.getSolvedAt();
        Problem problem = row.getProblem();

        row.setStatus(null);
        if (row.isEmpty()) {
            statuses.delete(row);
        } else {
            // Survives only as a star. A statusless problem has nothing to revise.
            row.clearSchedule();
            statuses.save(row);
        }

        applySolveTransition(userId, problem, previous, null, previouslySolvedAt);
    }

    private void applySolveTransition(
            Long userId, Problem problem, ProblemStatus previous, ProblemStatus next, Instant previouslySolvedAt) {

        boolean wasSolved = previous == ProblemStatus.SOLVED;
        boolean isSolved = next == ProblemStatus.SOLVED;
        if (wasSolved == isSolved) {
            return;
        }

        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        int xp = GamificationService.xpFor(problem.getDifficulty());

        if (isSolved) {
            user.addXp(xp);
            user.addSolved(1);
            streaks.recordSolve(user, xp);
            gamification.awardEarnedBadges(user);
        } else {
            user.addXp(-xp);
            user.addSolved(-1);
            LocalDate solvedOn = streaks.dateOf(previouslySolvedAt);
            streaks.recordUnsolve(userId, solvedOn, xp);
        }
        users.save(user);
    }

    @Transactional
    public boolean toggleStar(Long userId, Long problemId) {
        UserProblemStatus row = findOrCreate(userId, problemId);
        row.setStarred(!row.isStarred());

        if (row.isEmpty()) {
            statuses.delete(row);
            return false;
        }
        statuses.save(row);
        return row.isStarred();
    }

    @Transactional(readOnly = true)
    public SheetProgress progress(Long userId) {
        List<ProblemRepository.StepTotal> totals = problems.countPerStep();

        Map<Integer, Long> solvedByStep = new HashMap<>();
        for (var row : statuses.countPerStepByStatus(userId, ProblemStatus.SOLVED)) {
            solvedByStep.put(row.getStepNo(), row.getSolved());
        }

        List<StepProgress> steps = totals.stream()
                .map(t -> new StepProgress(
                        t.getStepNo(),
                        t.getStepTitle(),
                        t.getTotal(),
                        solvedByStep.getOrDefault(t.getStepNo(), 0L)))
                .toList();

        long total = totals.stream().mapToLong(ProblemRepository.StepTotal::getTotal).sum();
        return new SheetProgress(
                total,
                statuses.countByUserIdAndStatus(userId, ProblemStatus.SOLVED),
                statuses.countByUserIdAndStatus(userId, ProblemStatus.ATTEMPTED),
                statuses.countByUserIdAndStatus(userId, ProblemStatus.REVISIT),
                statuses.countByUserIdAndStarredTrue(userId),
                steps);
    }

    private UserProblemStatus findOrCreate(Long userId, Long problemId) {
        return statuses.findByUserIdAndProblemId(userId, problemId).orElseGet(() -> {
            Problem problem = problems.findById(problemId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));
            return new UserProblemStatus(userId, problem);
        });
    }

    public record StepProgress(int stepNo, String stepTitle, long total, long solved) {}

    public record SheetProgress(
            long total, long solved, long attempted, long revisit, long starred, List<StepProgress> steps) {}
}
