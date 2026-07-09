package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

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
     * Rotates the presented refresh token. Presenting a token that was already
     * rotated is treated as theft: every session for that user is revoked. The
     * Angular interceptor's single-flight refresh guarantees a well-behaved client
     * never presents the same token twice.
     */
    @Transactional
    public TokenResponse refresh(String rawToken, String userAgent, String ip) {
        RefreshToken stored = refreshTokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (stored.isRevoked()) {
            // REQUIRES_NEW: the 401 below would otherwise roll this revocation back.
            revoker.revokeAllForUser(stored.getUserId());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
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

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findByTokenHash(sha256(rawToken)).ifPresent(RefreshToken::revoke);
    }

    /** The persisted refresh token alongside the response, so callers can link the rotation chain. */
    private record Issued(TokenResponse response, RefreshToken refreshToken) {}

    private Issued issueTokens(User user, String userAgent, String ip) {
        String access = jwtService.generateAccessToken(user.getId(), user.getEmail());

        byte[] bytes = new byte[48];
        RANDOM.nextBytes(bytes);
        String rawRefresh = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

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
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
