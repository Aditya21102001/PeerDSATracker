package com.peerdsa.auth.otp;

import com.peerdsa.mail.BrevoMailClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Sends a one-time code by email.
 *
 * <p>The transport itself lives in {@link BrevoMailClient} -- HTTP rather than SMTP, because the
 * ports SMTP needs are blocked on Render. This class owns only what is specific to a sign-in code:
 * the wording, and the rule that <b>the code is never written to a log at any level</b>.
 *
 * <p>Failure returns {@code false} rather than throwing. {@link OtpService} depends on that: on a
 * failed send it destroys the stored code and answers 503, and the one thing it must never do is
 * hand the code back to the caller instead.
 */
@Component
public class OtpDelivery {

    private static final Logger log = LoggerFactory.getLogger(OtpDelivery.class);

    private final BrevoMailClient mail;

    public OtpDelivery(BrevoMailClient mail) {
        this.mail = mail;
    }

    /**
     * @return true only if the provider accepted the message. False means nothing was sent, and
     *     the caller must destroy the code it was about to promise.
     */
    public boolean send(String to, String code) {
        boolean sent = mail.send(new BrevoMailClient.Message(
                to, "Your PeerDSATracker sign-in code", textBody(code), htmlBody(code)));

        if (sent) {
            // The address, masked. Never the code.
            log.info("Sign-in code sent to {}", mask(to));
        }
        return sent;
    }

    private String textBody(String code) {
        return """
                Your PeerDSATracker sign-in code is %s.

                It expires in 10 minutes and can be used once.

                If you did not ask for this code, you can ignore this email -- someone
                typed your address, but nothing has changed on your account."""
                .formatted(code);
    }

    private String htmlBody(String code) {
        return """
                <p>Your PeerDSATracker sign-in code is:</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">%s</p>
                <p>It expires in 10 minutes and can be used once.</p>
                <p style="color:#666">If you did not ask for this code you can ignore this email &mdash;
                someone typed your address, but nothing has changed on your account.</p>"""
                .formatted(code);
    }

    /** {@code aditya@example.com} becomes {@code a***a@example.com}. */
    public static String mask(String email) {
        return BrevoMailClient.mask(email);
    }
}
