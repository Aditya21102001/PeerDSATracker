package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.otp.OtpDelivery;
import com.peerdsa.config.OAuthProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns a verified identity from an OAuth2 provider into a session on this application.
 *
 * <p>Three rules, all of which the obvious find-or-create shortcut breaks:
 *
 * <ul>
 *   <li>An <b>existing</b> account signs in with the role it already has. The provider proves who
 *       somebody is; it does not decide what they may do. No path here writes a role onto an
 *       account that already exists.
 *   <li>An <b>unknown</b> identity is refused unless auto-provisioning is explicitly on, and even
 *       then the account is created with a configured role that {@link OAuthProperties} has
 *       already refused to let be a privileged one.
 *   <li>An identity with <b>no email</b> is refused. Matching is by address; without one there is
 *       nothing to match, and provisioning would mint an account nobody can ever sign into again.
 * </ul>
 */
@Service
public class OAuthSignInService {

    private static final Logger log = LoggerFactory.getLogger(OAuthSignInService.class);

    private final UserRepository users;
    private final AuthService authService;
    private final OAuthProperties properties;

    public OAuthSignInService(UserRepository users, AuthService authService, OAuthProperties properties) {
        this.users = users;
        this.authService = authService;
        this.properties = properties;
    }

    /**
     * @return a fresh session for the identity, which the caller hands to the browser.
     * @throws OAuthSignInRefusedException when this application declines the identity. The message
     *     is safe to show the user.
     */
    @Transactional
    public TokenResponse signIn(
            String rawEmail, String name, String pictureUrl, String userAgent, String ip) {

        if (rawEmail == null || rawEmail.isBlank()) {
            throw new OAuthSignInRefusedException(
                    "Google did not share an email address, so there is no account to match. "
                            + "Sign in with your username and password instead.");
        }
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);

        User existing = users.findByEmailIgnoreCase(email).orElse(null);
        if (existing != null) {
            // Note what is absent: no setRole. Whatever this account is, it stays.
            log.info("Google sign-in for existing account {} (role {})", existing.getId(), existing.getRole());
            return authService.issueSession(existing, userAgent, ip);
        }

        if (!properties.autoProvision()) {
            log.info("Refused Google sign-in for {}: no account and auto-provisioning is off",
                    OtpDelivery.mask(email));
            throw new OAuthSignInRefusedException(
                    "No PeerDSATracker account uses that Google address. Create an account first, "
                            + "then sign in with Google.");
        }

        User created = provision(email, name, pictureUrl);
        log.info("Auto-provisioned account {} from Google with role {}", created.getId(), created.getRole());
        return authService.issueSession(created, userAgent, ip);
    }

    private User provision(String email, String name, String pictureUrl) {
        User user = new User();
        user.setEmail(email);
        user.setUsername(generateUsername(email));
        // No password hash at all. The account cannot sign in with a password until its owner sets
        // one, which is why login must skip a null hash instead of handing it to the encoder.
        user.setPasswordHash(null);
        user.setDisplayName(name == null || name.isBlank() ? user.getUsername() : name.trim());
        user.setAvatarUrl(pictureUrl);
        user.setRole(properties.defaultRole());
        return users.save(user);
    }

    /**
     * Derives a username from the address, because the provider gives us none and the column is
     * NOT NULL. It has to satisfy the same rules as a self-chosen one: 3-30 characters of letters,
     * digits, dot, hyphen and underscore.
     *
     * <p>The result is a name its owner has never seen, which is precisely why sign-in has to
     * accept an email too, and why the password-change response reports the username back.
     */
    private String generateUsername(String email) {
        String base = email.substring(0, email.indexOf('@'))
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9._-]", "");
        base = base.replaceAll("^[._-]+", "").replaceAll("[._-]+$", "");

        if (base.length() < 3) {
            base = "user" + base;
        }
        if (base.length() > 24) {
            // Leaves room for the ".1234" disambiguator below inside the 30-character limit.
            base = base.substring(0, 24);
        }
        if (!users.existsByUsernameIgnoreCase(base)) {
            return base;
        }
        for (int attempt = 0; attempt < 50; attempt++) {
            String candidate = base + "." + Tokens.digits(4);
            if (!users.existsByUsernameIgnoreCase(candidate)) {
                return candidate;
            }
        }
        throw new OAuthSignInRefusedException(
                "Could not pick a username for that account. Sign up with an email and password instead.");
    }
}
