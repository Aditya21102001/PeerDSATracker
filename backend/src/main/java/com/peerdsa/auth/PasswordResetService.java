package com.peerdsa.auth;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final int TOKEN_BYTES = 32;

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final ResetLinkDeliverer deliverer;
    private final Duration ttl;
    private final int maxPerHour;

    public PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository tokens,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            ResetLinkDeliverer deliverer,
            @Value("${app.reset.ttl}") Duration ttl,
            @Value("${app.reset.max-per-hour}") int maxPerHour) {
        this.users = users;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.deliverer = deliverer;
        this.ttl = ttl;
        this.maxPerHour = maxPerHour;
    }

    /**
     * Always succeeds from the caller's point of view. Telling an anonymous request
     * whether an email is registered hands out a user-enumeration oracle, so an unknown
     * address and a rate-limited one both look exactly like a delivered link.
     */
    @Transactional
    public void requestReset(String email) {
        User user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user == null) {
            log.info("Password reset requested for unknown email");
            return;
        }

        Instant now = Instant.now();
        if (tokens.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(Duration.ofHours(1))) >= maxPerHour) {
            log.warn("Password reset rate limit hit for user {}", user.getId());
            return;
        }

        // Only the newest link should work.
        tokens.invalidateOutstanding(user.getId(), now);

        String rawToken = Tokens.random(TOKEN_BYTES);
        tokens.save(new PasswordResetToken(user.getId(), Tokens.sha256(rawToken), now.plus(ttl)));
        deliverer.deliver(user.getEmail(), rawToken);
    }

    /**
     * Consumes the token, sets the new password, and revokes every refresh token the
     * user holds: a reset is precisely the case where an existing session may belong to
     * an attacker.
     */
    @Transactional
    public void reset(String rawToken, String newPassword) {
        Instant now = Instant.now();

        PasswordResetToken token = tokens.findByTokenHash(Tokens.sha256(rawToken))
                .filter(t -> t.isUsable(now))
                .orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired reset token"));

        User user = users.findById(token.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid reset token"));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        users.save(user);

        token.consume(now);
        tokens.save(token);

        int revoked = refreshTokens.revokeAllForUser(user.getId());
        log.info("Password reset for user {}; revoked {} refresh token(s)", user.getId(), revoked);
    }
}
