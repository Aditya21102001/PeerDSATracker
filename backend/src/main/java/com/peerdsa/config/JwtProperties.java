package com.peerdsa.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.jwt.*}: the HS256 signing secret (min 32 bytes, checked in
 * {@link com.peerdsa.security.JwtService}) and the token lifetimes.
 *
 * @param refreshGrace how long after a rotation the superseded token may be replayed without being
 *     treated as theft. See {@link com.peerdsa.auth.AuthService#refresh}.
 * @param sessionMax the absolute ceiling on one session, measured from the moment the user
 *     actually authenticated and carried unchanged across every rotation. Refresh expiry slides
 *     forward on each use, so without this a session that is merely <em>used</em> often enough
 *     never ends -- a stolen refresh token would be good indefinitely.
 * @param verifiedWindow how long after issue a {@code vbc} token may be used to set a password
 *     without the old one. Separate from {@link #accessTtl()} on purpose: lengthening how long a
 *     session lasts must not lengthen how long a password can be rewritten.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        String secret,
        Duration accessTtl,
        Duration refreshTtl,
        Duration refreshGrace,
        Duration sessionMax,
        Duration verifiedWindow) {}
