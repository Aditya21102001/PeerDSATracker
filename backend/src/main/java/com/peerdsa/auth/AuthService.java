package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Core authentication logic: credential checks, plus issuing and rotating the JWT access token
 * and opaque refresh token. Only the SHA-256 of a refresh token is persisted; the raw value is
 * handed to the client once and never stored.
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final RefreshTokenRevoker revoker;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;

    public AuthService(
            UserRepository users,
            RefreshTokenRepository refreshTokens,
            RefreshTokenRevoker revoker,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            JwtProperties jwtProperties) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.revoker = revoker;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
    }

    @Transactional
    public TokenResponse signup(SignupRequest request, String userAgent, String ip) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        if (users.existsByUsernameIgnoreCase(request.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken");
        }

        User user = new User();
        user.setEmail(request.email());
        user.setUsername(request.username());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.username());
        users.save(user);

        return issueTokens(user, userAgent, ip).response();
    }

    @Transactional
    public TokenResponse login(LoginRequest request, String userAgent, String ip) {
        User user = users.findByEmailIgnoreCase(request.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return issueTokens(user, userAgent, ip).response();
    }

    /**
     * Rotates the presented refresh token. Presenting a token that was already rotated is
     * normally treated as theft: every session for that user is revoked.
     *
     * <p>The exception is a <em>rotation race</em>. The Angular interceptor single-flights
     * refreshes, but only within one page: two open tabs, or a reload that starts while the
     * previous page's refresh is still in flight, both present the same token. Without the
     * grace window below, the loser's 401 revokes the whole family — including the token the
     * winner was handed milliseconds earlier — and the user is silently signed out of every
     * tab. That is a self-inflicted denial of service on the honest path, and it is far more
     * common than actual theft.
     *
     * <p>So a replay is benign when the presented token was rotated (it has a successor) and
     * that rotation happened within {@code app.jwt.refresh-grace}. The racer is handed a fresh
     * token chain of its own; nothing is revoked. A token revoked <em>without</em> a successor
     * (i.e. by logout) has no successor to date the grace window from, so replaying it is still
     * theft. Replay after the window is still theft.
     *
     * <p>The cost: a stolen token replayed inside the grace window buys a session. That is the
     * standard trade this pattern makes, and the window is deliberately seconds, not minutes.
     */
    @Transactional
    public TokenResponse refresh(String rawToken, String userAgent, String ip) {
        RefreshToken stored = refreshTokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (stored.isRevoked()) {
            if (!isRotationRace(stored)) {
                // REQUIRES_NEW: the 401 below would otherwise roll this revocation back.
                revoker.revokeAllForUser(stored.getUserId());
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
            }
            User racer = users.findById(stored.getUserId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
            return issueTokens(racer, userAgent, ip).response();
        }
        if (!stored.isUsable()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }

        User user = users.findById(stored.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));

        Issued issued = issueTokens(user, userAgent, ip);
        stored.revoke();
        stored.setReplacedBy(issued.refreshToken().getId());
        return issued.response();
    }

    /**
     * True when a revoked token was superseded so recently that a second, honest client could
     * still have been holding it. The successor's {@code createdAt} is the rotation instant.
     */
    private boolean isRotationRace(RefreshToken presented) {
        Long successorId = presented.getReplacedBy();
        if (successorId == null) {
            return false;
        }
        return refreshTokens.findById(successorId)
                .map(RefreshToken::getCreatedAt)
                .filter(Objects::nonNull)
                .filter(rotatedAt -> Instant.now().isBefore(rotatedAt.plus(jwtProperties.refreshGrace())))
                .isPresent();
    }

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findByTokenHash(sha256(rawToken)).ifPresent(RefreshToken::revoke);
    }

    /** The persisted refresh token alongside the response, so callers can link the rotation chain. */
    private record Issued(TokenResponse response, RefreshToken refreshToken) {}

    private Issued issueTokens(User user, String userAgent, String ip) {
        String access = jwtService.generateAccessToken(user.getId(), user.getEmail());

        String rawRefresh = Tokens.random(48);

        RefreshToken saved = refreshTokens.save(new RefreshToken(
                user.getId(),
                sha256(rawRefresh),
                Instant.now().plus(jwtProperties.refreshTtl()),
                userAgent,
                ip));

        var response = new TokenResponse(access, rawRefresh, jwtProperties.accessTtl().toSeconds());
        return new Issued(response, saved);
    }

    private static String sha256(String value) {
        return Tokens.sha256(value);
    }
}
