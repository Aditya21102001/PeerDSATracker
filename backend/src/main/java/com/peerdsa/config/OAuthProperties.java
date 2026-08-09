package com.peerdsa.config;

import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.oauth.*}: whether an identity provider may create accounts, and what such an
 * account is allowed to be.
 *
 * @param autoProvision may an identity the provider vouches for, but which has no account here,
 *     create one. Off by default. On the find-or-create shortcut, anyone who can reach the sign-in
 *     page becomes a user of someone else's system by clicking one button.
 * @param defaultRole what an auto-provisioned account gets. Validated at startup against
 *     {@link #PRIVILEGED_ROLES} so a value that was convenient in development cannot ship: the
 *     failure mode is silent and total, since the account looks ordinary until it does something
 *     only an admin should.
 */
@ConfigurationProperties(prefix = "app.oauth")
public record OAuthProperties(boolean autoProvision, String defaultRole, Google google) {

    /** Roles an auto-provisioned account may never be given. */
    public static final Set<String> PRIVILEGED_ROLES = Set.of("ADMIN");

    /** Roles the {@code users.role} CHECK constraint accepts at all. */
    private static final Set<String> KNOWN_ROLES = Set.of("USER", "ADMIN");

    public OAuthProperties {
        defaultRole = defaultRole == null || defaultRole.isBlank()
                ? "USER"
                : defaultRole.trim().toUpperCase(Locale.ROOT);

        if (!KNOWN_ROLES.contains(defaultRole)) {
            throw new IllegalStateException(
                    "app.oauth.default-role must be one of " + KNOWN_ROLES + "; got '" + defaultRole + "'");
        }
        // Fail to start rather than provision one privileged account and find out later.
        if (PRIVILEGED_ROLES.contains(defaultRole)) {
            throw new IllegalStateException(
                    "app.oauth.default-role must not be privileged; '" + defaultRole
                            + "' would make every Google sign-in an admin");
        }
        google = google == null ? new Google(null, null) : google;
    }

    /** Google client credentials. Absent means the feature is simply not wired up. */
    public record Google(String clientId, String clientSecret) {

        public boolean configured() {
            return notBlank(clientId) && notBlank(clientSecret);
        }

        private static boolean notBlank(String value) {
            return value != null && !value.isBlank();
        }
    }
}
