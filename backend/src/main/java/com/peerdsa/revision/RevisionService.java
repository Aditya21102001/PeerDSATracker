package com.peerdsa.revision;

import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.UserProblemStatus;
import com.peerdsa.progress.UserProblemStatusRepository;
import com.peerdsa.sheet.Difficulty;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RevisionService {

    private final UserProblemStatusRepository statuses;
    private final ProblemRepository problems;

    public RevisionService(UserProblemStatusRepository statuses, ProblemRepository problems) {
        this.statuses = statuses;
        this.problems = problems;
    }

    @Transactional(readOnly = true)
    public List<RevisionItem> due(Long userId) {
        return statuses.findDue(userId, Instant.now()).stream().map(RevisionService::toItem).toList();
    }

    @Transactional(readOnly = true)
    public List<RevisionItem> upcoming(Long userId) {
        return statuses.findUpcoming(userId, Instant.now()).stream().map(RevisionService::toItem).toList();
    }

    /**
     * A review schedule is orthogonal to status: scheduling a SOLVED problem must leave it
     * SOLVED. Forcing REVISIT here would look like an un-solve to
     * {@code ProgressService.applySolveTransition} and silently refund the problem's XP.
     *
     * <p>An untouched problem has no row at all, and a row must carry a status or a star
     * (chk_ups_not_empty), so that one case gets REVISIT.
     */
    @Transactional
    public RevisionItem schedule(Long userId, Long problemId, Integer intervalDays) {
        UserProblemStatus row = findOrCreate(userId, problemId);
        int interval = intervalDays == null || intervalDays < 1 ? RevisionSchedule.firstInterval() : intervalDays;

        if (row.getStatus() == null) {
            row.setStatus(ProblemStatus.REVISIT);
        }
        row.scheduleReview(Instant.now().plus(Duration.ofDays(interval)), interval);
        return toItem(statuses.save(row));
    }

    /** Recalled it: move one rung up the ladder. */
    @Transactional
    public RevisionItem markReviewed(Long userId, Long problemId) {
        UserProblemStatus row = require(userId, problemId);
        Instant now = Instant.now();
        int next = RevisionSchedule.nextInterval(row.getReviewIntervalDays());

        row.markReviewed(now);
        row.scheduleReview(now.plus(Duration.ofDays(next)), next);
        return toItem(statuses.save(row));
    }

    /** Forgot it: back to the bottom of the ladder. */
    @Transactional
    public RevisionItem reset(Long userId, Long problemId) {
        UserProblemStatus row = require(userId, problemId);
        Instant now = Instant.now();
        int first = RevisionSchedule.firstInterval();

        row.markReviewed(now);
        row.scheduleReview(now.plus(Duration.ofDays(first)), first);
        return toItem(statuses.save(row));
    }

    /**
     * Stop revising. Only the schedule is dropped; the status is left exactly as it was,
     * so this can never move XP either.
     */
    @Transactional
    public void retire(Long userId, Long problemId) {
        UserProblemStatus row = require(userId, problemId);
        row.clearSchedule();
        statuses.save(row);
    }

    private UserProblemStatus require(Long userId, Long problemId) {
        return statuses.findByUserIdAndProblemId(userId, problemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Problem is not scheduled"));
    }

    private UserProblemStatus findOrCreate(Long userId, Long problemId) {
        return statuses.findByUserIdAndProblemId(userId, problemId).orElseGet(() -> {
            Problem problem = problems.findById(problemId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));
            return new UserProblemStatus(userId, problem);
        });
    }

    private static RevisionItem toItem(UserProblemStatus row) {
        Problem p = row.getProblem();
        Instant next = row.getNextReviewAt();
        long overdue = next == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(next, Instant.now()));

        return new RevisionItem(
                p.getId(),
                p.getTitle(),
                p.getDifficulty(),
                p.getSubStep().getStep().getStepNo(),
                p.getLeetcodeUrl(),
                next,
                row.getReviewIntervalDays(),
                row.getLastReviewedAt(),
                overdue);
    }

    public record RevisionItem(
            Long problemId,
            String title,
            Difficulty difficulty,
            int stepNo,
            String leetcodeUrl,
            Instant nextReviewAt,
            Integer intervalDays,
            Instant lastReviewedAt,
            long overdueDays) {}
}
