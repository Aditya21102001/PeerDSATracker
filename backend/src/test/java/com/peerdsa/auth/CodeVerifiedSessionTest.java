package com.peerdsa.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.otp.OtpService;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.junit.jupiter.api.DisplayName;

/**
 * What a code sign-in produces, and -- more importantly -- what a refresh of it does not.
 *
 * <p>The {@code vbc} claim means "this session began by proving control of the registered
 * address". Carrying it across a rotation would quietly convert a one-time proof into a standing
 * permission to rewrite the password, for as long as the session stayed alive. That is the exact
 * opposite of the intent: the claim exists so a recovery can finish, not so it never has to.
 */
class CodeVerifiedSessionTest {

    private UserRepository users;
    private RefreshTokenRepository refreshTokens;
    private OtpService otpService;
    private JwtService jwtService;
    private AuthService authService;
    private User account;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        otpService = mock(OtpService.class);

        JwtProperties properties = AuthTestFixtures.jwtProperties();
        jwtService = new JwtService(properties);
        authService = new AuthService(
                users,
                refreshTokens,
                mock(RefreshTokenRevoker.class),
                new BCryptPasswordEncoder(),
                jwtService,
                properties,
                otpService);

        account = AuthTestFixtures.user(7L, "a@b.com", "aditya", null);
        when(refreshTokens.save(any())).thenAnswer((Answer<RefreshToken>) i -> i.getArgument(0));
        when(users.findById(7L)).thenReturn(Optional.of(account));
        when(otpService.verifyForSignIn("a@b.com", "123456")).thenReturn(account);
    }

    @Test
    @DisplayName("a code sign-in issues a token that can set a password")
    void codeSignInIssuesAVerifiedToken() {
        TokenResponse tokens = authService.loginWithCode("a@b.com", "123456", "junit", "ip");

        assertThat(jwtService.isVerifiedByCode(tokens.accessToken())).isTrue();
    }

    /** The claim it grants is the only thing it grants; it is still an ordinary session otherwise. */
    @Test
    void aCodeVerifiedTokenIsStillJustASessionForItsOwnUser() {
        TokenResponse tokens = authService.loginWithCode("a@b.com", "123456", "junit", "ip");

        assertThat(jwtService.extractUserId(tokens.accessToken())).isEqualTo(7L);
    }

    /**
     * §8.5, the half that is easy to miss: the claim must not survive a refresh. A renewed session
     * is no longer "just verified".
     */
    @Test
    void theVbcClaimIsAbsentFromARefreshedToken() {
        TokenResponse original = authService.loginWithCode("a@b.com", "123456", "junit", "ip");
        assertThat(jwtService.isVerifiedByCode(original.accessToken())).isTrue();

        RefreshToken stored = new RefreshToken(
                7L, Tokens.sha256(original.refreshToken()), Instant.now().plusSeconds(600),
                Instant.now(), "junit", "ip");
        when(refreshTokens.findByTokenHash(Tokens.sha256(original.refreshToken())))
                .thenReturn(Optional.of(stored));

        TokenResponse refreshed = authService.refresh(original.refreshToken(), "junit", "ip");

        assertThat(jwtService.isVerifiedByCode(refreshed.accessToken())).isFalse();
        // Still a perfectly good session -- it has simply lost the one extra power.
        assertThat(jwtService.extractUserId(refreshed.accessToken())).isEqualTo(7L);
    }
}
