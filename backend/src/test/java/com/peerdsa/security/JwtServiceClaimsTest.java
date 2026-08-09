package com.peerdsa.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.peerdsa.config.JwtProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;

/**
 * The three claims that carry security meaning: {@code typ}, {@code sst} and {@code vbc}.
 *
 * <p>Every token minted here is minted by {@link JwtService} itself, except where a test needs to
 * forge one that the service would never produce -- an expired {@code vbc}, or a scoped token of
 * some other type. Those are signed with the same key on purpose: the point is that a <em>valid
 * signature is not enough</em>, and a test that used a bad signature would prove nothing.
 */
class JwtServiceClaimsTest {

    private static final String SECRET = "test-secret-that-is-definitely-long-enough-for-hs256";
    private static final Duration VERIFIED_WINDOW = Duration.ofMinutes(15);
    private static final Duration SESSION_MAX = Duration.ofDays(90);

    private final JwtProperties properties = new JwtProperties(
            SECRET,
            Duration.ofMinutes(15),
            Duration.ofDays(30),
            Duration.ofSeconds(30),
            SESSION_MAX,
            VERIFIED_WINDOW);
    private final JwtService jwtService = new JwtService(properties);
    private final SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

    // ------------------------------------------------------------------------ 5. the vbc claim

    @Test
    void aTokenFromCodeVerificationIsMarkedVerifiedByCode() {
        String token = jwtService.generateCodeVerifiedAccessToken(1L, "a@b.com", Instant.now());

        assertThat(jwtService.isVerifiedByCode(token)).isTrue();
    }

    @Test
    void anOrdinaryTokenIsNotVerifiedByCode() {
        String token = jwtService.generateAccessToken(1L, "a@b.com", Instant.now());

        assertThat(jwtService.isVerifiedByCode(token)).isFalse();
    }

    /**
     * The claim expires on its own schedule, measured from {@code iat}. A session left open on a
     * shared machine must not still be able to rewrite the password hours later, which is why this
     * window is configured separately from the access-token TTL.
     */
    @Test
    void theVbcClaimIsIgnoredOutsideItsWindow() {
        Instant issuedTooLongAgo = Instant.now().minus(VERIFIED_WINDOW).minusSeconds(60);
        String stale = forge(claims -> claims
                .subject("1")
                .claim("typ", JwtService.TYPE_ACCESS)
                .claim("sst", Instant.now().getEpochSecond())
                .claim("vbc", true)
                .issuedAt(Date.from(issuedTooLongAgo))
                // Deliberately still unexpired as a session: only the vbc window has passed.
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.extractUserId(stale)).isEqualTo(1L);
        assertThat(jwtService.isVerifiedByCode(stale)).isFalse();
    }

    @Test
    void aTokenStillInsideItsWindowIsHonoured() {
        Instant issuedRecently = Instant.now().minus(VERIFIED_WINDOW).plusSeconds(60);
        String fresh = forge(claims -> claims
                .subject("1")
                .claim("typ", JwtService.TYPE_ACCESS)
                .claim("sst", Instant.now().getEpochSecond())
                .claim("vbc", true)
                .issuedAt(Date.from(issuedRecently))
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.isVerifiedByCode(fresh)).isTrue();
    }

    // ---------------------------------------------------------- 6 (audit). the typ claim gate

    /**
     * A scoped or challenge token must never authenticate a session. It is signed by us and names a
     * real subject, so nothing but the type claim distinguishes it -- and if that check is skipped,
     * "has a valid signature" silently becomes "is signed in".
     */
    @Test
    void aTokenOfAnyOtherTypeDoesNotAuthenticate() {
        String mfaChallenge = forge(claims -> claims
                .subject("1")
                .claim("typ", "mfa-challenge")
                .claim("sst", Instant.now().getEpochSecond())
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.extractUserId(mfaChallenge)).isNull();
        assertThat(jwtService.isVerifiedByCode(mfaChallenge)).isFalse();
    }

    @Test
    void aTokenWithNoTypeClaimAtAllDoesNotAuthenticate() {
        String untyped = forge(claims -> claims
                .subject("1")
                .claim("sst", Instant.now().getEpochSecond())
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.extractUserId(untyped)).isNull();
    }

    /** A vbc claim smuggled onto a non-access token grants nothing either. */
    @Test
    void aScopedTokenCannotBorrowTheVbcClaim() {
        String scoped = forge(claims -> claims
                .subject("1")
                .claim("typ", "password-reset")
                .claim("sst", Instant.now().getEpochSecond())
                .claim("vbc", true)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.isVerifiedByCode(scoped)).isFalse();
    }

    // -------------------------------------------------------------- the absolute session cap

    @Test
    void aTokenCarriesTheSessionStartItWasIssuedWith() {
        Instant startedAt = Instant.now().minus(Duration.ofDays(3));
        String token = jwtService.generateAccessToken(1L, "a@b.com", startedAt);

        // Second precision: the claim is epoch seconds.
        assertThat(jwtService.sessionStart(token)).isEqualTo(startedAt.truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
    }

    /**
     * A token can be minutes old and still belong to a session that began beyond the cap, because
     * refresh mints a brand-new token while carrying the original start forward.
     */
    @Test
    void aFreshTokenFromASessionPastTheCapDoesNotAuthenticate() {
        Instant startedBeyondTheCap = Instant.now().minus(SESSION_MAX).minusSeconds(60);
        String token = jwtService.generateAccessToken(1L, "a@b.com", startedBeyondTheCap);

        assertThat(jwtService.extractUserId(token)).isNull();
    }

    @Test
    void aTokenWithNoSessionStartDoesNotAuthenticate() {
        String anchorless = forge(claims -> claims
                .subject("1")
                .claim("typ", JwtService.TYPE_ACCESS)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(600))));

        assertThat(jwtService.extractUserId(anchorless)).isNull();
    }

    // ---------------------------------------------------------------------------- helpers

    /** Signs arbitrary claims with the real key, to prove a valid signature is not sufficient. */
    private String forge(java.util.function.Consumer<io.jsonwebtoken.JwtBuilder> claims) {
        io.jsonwebtoken.JwtBuilder builder = Jwts.builder();
        claims.accept(builder);
        return builder.signWith(key).compact();
    }
}
