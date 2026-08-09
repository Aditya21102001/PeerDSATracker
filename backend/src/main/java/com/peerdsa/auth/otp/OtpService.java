package com.peerdsa.auth.otp;

import com.peerdsa.auth.Tokens;
import com.peerdsa.config.OtpProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Issues and consumes the one-time codes behind code sign-in and password recovery.
 *
 * <p><b>The demo-mode rule.</b> {@code app.otp.demo-mode} returns the code in the API response so
 * the flow can be exercised without a mail provider. It is a separate branch, taken before
 * delivery is even attempted -- never a fallback. The shape that looks natural,
 *
 * <pre>{@code
 * if (!demoMode && delivery.send(email, code)) return null;
 * return code;
 * }</pre>
 *
 * hands a working credential to anyone who can make delivery fail, and making it fail is easy:
 * ask for a code for an address the provider rejects. Here a failed send destroys the stored code
 * and answers 503, so a caller who cannot receive mail gets nothing at all.
 *
 * <p>Codes are stored only as a SHA-256, expire in minutes, and are single use. Requests are
 * limited per destination, counted for registered and unregistered addresses alike -- see
 * {@link OtpCode} for why that uniformity matters.
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);
    private static final Duration RATE_WINDOW = Duration.ofHours(1);

    private final OtpCodeRepository codes;
    private final UserRepository users;
    private final OtpDelivery delivery;
    private final OtpProperties properties;

    public OtpService(
            OtpCodeRepository codes, UserRepository users, OtpDelivery delivery, OtpProperties properties) {
        this.codes = codes;
        this.users = users;
        this.delivery = delivery;
        this.properties = properties;
    }

    /**
     * Issues a code for {@code rawEmail} and sends it.
     *
     * @return the code, and only in demo mode. Null in every other case, including every failure.
     * @throws ResponseStatusException 429 when the address is over its hourly budget, 503 when the
     *     provider would not take the message.
     */
    @Transactional
    public String requestCode(String rawEmail) {
        String email = normalise(rawEmail);
        Instant now = Instant.now();

        // Before the account lookup on purpose. Throttling only addresses that exist would make a
        // 429 mean "this address is registered".
        if (codes.countByEmailAndCreatedAtAfter(email, now.minus(RATE_WINDOW)) >= properties.maxPerHour()) {
            log.warn("Sign-in code rate limit hit for {}", OtpDelivery.mask(email));
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS, "Too many code requests. Try again later.");
        }

        User user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user == null) {
            // Record the request so it counts, but issue nothing: a code that cannot resolve to an
            // account is a credential with no purpose. The caller still sees the same 202.
            codes.save(OtpCode.unissued(email, now.plus(properties.ttl())));
            log.info("Sign-in code requested for an address with no account: {}", OtpDelivery.mask(email));
            return null;
        }

        String code = Tokens.digits(properties.length());
        codes.supersedeOutstanding(email);
        OtpCode issued = codes.save(OtpCode.issued(email, Tokens.sha256(code), now.plus(properties.ttl())));

        if (properties.demoMode()) {
            // Its own branch, reached only when demo mode is on, and delivery is not attempted.
            log.warn(
                    "OTP demo mode is ON: the code for {} is being returned in the HTTP response."
                            + " Set OTP_DEMO_MODE=false anywhere real.",
                    OtpDelivery.mask(email));
            return code;
        }

        if (!delivery.send(email, code)) {
            // Nothing was sent, so nothing may be honoured. Destroy the code rather than leave a
            // live credential nobody received -- and never, ever return it.
            codes.delete(issued);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Could not send the code. Try again shortly.");
        }
        return null;
    }

    /**
     * Consumes a code for sign-in.
     *
     * <p>The account is resolved from the address the code was <em>issued to</em>, which is stored
     * on the row -- not from anything the caller sent alongside the code. Were it otherwise, a code
     * mailed to one address would sign in whatever account the request named.
     *
     * @throws ResponseStatusException 401, with one message for every way this can fail.
     */
    @Transactional
    public User verifyForSignIn(String rawEmail, String code) {
        String email = normalise(rawEmail);

        OtpCode row = consume(email, code).orElseThrow(() -> {
            log.info("Rejected a sign-in code for {}: no live code matches", OtpDelivery.mask(email));
            return invalidCode();
        });

        return users.findByEmailIgnoreCase(row.getEmail()).orElseThrow(() -> {
            // The code was real but its account has since gone. Same 401, same wording.
            log.warn("A valid code for {} has no account behind it", OtpDelivery.mask(row.getEmail()));
            return invalidCode();
        });
    }

    /**
     * Consumes a code as proof of identity for an already-signed-in user -- the recovery path
     * through change-password. The address comes from the session's account, never from the body.
     *
     * @return false when the code does not match; the caller must not say why.
     */
    @Transactional
    public boolean consumeForUser(User user, String code) {
        boolean accepted = consume(normalise(user.getEmail()), code).isPresent();
        if (accepted) {
            log.info("Accepted a one-time code as proof of identity for user {}", user.getId());
        }
        return accepted;
    }

    private Optional<OtpCode> consume(String email, String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        Optional<OtpCode> match = codes.findByEmailAndCodeHash(email, Tokens.sha256(code.trim()))
                .filter(row -> row.isUsable(Instant.now()));
        match.ifPresent(OtpCode::consume);
        return match;
    }

    /** Housekeeping for {@link com.peerdsa.auth.otp.OtpCleanupScheduler}. */
    @Transactional
    public int deleteRowsPastTheRateWindow() {
        return codes.deleteCreatedBefore(Instant.now().minus(RATE_WINDOW));
    }

    /**
     * One message, whether the code was wrong, expired, already used, or issued to an address
     * whose account has since gone. Any distinction tells a guesser which half they got right.
     */
    private static ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "That code is not valid or has expired.");
    }

    private static String normalise(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
