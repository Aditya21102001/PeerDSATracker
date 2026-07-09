package com.peerdsa.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * Refresh-token rotation. Reuse of an already-rotated token means the token leaked, and
 * the whole chain must die. The revocation is committed in a REQUIRES_NEW transaction
 * (RefreshTokenRevoker) precisely because the 401 that reports the theft would otherwise
 * roll it back -- these tests pin that the revoker is actually invoked.
 */
class AuthServiceTest {

    private static final Duration GRACE = Duration.ofSeconds(30);

    private UserRepository users;
    private RefreshTokenRepository refreshTokens;
    private RefreshTokenRevoker revoker;
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        revoker = mock(RefreshTokenRevoker.class);

        PasswordEncoder encoder = new BCryptPasswordEncoder();
        JwtProperties properties = new JwtProperties(
                "test-secret-that-is-definitely-long-enough-for-hs256",
                Duration.ofMinutes(15),
                Duration.ofDays(30),
                GRACE);
        jwtService = new JwtService(properties);

        authService = new AuthService(users, refreshTokens, revoker, encoder, jwtService, properties);

        // save() returns its argument, as Spring Data does. findByTokenHash is stubbed
        // per test, since each one cares about a specific token state.
        when(refreshTokens.save(any())).thenAnswer((Answer<RefreshToken>) i -> i.getArgument(0));
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.empty());

        User user = new User();
        user.setEmail("a@b.com");
        user.setPasswordHash(encoder.encode("Passw0rd!"));
        when(users.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(user));
        when(users.findById(any())).thenReturn(Optional.of(user));
    }

    @Test
    void loginIssuesBothTokensWithTheConfiguredAccessTtl() {
        var tokens = authService.login(new LoginRequest("a@b.com", "Passw0rd!"), "junit", "127.0.0.1");

        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(tokens.expiresInSeconds()).isEqualTo(900);
    }

    @Test
    void anAccessTokenRoundTripsToTheUserIdItWasIssuedFor() {
        String token = jwtService.generateAccessToken(1234L, "a@b.com");

        assertThat(jwtService.extractUserId(token)).isEqualTo(1234L);
    }

    @Test
    void aTamperedOrForgedAccessTokenYieldsNoUserId() {
        String token = jwtService.generateAccessToken(1234L, "a@b.com");
        String[] parts = token.split("\\.");

        // Re-sign the same claims with a different secret.
        JwtProperties otherSecret = new JwtProperties(
                "a-completely-different-secret-of-sufficient-length!!",
                Duration.ofMinutes(15),
                Duration.ofDays(30),
                GRACE);
        String forged = new JwtService(otherSecret).generateAccessToken(1234L, "a@b.com");

        // Swap the payload for one claiming a different subject.
        String tamperedPayload = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString("{\"sub\":\"9999\"}".getBytes(StandardCharsets.UTF_8));

        assertThat(jwtService.extractUserId(forged)).isNull();
        assertThat(jwtService.extractUserId(parts[0] + "." + tamperedPayload + "." + parts[2])).isNull();
        assertThat(jwtService.extractUserId(flipLastChar(token))).isNull();
        assertThat(jwtService.extractUserId(parts[0] + "." + parts[1] + ".")).isNull();
        assertThat(jwtService.extractUserId("not.a.jwt")).isNull();
        assertThat(jwtService.extractUserId("")).isNull();
    }

    /**
     * A single extra base64url character on the signature is NOT rejected: those 6 bits
     * do not complete a byte, so the decoder drops them and recovers the same signature.
     * That is decoder laxness, not a forgery vector -- the assertions above cover the
     * cases that actually matter. Two extra characters do change the byte length:
     */
    @Test
    void aSignatureOfTheWrongLengthIsRejected() {
        String token = jwtService.generateAccessToken(1234L, "a@b.com");

        assertThat(jwtService.extractUserId(token + "xy")).isNull();
    }

    private static String flipLastChar(String token) {
        char last = token.charAt(token.length() - 1);
        return token.substring(0, token.length() - 1) + (last == 'A' ? 'B' : 'A');
    }

    @Test
    void loginWithAWrongPasswordIsUnauthorized() {
        assertThatThrownBy(() -> authService.login(new LoginRequest("a@b.com", "wrong"), "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid credentials");
    }

    @Test
    void loginWithAnUnknownEmailIsUnauthorizedNotNotFound() {
        when(users.findByEmailIgnoreCase("nobody@b.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody@b.com", "x"), "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid credentials");
    }

    @Test
    void aForgedRefreshTokenIsRejectedAndRevokesNothing() {
        assertThatThrownBy(() -> authService.refresh("not-a-real-token", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid refresh token");

        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void anExpiredRefreshTokenIsRejected() {
        RefreshToken expired = new RefreshToken(1L, "hash", java.time.Instant.now().minusSeconds(60), "j", "ip");
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> authService.refresh("anything", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");

        // Expiry is not theft: the chain survives.
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void reusingAnAlreadyRevokedTokenIsTreatedAsTheftAndKillsTheChain() {
        RefreshToken revoked = new RefreshToken(1L, "hash", java.time.Instant.now().plusSeconds(600), "j", "ip");
        revoked.revoke();
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> authService.refresh("stolen", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("reuse detected");

        // The whole point: revocation goes through the REQUIRES_NEW bean, so the 401 above
        // cannot roll it back.
        verify(revoker).revokeAllForUser(1L);
    }

    /**
     * Two tabs refresh at once. Both present the same token; one wins the rotation. Before the
     * grace window existed, the loser's replay revoked the whole family -- including the token
     * the winner had just been handed -- and signed the user out everywhere.
     */
    @Test
    void aRotationRaceInsideTheGraceWindowIsNotTheft() {
        RefreshToken rotated = rotatedToken(java.time.Instant.now().minusSeconds(2));

        var tokens = authService.refresh("the-loser-of-the-race", "junit", "127.0.0.1");

        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(rotated.isRevoked()).isTrue();
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void replayingARotatedTokenAfterTheGraceWindowIsStillTheft() {
        rotatedToken(java.time.Instant.now().minus(GRACE).minusSeconds(1));

        assertThatThrownBy(() -> authService.refresh("stolen-later", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("reuse detected");

        verify(revoker).revokeAllForUser(1L);
    }

    /**
     * Logout revokes without rotating, so there is no successor to date a grace window from.
     * A replayed logged-out token must never be honoured, however fresh.
     */
    @Test
    void replayingALoggedOutTokenIsTheftEvenImmediately() {
        RefreshToken loggedOut =
                new RefreshToken(1L, "hash", java.time.Instant.now().plusSeconds(600), "j", "ip");
        loggedOut.revoke(); // no setReplacedBy: logout does not rotate
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(loggedOut));

        assertThatThrownBy(() -> authService.refresh("replayed", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("reuse detected");

        verify(revoker).revokeAllForUser(1L);
    }

    /** A revoked token whose successor was rotated at {@code rotatedAt}. */
    private RefreshToken rotatedToken(java.time.Instant rotatedAt) {
        RefreshToken presented =
                new RefreshToken(1L, "hash", java.time.Instant.now().plusSeconds(600), "j", "ip");
        presented.revoke();
        presented.setReplacedBy(2L);

        RefreshToken successor =
                new RefreshToken(1L, "hash2", java.time.Instant.now().plusSeconds(600), "j", "ip");
        // createdAt is written by the database default, so it has no setter.
        ReflectionTestUtils.setField(successor, "createdAt", rotatedAt);

        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(presented));
        when(refreshTokens.findById(2L)).thenReturn(Optional.of(successor));
        return presented;
    }

    @Test
    void logoutRevokesOnlyThePresentedToken() {
        RefreshToken token = new RefreshToken(1L, "hash", java.time.Instant.now().plusSeconds(600), "j", "ip");
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(token));

        authService.logout("raw");

        assertThat(token.isRevoked()).isTrue();
        verify(revoker, never()).revokeAllForUser(anyLong());
    }
}
