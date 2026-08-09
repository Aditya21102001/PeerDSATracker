package com.peerdsa.auth.otp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A one-time code issued to an email address. Only the SHA-256 of the code is stored, and
 * {@link #consume()} destroys even that -- so a code is single-use, and a database leak cannot be
 * replayed against {@code /api/auth/otp/verify}.
 *
 * <p>The row deliberately survives its secret. Requests are rate limited per destination by
 * counting rows, and that count has to include codes that were already spent, superseded, or
 * issued for an address with no account at all: if only live codes counted, an attacker could
 * clear their budget at will, and only registered addresses could ever be throttled -- which
 * turns the rate limit itself into an account-enumeration oracle.
 */
@Entity
@Table(name = "otp_codes")
public class OtpCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Always stored lowercase and trimmed; {@link OtpService} normalises before writing. */
    @Column(nullable = false)
    private String email;

    /** SHA-256 of the code, or null once the code has been consumed or superseded. */
    @Column(name = "code_hash")
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected OtpCode() {}

    private OtpCode(String email, String codeHash, Instant expiresAt) {
        this.email = email;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
    }

    /** A live code for {@code email}, valid until {@code expiresAt}. */
    static OtpCode issued(String email, String codeHash, Instant expiresAt) {
        return new OtpCode(email, codeHash, expiresAt);
    }

    /**
     * A request that produced no code -- the address has no account, or delivery is off. It holds
     * no secret and can never verify, but it still counts towards the rate limit, which is the
     * whole point: an unregistered address must be throttled exactly like a registered one.
     */
    static OtpCode unissued(String email, Instant expiresAt) {
        return new OtpCode(email, null, expiresAt);
    }

    public Long getId() {
        return id;
    }

    /** The address the code was issued to. Account lookup resolves from this, never from input. */
    public String getEmail() {
        return email;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isUsable(Instant now) {
        return codeHash != null && expiresAt.isAfter(now);
    }

    /** Single use: destroys the hash so the same code can never verify twice. */
    public void consume() {
        this.codeHash = null;
    }
}
