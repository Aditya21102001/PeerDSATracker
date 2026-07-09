package com.peerdsa.sync;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * A user's link to one external judge, unique per (user, platform). Holds the handle and
 * the last stats fetched from that platform; the cached {@code external_stats} are shown
 * alongside sheet progress on /profile and deliberately never merged into
 * {@code daily_activity}.
 */
@Entity
@Table(
        name = "platform_accounts",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "platform"}))
public class PlatformAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Platform platform;

    @Column(nullable = false)
    private String handle;

    @Column(nullable = false)
    private boolean verified = false;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    /**
     * Whatever the platform last returned, cached verbatim. Lets the UI keep showing
     * numbers when LeetCode's unofficial endpoint is unreachable.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "external_stats", columnDefinition = "jsonb")
    private Map<String, Object> externalStats;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected PlatformAccount() {}

    public PlatformAccount(Long userId, Platform platform, String handle) {
        this.userId = userId;
        this.platform = platform;
        this.handle = handle;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Platform getPlatform() {
        return platform;
    }

    public String getHandle() {
        return handle;
    }

    public void setHandle(String handle) {
        this.handle = handle;
    }

    public boolean isVerified() {
        return verified;
    }

    public Instant getLastSyncedAt() {
        return lastSyncedAt;
    }

    public Map<String, Object> getExternalStats() {
        return externalStats;
    }

    public void recordSync(Map<String, Object> stats, Instant at) {
        this.externalStats = stats;
        this.lastSyncedAt = at;
    }
}
