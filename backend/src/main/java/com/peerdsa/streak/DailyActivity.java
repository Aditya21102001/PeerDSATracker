package com.peerdsa.streak;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;

/** One row per user per calendar day. Written when a problem is solved. */
@Entity
@Table(
        name = "daily_activity",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "activity_date"}))
public class DailyActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "activity_date", nullable = false)
    private LocalDate activityDate;

    @Column(name = "problems_solved", nullable = false)
    private int problemsSolved = 0;

    @Column(name = "xp_earned", nullable = false)
    private int xpEarned = 0;

    @Column(nullable = false)
    private String source = "APP";

    protected DailyActivity() {}

    public DailyActivity(Long userId, LocalDate activityDate) {
        this.userId = userId;
        this.activityDate = activityDate;
    }

    public LocalDate getActivityDate() {
        return activityDate;
    }

    public int getProblemsSolved() {
        return problemsSolved;
    }

    public int getXpEarned() {
        return xpEarned;
    }

    /** Counters never go below zero, so an un-solve can't corrupt the heatmap. */
    public void add(int problems, int xp) {
        this.problemsSolved = Math.max(0, this.problemsSolved + problems);
        this.xpEarned = Math.max(0, this.xpEarned + xp);
    }

    public boolean isEmpty() {
        return problemsSolved == 0 && xpEarned == 0;
    }
}
