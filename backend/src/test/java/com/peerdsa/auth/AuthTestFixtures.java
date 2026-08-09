package com.peerdsa.auth;

import com.peerdsa.config.JwtProperties;
import com.peerdsa.user.User;
import java.time.Duration;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Shared construction helpers for the auth tests.
 *
 * <p>{@link JwtProperties} and {@link User} both grew fields that no test cares about individually
 * (the absolute session cap, the vbc window, generated ids), and repeating those in every test
 * buries the one line that is actually under test. Everything here is a plain default; a test that
 * cares about a value sets it explicitly rather than relying on these.
 */
final class AuthTestFixtures {

    static final Duration GRACE = Duration.ofSeconds(30);
    static final Duration ACCESS_TTL = Duration.ofMinutes(15);
    static final Duration REFRESH_TTL = Duration.ofDays(30);
    static final Duration SESSION_MAX = Duration.ofDays(90);
    static final Duration VERIFIED_WINDOW = Duration.ofMinutes(15);

    static final String SECRET = "test-secret-that-is-definitely-long-enough-for-hs256";

    private AuthTestFixtures() {}

    static JwtProperties jwtProperties() {
        return jwtProperties(SECRET);
    }

    static JwtProperties jwtProperties(String secret) {
        return new JwtProperties(secret, ACCESS_TTL, REFRESH_TTL, GRACE, SESSION_MAX, VERIFIED_WINDOW);
    }

    /** A saved user. The id is reflected in because it is database-generated in production. */
    static User user(long id, String email, String username, String passwordHash) {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", id);
        user.setEmail(email);
        user.setUsername(username);
        user.setPasswordHash(passwordHash);
        user.setDisplayName(username);
        return user;
    }
}
