package com.peerdsa.progress;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Access to the {@link UserProblemStatus} rows: point look-ups and batch loads for the sheet, the
 * status/star counters behind the progress summary, and the spaced-repetition queues. Finders that
 * feed a DTO fetch-join the problem's step so the graph is loaded before the session closes.
 */
public interface UserProblemStatusRepository extends JpaRepository<UserProblemStatus, Long> {

    Optional<UserProblemStatus> findByUserIdAndProblemId(Long userId, Long problemId);

    /** Batch-loads the statuses for one page of problems, instead of one query per row. */
    List<UserProblemStatus> findByUserIdAndProblemIdIn(Long userId, Collection<Long> problemIds);

    long countByUserIdAndStatus(Long userId, ProblemStatus status);

    long countByUserIdAndStarredTrue(Long userId);

    /** Projection: solved count for one sheet step. */
    interface StepSolvedCount {
        int getStepNo();

        long getSolved();
    }

    @Query("""
            select s.problem.subStep.step.stepNo as stepNo, count(s) as solved
            from UserProblemStatus s
            where s.userId = :userId and s.status = :status
            group by s.problem.subStep.step.stepNo
            """)
    List<StepSolvedCount> countPerStepByStatus(
            @Param("userId") Long userId, @Param("status") ProblemStatus status);

    /**
     * Reviews that have come due. The fetch joins pull the problem's step in one query,
     * since every row in the queue renders its title and step number. Served by the
     * partial index idx_ups_revision.
     */
    @Query("""
            select s from UserProblemStatus s
            join fetch s.problem p
            join fetch p.subStep ss
            join fetch ss.step
            where s.userId = :userId
              and s.nextReviewAt is not null
              and s.nextReviewAt <= :now
            order by s.nextReviewAt asc
            """)
    List<UserProblemStatus> findDue(@Param("userId") Long userId, @Param("now") Instant now);

    /** Reviews still in the future -- the complement of {@link #findDue}, same fetch joins. */
    @Query("""
            select s from UserProblemStatus s
            join fetch s.problem p
            join fetch p.subStep ss
            join fetch ss.step
            where s.userId = :userId
              and s.nextReviewAt is not null
              and s.nextReviewAt > :now
            order by s.nextReviewAt asc
            """)
    List<UserProblemStatus> findUpcoming(@Param("userId") Long userId, @Param("now") Instant now);

    /** Projection: solved count for one topic, feeding the analytics weakness report. */
    interface TopicSolvedCount {
        String getTopic();

        long getSolved();
    }

    @Query("""
            select t.name as topic, count(s) as solved
            from UserProblemStatus s
            join s.problem p
            join p.topics t
            where s.userId = :userId and s.status = :status
            group by t.name
            """)
    List<TopicSolvedCount> countPerTopicByStatus(
            @Param("userId") Long userId, @Param("status") ProblemStatus status);

    /** Everything with a review scheduled, due or not. Fed to the recommender. */
    @Query("""
            select distinct s from UserProblemStatus s
            join fetch s.problem p
            left join fetch p.topics
            where s.userId = :userId and s.nextReviewAt is not null
            """)
    List<UserProblemStatus> findScheduled(@Param("userId") Long userId);
}
