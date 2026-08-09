package com.peerdsa.mail;

import static org.assertj.core.api.Assertions.assertThat;

import com.peerdsa.config.JwtProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/**
 * The signature on a one-click unsubscribe link.
 *
 * <p>The link needs no session, which is the point of it -- so the signature is the only thing
 * standing between it and anyone who can count. What matters is that a token for one account never
 * works for another: without that, {@code ?u=1&t=...} incremented in a loop unsubscribes everybody.
 */
class UnsubscribeTokensTest {

    private final UnsubscribeTokens tokens = new UnsubscribeTokens(properties("a-secret-of-at-least-32-bytes-length!!"));

    @Test
    void aTokenValidatesForTheUserItWasIssuedFor() {
        assertThat(tokens.isValid(42L, tokens.tokenFor(42L))).isTrue();
    }

    /** The one that matters: otherwise the link is just an id anyone can iterate. */
    @Test
    void aTokenForOneUserDoesNotWorkForAnother() {
        String mine = tokens.tokenFor(42L);

        assertThat(tokens.isValid(43L, mine)).isFalse();
        assertThat(tokens.tokenFor(43L)).isNotEqualTo(mine);
    }

    @Test
    void aGuessedOrAbsentTokenIsRejected() {
        assertThat(tokens.isValid(42L, "not-a-token")).isFalse();
        assertThat(tokens.isValid(42L, "")).isFalse();
        assertThat(tokens.isValid(42L, null)).isFalse();
        assertThat(tokens.isValid(null, tokens.tokenFor(42L))).isFalse();
    }

    /** A token truncated by an email client wrapping the URL must not still pass. */
    @Test
    void aTruncatedTokenIsRejected() {
        String full = tokens.tokenFor(42L);

        assertThat(tokens.isValid(42L, full.substring(0, full.length() - 1))).isFalse();
    }

    /** Rotating the JWT secret invalidates outstanding links, which is the accepted trade. */
    @Test
    void tokensAreBoundToTheSigningSecret() {
        UnsubscribeTokens other = new UnsubscribeTokens(properties("a-completely-different-secret!!!!!!!!"));

        assertThat(other.isValid(42L, tokens.tokenFor(42L))).isFalse();
    }

    @Test
    void aTokenIsLongEnoughToBeUnguessable() {
        // 32 hex characters is 128 bits.
        assertThat(tokens.tokenFor(42L)).hasSize(32).matches("^[0-9a-f]+$");
    }

    private static JwtProperties properties(String secret) {
        return new JwtProperties(
                secret,
                Duration.ofMinutes(15),
                Duration.ofDays(30),
                Duration.ofSeconds(30),
                Duration.ofDays(90),
                Duration.ofMinutes(15));
    }
}
