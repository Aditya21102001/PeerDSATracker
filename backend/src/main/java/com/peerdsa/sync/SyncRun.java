package com.peerdsa.sync;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Audit record of one platform sync attempt. Written even when a handle cannot be resolved:
 * that outcome is a {@link Status#FAILED} run, not an exception, and the previously cached
 * stats on the account are left untouched.
 */
@Entity
@Table(name = "sync_runs")
public class SyncRun {

    /** Run lifecycle; {@code SUCCESS} and {@code FAILED} are the terminal states. */
    public enum Status {
        PENDING,
        RUNNING,
        SUCCESS,
        FAILED
    }

    /**
     * What kicked off the run. On Render's free tier the backend sleeps, so {@code SCHEDULED}
     * runs rarely fire and {@code MANUAL} (the /profile button) is the norm.
     */
    public enum TriggerSource {
        SCHEDULED,
        MANUAL
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Platform platform;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_source", nullable = false)
    private TriggerSource triggerSource;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt = Instant.now();

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "items_processed", nullable = false)
    private int itemsProcessed = 0;

    @Column(name = "error_message")
    private String errorMessage;

    protected SyncRun() {}

    public SyncRun(Long userId, Platform platform, TriggerSource triggerSource) {
        this.userId = userId;
        this.platform = platform;
        this.triggerSource = triggerSource;
        this.status = Status.RUNNING;
    }

    public void succeed(int itemsProcessed) {
        this.status = Status.SUCCESS;
        this.itemsProcessed = itemsProcessed;
        this.finishedAt = Instant.now();
    }

    public void fail(String message) {
        this.status = Status.FAILED;
        // The column is plain text; a stack trace would not fit anything useful.
        this.errorMessage = message == null ? "unknown error" : message.substring(0, Math.min(500, message.length()));
        this.finishedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Platform getPlatform() {
        return platform;
    }

    public Status getStatus() {
        return status;
    }

    public TriggerSource getTriggerSource() {
        return triggerSource;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public int getItemsProcessed() {
        return itemsProcessed;
    }

    public String getErrorMessage() {
        return errorMessage;
    }
}
