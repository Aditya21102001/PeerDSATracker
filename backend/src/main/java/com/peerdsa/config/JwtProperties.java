package com.peerdsa.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.jwt.*}: the HS256 signing secret (min 32 bytes, checked in
 * {@link com.peerdsa.security.JwtService}) and the access/refresh token lifetimes.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration accessTtl, Duration refreshTtl) {}
