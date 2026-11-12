package com.peerdsa.auth.passkey;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Single-use, short-lived server challenge for a WebAuthn registration or authentication ceremony.
 */
@Entity
@Table(name = "passkey_challenges")
public class PasskeyChallenge {

    public static final String CEREMONY_REGISTRATION = "REGISTRATION";
    public static final String CEREMONY_AUTHENTICATION = "AUTHENTICATION";

    @Id
    @Column(nullable = false)
    private String id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "passkey_user_id")
    private String passkeyUserId;

    @Column(name = "challenge_b64", nullable = false)
    private String challengeB64;

    @Column(nullable = false)
    private String ceremony;

    @Column(name = "expected_user_verification", nullable = false)
    private String expectedUserVerification;

    @Column(name = "rp_id", nullable = false)
    private String rpId;

    @Column(nullable = false)
    private String origin;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean consumed = false;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    protected PasskeyChallenge() {}

    public PasskeyChallenge(
            String id,
            Long userId,
            String passkeyUserId,
            String challengeB64,
            String ceremony,
            String expectedUserVerification,
            String rpId,
            String origin,
            Instant expiresAt) {
        this.id = id;
        this.userId = userId;
        this.passkeyUserId = passkeyUserId;
        this.challengeB64 = challengeB64;
        this.ceremony = ceremony;
        this.expectedUserVerification = expectedUserVerification;
        this.rpId = rpId;
        this.origin = origin;
        this.expiresAt = expiresAt;
    }

    public String getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getPasskeyUserId() {
        return passkeyUserId;
    }

    public String getChallengeB64() {
        return challengeB64;
    }

    public String getCeremony() {
        return ceremony;
    }

    public String getExpectedUserVerification() {
        return expectedUserVerification;
    }

    public String getRpId() {
        return rpId;
    }

    public String getOrigin() {
        return origin;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isConsumed() {
        return consumed;
    }

    public void setConsumed(boolean consumed) {
        this.consumed = consumed;
    }
}
