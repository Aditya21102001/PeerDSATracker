package com.peerdsa.security;

import com.peerdsa.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * Mints and verifies the short-lived access-token JWTs, signed with HS256. The signing secret must
 * be at least 32 bytes (256 bits), enforced at construction so a too-weak key fails fast.
 *
 * <p>Three claims beyond the subject, each load-bearing:
 *
 * <ul>
 *   <li>{@code typ} -- what the token is for. Only {@code access} authenticates a request. Every
 *       token this service mints carries it and {@link #extractUserId} rejects anything else, so a
 *       scoped or challenge token added later cannot quietly become a session by virtue of being a
 *       valid signature over a subject.
 *   <li>{@code sst} -- when the session began, set once and copied onto every rotation. Refresh
 *       expiry slides, so without an anchor a session renews itself forever.
 *   <li>{@code vbc} -- "this session began by proving control of the registered address". It
 *       exists so a user who has forgotten their password can set a new one without producing the
 *       old one, and it grants nothing else, ever. It is honoured only inside
 *       {@code app.jwt.verified-window} of issue, and is never carried across a refresh.
 * </ul>
 */
@Service
public class JwtService {

    /** The only token type that authenticates a request. */
    public static final String TYPE_ACCESS = "access";

    static final String CLAIM_TYPE = "typ";
    static final String CLAIM_SESSION_START = "sst";
    static final String CLAIM_VERIFIED_BY_CODE = "vbc";

    private final SecretKey key;
    private final JwtProperties properties;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        byte[] secret = properties.secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException(
                    "app.jwt.secret must be at least 32 bytes for HS256; got " + secret.length);
        }
        this.key = Keys.hmacShaKeyFor(secret);
    }

    /** An ordinary session token. Nothing but the user id is ever trusted from the client. */
    public String generateAccessToken(Long userId, String email, Instant sessionStartedAt) {
        return build(userId, email, sessionStartedAt, false);
    }

    /**
     * A session token that also records that this session began with a one-time code sent to the
     * account's registered address. Issued by {@code /api/auth/otp/verify} and nowhere else --
     * refresh deliberately mints the ordinary kind, because a renewed session is no longer "just
     * verified".
     */
    public String generateCodeVerifiedAccessToken(Long userId, String email, Instant sessionStartedAt) {
        return build(userId, email, sessionStartedAt, true);
    }

    private String build(Long userId, String email, Instant sessionStartedAt, boolean verifiedByCode) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("email", email)
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_SESSION_START, sessionStartedAt.getEpochSecond())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.accessTtl())));

        if (verifiedByCode) {
            builder.claim(CLAIM_VERIFIED_BY_CODE, true);
        }
        return builder.signWith(key).compact();
    }

    /**
     * @return the user id, or null when the token is missing, malformed, expired, forged, of the
     *     wrong type, or belongs to a session that has outlived the absolute cap.
     */
    public Long extractUserId(String token) {
        Claims claims = claims(token);
        if (claims == null) {
            return null;
        }
        try {
            return Long.valueOf(claims.getSubject());
        } catch (NumberFormatException | NullPointerException e) {
            return null;
        }
    }

    /**
     * True when this token was issued by code verification <em>and</em> is still inside the window
     * that makes that meaningful.
     *
     * <p>The window runs from {@code iat}, and is configured separately from the access-token TTL:
     * lengthening how long a session lasts must not lengthen how long a password can be rewritten
     * without the old one. A tab left open on a shared machine is exactly the case this closes.
     */
    public boolean isVerifiedByCode(String token) {
        Claims claims = claims(token);
        if (claims == null || !Boolean.TRUE.equals(claims.get(CLAIM_VERIFIED_BY_CODE, Boolean.class))) {
            return false;
        }
        Date issuedAt = claims.getIssuedAt();
        return issuedAt != null
                && Instant.now().isBefore(issuedAt.toInstant().plus(properties.verifiedWindow()));
    }

    /** When the session behind this token began, or null if the token is not usable. */
    public Instant sessionStart(String token) {
        Claims claims = claims(token);
        if (claims == null) {
            return null;
        }
        Long epochSeconds = claims.get(CLAIM_SESSION_START, Long.class);
        return epochSeconds == null ? null : Instant.ofEpochSecond(epochSeconds);
    }

    /**
     * Verified claims, or null. Every check that must hold before a token may act as a session
     * lives here, so no caller can accidentally skip one.
     */
    private Claims claims(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            // A valid signature only proves we minted the token, not that we minted it for this.
            // An absent typ is rejected too: it can only be a token from before this rule existed,
            // and those are at most one access-TTL old -- the client just refreshes.
            if (!TYPE_ACCESS.equals(claims.get(CLAIM_TYPE, String.class))) {
                return null;
            }

            Long sessionStart = claims.get(CLAIM_SESSION_START, Long.class);
            if (sessionStart == null) {
                return null;
            }
            Instant cap = Instant.ofEpochSecond(sessionStart).plus(properties.sessionMax());
            return Instant.now().isBefore(cap) ? claims : null;

        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
