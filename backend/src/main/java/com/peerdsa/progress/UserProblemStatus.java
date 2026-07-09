package com.peerdsa.progress;

import com.peerdsa.sheet.Problem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * One row per (user, problem) the user has touched -- via a status, a star or a scheduled review.
 * {@code status} is nullable so a problem can be starred without being marked; the row is deleted
 * once it carries neither (see {@link #isEmpty()}). Also holds the spaced-repetition schedule.
 */
@Entity
@Table(
        name = "user_problem_status",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "problem_id"}))
public class UserProblemStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "problem_id", nullable = false)
    private Problem problem;

    /** Null means the row exists only because the problem is starred. */
    @Enumerated(EnumType.STRING)
    @Column
    private ProblemStatus status;

    @Column(name = "is_starred", nullable = false)
    private boolean starred = false;

    @Column(name = "solved_at")
    private Instant solvedAt;

    @Column(name = "next_review_at")
    private Instant nextReviewAt;

    @Column(name = "review_interval_days")
    private Integer reviewIntervalDays;

    @Column(name = "last_reviewed_at")
    private Instant lastReviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserProblemStatus() {}

    public UserProblemStatus(Long userId, Problem problem) {
        this.userId = userId;
        this.problem = problem;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Problem getProblem() {
        return problem;
    }

    public ProblemStatus getStatus() {
        return status;
    }

    public boolean isStarred() {
        return starred;
    }

    public Instant getSolvedAt() {
        return solvedAt;
    }

    /** solvedAt tracks the first time the problem reached SOLVED, and clears when it leaves. */
    public void setStatus(ProblemStatus status) {
        if (status == ProblemStatus.SOLVED) {
            if (this.solvedAt == null) {
                this.solvedAt = Instant.now();
            }
        } else {
            this.solvedAt = null;
        }
        this.status = status;
    }

    public void setStarred(boolean starred) {
        this.starred = starred;
    }

    public Instant getNextReviewAt() {
        return nextReviewAt;
    }

    public Integer getReviewIntervalDays() {
        return reviewIntervalDays;
    }

    public Instant getLastReviewedAt() {
        return lastReviewedAt;
    }

    public void scheduleReview(Instant nextReviewAt, int intervalDays) {
        this.nextReviewAt = nextReviewAt;
        this.reviewIntervalDays = intervalDays;
    }

    public void markReviewed(Instant reviewedAt) {
        this.lastReviewedAt = reviewedAt;
    }

    /** Drops the schedule but keeps lastReviewedAt as history. */
    public void clearSchedule() {
        this.nextReviewAt = null;
        this.reviewIntervalDays = null;
    }

    /** True once the row carries no information worth keeping. */
    public boolean isEmpty() {
        return status == null && !starred;
    }
}
