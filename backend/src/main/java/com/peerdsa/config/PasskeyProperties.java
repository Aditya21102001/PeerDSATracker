package com.peerdsa.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.webauthn.*} for WebAuthn / Passkey ceremonies.
 *
 * @param rpName human-readable Relying Party display name shown by platform authenticators.
 * @param rpId optional explicit Relying Party ID (domain); when blank, derived from the verified
 *     request origin so localhost dev and deployed hosts share one configuration.
 * @param allowedOrigins optional extra allowed WebAuthn origins in addition to {@code
 *     app.cors.allowed-origins}.
 * @param challengeTtl how long a registration or authentication challenge remains valid.
 */
@ConfigurationProperties(prefix = "app.webauthn")
public record PasskeyProperties(
        String rpName,
        String rpId,
        List<String> allowedOrigins,
        Duration challengeTtl) {

    public PasskeyProperties {
        if (rpName == null || rpName.isBlank()) {
            rpName = "PeerDSATracker";
        }
        allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
        if (challengeTtl == null) {
            challengeTtl = Duration.ofMinutes(5);
        }
    }
}

