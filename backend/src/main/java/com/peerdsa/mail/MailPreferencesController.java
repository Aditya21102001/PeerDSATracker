package com.peerdsa.mail;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Turning the daily digest off, by the two routes that matter.
 *
 * <p>The signed link works with no session at all -- see {@link UnsubscribeTokens} for why that is
 * a requirement rather than a shortcut. The authenticated toggle is the way back on, because
 * re-subscribing somebody must not be possible from a link anyone could replay.
 */
@RestController
@RequestMapping("/api/mail")
public class MailPreferencesController {

    private static final Logger log = LoggerFactory.getLogger(MailPreferencesController.class);

    private final UserRepository users;
    private final UnsubscribeTokens tokens;

    public MailPreferencesController(UserRepository users, UnsubscribeTokens tokens) {
        this.users = users;
        this.tokens = tokens;
    }

    /**
     * One click, no login, from the footer of any digest.
     *
     * <p>Returns a small self-contained HTML page rather than redirecting into the SPA: it has to
     * work when the frontend is down, when the user is on a device that has never seen the app, and
     * when they have no intention of ever opening it again.
     *
     * <p>Answers the same page for a bad token as for a good one. There is nothing to gain from
     * telling an anonymous caller whether a guessed id-and-token pair was right, and a mail client
     * pre-fetching the link must not be able to distinguish either.
     */
    @GetMapping(value = "/unsubscribe", produces = MediaType.TEXT_HTML_VALUE)
    @Transactional
    public ResponseEntity<String> unsubscribe(
            @RequestParam("u") Long userId, @RequestParam("t") String token) {

        if (tokens.isValid(userId, token)) {
            users.findById(userId).ifPresent(user -> {
                if (user.isEmailDigest()) {
                    user.setEmailDigest(false);
                    users.save(user);
                    log.info("User {} unsubscribed from the daily digest via an emailed link", userId);
                }
            });
        } else {
            log.info("Rejected an unsubscribe link with a bad signature for id {}", userId);
        }

        return ResponseEntity.ok(page());
    }

    /** The in-app toggle. Authenticated, and the only way to turn the digest back on. */
    @PostMapping("/preferences")
    @Transactional
    public MailPreferences update(
            @AuthenticationPrincipal User principal, @RequestBody MailPreferences preferences) {

        // Re-read inside the transaction: the principal is a detached snapshot from the security
        // filter, and saving it would write back every stale field it happens to hold.
        User user = users.findById(principal.getId()).orElseThrow();
        user.setEmailDigest(preferences.dailyDigest());
        users.save(user);

        log.info("User {} set daily digest to {}", user.getId(), preferences.dailyDigest());
        return new MailPreferences(user.isEmailDigest());
    }

    @GetMapping("/preferences")
    public MailPreferences current(@AuthenticationPrincipal User user) {
        return new MailPreferences(user.isEmailDigest());
    }

    /** Which emails this account wants. One flag today; the shape leaves room for more. */
    public record MailPreferences(boolean dailyDigest) {}

    private static String page() {
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Unsubscribed - PeerDSATracker</title>
                </head>
                <body style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;
                             background:#0f1117;color:#e6e8ee;margin:0;
                             display:flex;min-height:100vh;align-items:center;justify-content:center">
                  <main style="max-width:32rem;padding:2rem;text-align:center">
                    <h1 style="font-size:1.5rem;margin:0 0 1rem">You're unsubscribed</h1>
                    <p style="color:#9aa3b2;line-height:1.6;margin:0 0 1rem">
                      You won't get the daily practice digest any more. Nothing else about your
                      account has changed, and your progress is exactly where you left it.
                    </p>
                    <p style="color:#9aa3b2;line-height:1.6;margin:0">
                      Changed your mind? Sign in and turn it back on from your profile.
                    </p>
                  </main>
                </body>
                </html>
                """;
    }
}
