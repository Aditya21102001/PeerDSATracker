package com.peerdsa.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.config.JwtProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * The single gate every protected endpoint sits behind.
 *
 * <p>This application deliberately has no guest, trial or attendee token: every credential it
 * issues follows a password, a code sent to a registered address, or an OAuth2 provider. That is
 * what lets {@code SecurityConfig} say {@code anyRequest().authenticated()} and mean "is who they
 * claim" rather than "asked for a token". The rule is only as good as this filter, so the tests
 * below drive the real filter with tokens that are correctly signed and would otherwise pass, and
 * assert that nothing lands in the {@link SecurityContextHolder}.
 *
 * <p>Testing it here rather than per endpoint is the point: the filter runs once, ahead of every
 * route, so a token refused here is refused by every endpoint that reads real data.
 */
class JwtAuthenticationFilterTest {

    private static final String SECRET = "test-secret-that-is-definitely-long-enough-for-hs256";

    private final SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    private final JwtProperties properties = new JwtProperties(
            SECRET,
            Duration.ofMinutes(15),
            Duration.ofDays(30),
            Duration.ofSeconds(30),
            Duration.ofDays(90),
            Duration.ofMinutes(15));

    private JwtService jwtService;
    private UserRepository users;
    private JwtAuthenticationFilter filter;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(properties);
        users = mock(UserRepository.class);
        filter = new JwtAuthenticationFilter(jwtService, users);
        chain = mock(FilterChain.class);

        User user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("a@b.com");
        user.setUsername("aditya");
        when(users.findById(1L)).thenReturn(Optional.of(user));
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** The control: a real session token does authenticate, so the negatives below mean something. */
    @Test
    void aRealAccessTokenAuthenticates() throws Exception {
        run(jwtService.generateAccessToken(1L, "a@b.com", Instant.now()));

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(users).isNotNull();
    }

    /**
     * A challenge token: correctly signed by us, naming a real user, unexpired. Only {@code typ}
     * says it is not a session. Without that check it would be indistinguishable from one.
     */
    @Test
    void anMfaChallengeTokenDoesNotAuthenticateAnyEndpoint() throws Exception {
        run(scoped("mfa-challenge"));

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        // And the user is never even loaded, so nothing downstream can be fooled by a side effect.
        verify(users, never()).findById(any());
    }

    /** The generic case: any scoped, short-lived or self-asserted token, whatever it is called. */
    @Test
    void aScopedOrGuestTokenDoesNotAuthenticateAnyEndpoint() throws Exception {
        for (String type : new String[] {"guest", "attendee", "password-reset", "refresh", ""}) {
            SecurityContextHolder.clearContext();

            run(scoped(type));

            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .as("token of type '%s' must not authenticate", type)
                    .isNull();
        }
    }

    @Test
    void aTokenFromASessionPastTheAbsoluteCapDoesNotAuthenticate() throws Exception {
        Instant startedBeyondTheCap = Instant.now().minus(Duration.ofDays(90)).minusSeconds(60);

        run(jwtService.generateAccessToken(1L, "a@b.com", startedBeyondTheCap));

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void aRequestWithNoTokenIsSimplyLeftAnonymous() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        // The chain still runs: rejecting is the security chain's job, not this filter's.
        verify(chain).doFilter(any(), any());
    }

    // ---------------------------------------------------------------------------- helpers

    private void run(String token) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        filter.doFilter(request, new MockHttpServletResponse(), chain);
    }

    /** Signed with the real key: the whole point is that a valid signature is not enough. */
    private String scoped(String type) {
        return Jwts.builder()
                .subject("1")
                .claim("typ", type)
                .claim("sst", Instant.now().getEpochSecond())
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(key)
                .compact();
    }
}
