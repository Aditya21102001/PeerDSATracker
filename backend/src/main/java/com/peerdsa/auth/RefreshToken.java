package com.peerdsa.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A persisted refresh-token session. Stored only as a SHA-256 hash and rotated on every use, with
 * {@code replacedBy} linking a token to its successor so that reuse of an already-rotated token can
 * be recognised as theft.
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** SHA-256 of the raw token. The raw value never reaches the database. */
    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /**
     * When the user actually authenticated, set once and copied unchanged onto every successor.
     * Distinct from {@link #createdAt}, which restarts at each rotation: this is the anchor the
     * absolute session cap is measured from, and without it a token that is merely refreshed often
     * enough never expires.
     */
    @Column(name = "session_started_at", nullable = false)
    private Instant sessionStartedAt;

    @Column(nullable = false)
    private boolean revoked = false;

    /** Set when this token is rotated, pointing at its successor. */
    @Column(name = "replaced_by")
    private Long replacedBy;

    @Column(name = "user_agent")
    private String userAgent;

    @Column
    private String ip;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected RefreshToken() {}

    public RefreshToken(
            Long userId,
            String tokenHash,
            Instant expiresAt,
            Instant sessionStartedAt,
            String userAgent,
            String ip) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.sessionStartedAt = sessionStartedAt;
        this.userAgent = userAgent;
        this.ip = ip;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getSessionStartedAt() {
        return sessionStartedAt;
    }

    public boolean isRevoked() {
        return revoked;
    }

    public void revoke() {
        this.revoked = true;
    }

    public void setReplacedBy(Long replacedBy) {
        this.replacedBy = replacedBy;
    }

    /** The token that superseded this one, or null if it was revoked without rotation (logout). */
    public Long getReplacedBy() {
        return replacedBy;
    }

    /**
     * Written by the database default, so a successor's {@code createdAt} is the exact instant
     * its predecessor was rotated. Null until the row has been read back from the database.
     */
    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isUsable() {
        return !revoked && expiresAt.isAfter(Instant.now());
    }
}
