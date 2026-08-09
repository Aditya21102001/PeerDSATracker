package com.peerdsa.mail;

import com.peerdsa.config.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Signs the one-click unsubscribe link in every digest footer.
 *
 * <p>An HMAC of the user id rather than a session or a stored token, for one reason: the person
 * most likely to want out is the person who has abandoned the account and cannot sign in. Making
 * them log in to stop receiving mail is how a "unsubscribe" link becomes a "report spam" click,
 * and complaint rate -- not intent -- is what gets a sending domain suspended.
 *
 * <p>It carries no expiry. A link in a year-old email must still work; that is the whole point of
 * it. The capability it grants is deliberately tiny and one-way: it can stop mail to an account
 * and can do nothing else. It cannot sign in, cannot read anything, and cannot re-subscribe --
 * turning the digest back on requires actually being signed in, so a leaked link cannot be used to
 * mail-bomb somebody back.
 *
 * <p>Keyed off the JWT secret, so rotating that invalidates every outstanding link. Acceptable:
 * the consequence is one dead link and an in-app toggle that still works.
 */
@Component
public class UnsubscribeTokens {

    private static final String ALGORITHM = "HmacSHA256";

    private final SecretKeySpec key;

    public UnsubscribeTokens(JwtProperties jwtProperties) {
        this.key = new SecretKeySpec(
                jwtProperties.secret().getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }

    /** The token to put in this user's unsubscribe link. */
    public String tokenFor(Long userId) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            byte[] signature = mac.doFinal(("unsubscribe:" + userId).getBytes(StandardCharsets.UTF_8));
            // Half of SHA-256 is 128 bits: far past guessing, and short enough that the link
            // survives an email client wrapping it.
            return HexFormat.of().formatHex(signature).substring(0, 32);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    /** Constant-time comparison: a token check that leaks timing is a token check that leaks. */
    public boolean isValid(Long userId, String presented) {
        if (userId == null || presented == null) {
            return false;
        }
        return MessageDigest.isEqual(
                tokenFor(userId).getBytes(StandardCharsets.UTF_8),
                presented.getBytes(StandardCharsets.UTF_8));
    }
}
