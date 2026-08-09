package com.peerdsa.auth;

import static com.peerdsa.auth.AuthTestFixtures.GRACE;
import static com.peerdsa.auth.AuthTestFixtures.SESSION_MAX;
import static com.peerdsa.auth.AuthTestFixtures.jwtProperties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.otp.OtpService;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
 *
 * <p>Also covers the absolute session cap: rotation pushes {@code expiresAt} forward every time,
 * so {@code sessionStartedAt} is the only thing that ever ends a busy session.
 */
class AuthServiceTest {

    private UserRepository users;
    private RefreshTokenRepository refreshTokens;
    private RefreshTokenRevoker revoker;
    private OtpService otpService;
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        revoker = mock(RefreshTokenRevoker.class);
        otpService = mock(OtpService.class);

        PasswordEncoder encoder = new BCryptPasswordEncoder();
        JwtProperties properties = jwtProperties();
        jwtService = new JwtService(properties);

        authService =
                new AuthService(users, refreshTokens, revoker, encoder, jwtService, properties, otpService);

        // save() returns its argument, as Spring Data does. findByTokenHash is stubbed
        // per test, since each one cares about a specific token state.
        when(refreshTokens.save(any())).thenAnswer((Answer<RefreshToken>) i -> i.getArgument(0));
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.empty());

        User user = AuthTestFixtures.user(1L, "a@b.com", "aditya", encoder.encode("Passw0rd!"));
        when(users.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(user));
        when(users.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        when(users.findById(any())).thenReturn(Optional.of(user));
    }

    @Test
    void loginIssuesBothTokensWithTheConfiguredAccessTtl() {
        var tokens = authService.login(login("a@b.com", "Passw0rd!"), "junit", "127.0.0.1");

        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(tokens.expiresInSeconds()).isEqualTo(900);
    }

    @Test
    void anAccessTokenRoundTripsToTheUserIdItWasIssuedFor() {
        String token = jwtService.generateAccessToken(1234L, "a@b.com", Instant.now());

        assertThat(jwtService.extractUserId(token)).isEqualTo(1234L);
    }

    @Test
    void aTamperedOrForgedAccessTokenYieldsNoUserId() {
        String token = jwtService.generateAccessToken(1234L, "a@b.com", Instant.now());
        String[] parts = token.split("\\.");

        // Re-sign the same claims with a different secret.
        String forged = new JwtService(jwtProperties("a-completely-different-secret-of-sufficient-length!!"))
                .generateAccessToken(1234L, "a@b.com", Instant.now());

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
        String token = jwtService.generateAccessToken(1234L, "a@b.com", Instant.now());

        assertThat(jwtService.extractUserId(token + "xy")).isNull();
    }

    private static String flipLastChar(String token) {
        char last = token.charAt(token.length() - 1);
        return token.substring(0, token.length() - 1) + (last == 'A' ? 'B' : 'A');
    }

    @Test
    void loginWithAWrongPasswordIsUnauthorized() {
        assertThatThrownBy(() -> authService.login(login("a@b.com", "wrong"), "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid username or password");
    }

    @Test
    void loginWithAnUnknownEmailIsUnauthorizedNotNotFound() {
        when(users.findByEmailIgnoreCase("nobody@b.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(login("nobody@b.com", "x"), "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid username or password");
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
        RefreshToken expired = token(Instant.now().minusSeconds(60), Instant.now().minusSeconds(120));
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> authService.refresh("anything", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");

        // Expiry is not theft: the chain survives.
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void reusingAnAlreadyRevokedTokenIsTreatedAsTheftAndKillsTheChain() {
        RefreshToken revoked = token(Instant.now().plusSeconds(600), Instant.now());
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
        RefreshToken rotated = rotatedToken(Instant.now().minusSeconds(2), Instant.now());

        var tokens = authService.refresh("the-loser-of-the-race", "junit", "127.0.0.1");

        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(rotated.isRevoked()).isTrue();
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void replayingARotatedTokenAfterTheGraceWindowIsStillTheft() {
        rotatedToken(Instant.now().minus(GRACE).minusSeconds(1), Instant.now());

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
        RefreshToken loggedOut = token(Instant.now().plusSeconds(600), Instant.now());
        loggedOut.revoke(); // no setReplacedBy: logout does not rotate
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(loggedOut));

        assertThatThrownBy(() -> authService.refresh("replayed", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("reuse detected");

        verify(revoker).revokeAllForUser(1L);
    }

    // ---------------------------------------------------------------- the absolute session cap

    /**
     * The reason the cap exists. Every rotation sets a brand-new {@code expiresAt} 30 days out, so
     * a token refreshed even once a month is forever valid on its own terms; only
     * {@code sessionStartedAt}, copied unchanged along the chain, ever ends it.
     */
    @Test
    void aSessionPastTheAbsoluteCapCannotRefreshEvenThoughTheTokenItselfIsFresh() {
        Instant startedLongAgo = Instant.now().minus(SESSION_MAX).minusSeconds(60);
        RefreshToken stillValid = token(Instant.now().plus(Duration.ofDays(30)), startedLongAgo);
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(stillValid));

        assertThatThrownBy(() -> authService.refresh("well-within-its-own-ttl", "junit", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Session expired");

        // Outliving the cap is not evidence of theft, so nothing else is punished for it.
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    @Test
    void aRefreshCarriesTheOriginalSessionStartOntoTheSuccessorRatherThanRestartingIt() {
        Instant startedAt = Instant.now().minus(Duration.ofDays(40));
        RefreshToken current = token(Instant.now().plusSeconds(600), startedAt);
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(current));

        authService.refresh("healthy", "junit", "127.0.0.1");

        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().getSessionStartedAt()).isEqualTo(startedAt);
    }

    @Test
    void logoutRevokesOnlyThePresentedToken() {
        RefreshToken t = token(Instant.now().plusSeconds(600), Instant.now());
        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(t));

        authService.logout("raw");

        assertThat(t.isRevoked()).isTrue();
        verify(revoker, never()).revokeAllForUser(anyLong());
    }

    // ---------------------------------------------------------------------------- helpers

    private static LoginRequest login(String identifier, String password) {
        return new LoginRequest(identifier, null, password);
    }

    private static RefreshToken token(Instant expiresAt, Instant sessionStartedAt) {
        return new RefreshToken(1L, "hash", expiresAt, sessionStartedAt, "junit", "ip");
    }

    /** A revoked token whose successor was rotated at {@code rotatedAt}. */
    private RefreshToken rotatedToken(Instant rotatedAt, Instant sessionStartedAt) {
        RefreshToken presented = token(Instant.now().plusSeconds(600), sessionStartedAt);
        presented.revoke();
        presented.setReplacedBy(2L);

        RefreshToken successor =
                new RefreshToken(1L, "hash2", Instant.now().plusSeconds(600), sessionStartedAt, "j", "ip");
        // createdAt is written by the database default, so it has no setter.
        ReflectionTestUtils.setField(successor, "createdAt", rotatedAt);

        when(refreshTokens.findByTokenHash(any())).thenReturn(Optional.of(presented));
        when(refreshTokens.findById(2L)).thenReturn(Optional.of(successor));
        return presented;
    }
}
