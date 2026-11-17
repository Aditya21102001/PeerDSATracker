package com.peerdsa.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds app.webauthn.* for WebAuthn / Passkey ceremonies.
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
