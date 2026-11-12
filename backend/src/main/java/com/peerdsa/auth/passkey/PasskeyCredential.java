package com.peerdsa.auth.passkey;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A registered WebAuthn passkey / platform biometric credential bound to a {@code User}.
 *
 * <p>{@link #id} is the unpadded Base64URL credential ID assigned by the authenticator.
 */
@Entity
@Table(name = "passkey_credentials")
public class PasskeyCredential {

    @Id
    @Column(nullable = false)
    private String id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "passkey_user_id", nullable = false)
    private String passkeyUserId;

    @Column(name = "attested_credential_data_b64", nullable = false)
    private String attestedCredentialDataB64;

    @Column(name = "sign_count", nullable = false)
    private long signCount;

    @Column(nullable = false)
    private String aaguid;

    @Column(nullable = false)
    private String name;

    @Column(name = "device_type", nullable = false)
    private String deviceType;

    @Column(name = "backed_up", nullable = false)
    private boolean backedUp;

    @Column(name = "uv_initialized", nullable = false)
    private boolean uvInitialized;

    @Column(nullable = false)
    private String transports = "";

    @Column(name = "rp_id", nullable = false)
    private String rpId;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    protected PasskeyCredential() {}

    public PasskeyCredential(
            String id,
            Long userId,
            String passkeyUserId,
            String attestedCredentialDataB64,
            long signCount,
            String aaguid,
            String name,
            String deviceType,
            boolean backedUp,
            boolean uvInitialized,
            String transports,
            String rpId,
            Instant registeredAt) {
        this.id = id;
        this.userId = userId;
        this.passkeyUserId = passkeyUserId;
        this.attestedCredentialDataB64 = attestedCredentialDataB64;
        this.signCount = signCount;
        this.aaguid = aaguid;
        this.name = name;
        this.deviceType = deviceType;
        this.backedUp = backedUp;
        this.uvInitialized = uvInitialized;
        this.transports = transports == null ? "" : transports;
        this.rpId = rpId;
        this.registeredAt = registeredAt;
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

    public String getAttestedCredentialDataB64() {
        return attestedCredentialDataB64;
    }

    public long getSignCount() {
        return signCount;
    }

    public void setSignCount(long signCount) {
        this.signCount = signCount;
    }

    public String getAaguid() {
        return aaguid;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(String deviceType) {
        this.deviceType = deviceType;
    }

    public boolean isBackedUp() {
        return backedUp;
    }

    public void setBackedUp(boolean backedUp) {
        this.backedUp = backedUp;
    }

    public boolean isUvInitialized() {
        return uvInitialized;
    }

    public void setUvInitialized(boolean uvInitialized) {
        this.uvInitialized = uvInitialized;
    }

    public String getTransports() {
        return transports;
    }

    public String getRpId() {
        return rpId;
    }

    public Instant getRegisteredAt() {
        return registeredAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(Instant lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }
}

