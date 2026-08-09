package com.peerdsa.auth.otp;

import com.peerdsa.config.OtpProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Sends a one-time code by email through the provider's HTTP API.
 *
 * <p>HTTP, not SMTP, deliberately. Render -- like Fly and Heroku -- blocks outbound connections on
 * the SMTP ports, so a JavaMailSender implementation passes every local test and then fails
 * silently in production. Brevo's free tier needs only an API key and a verified sender:
 * {@code POST https://api.brevo.com/v3/smtp/email}, credential in the {@code api-key} header,
 * success is <b>201</b>, not 200.
 *
 * <p>Two logging rules hold everywhere in this class: the code is never written to a log at any
 * level, and addresses are masked to {@code a***a@example.com}. A log stream is read by more
 * people than a mailbox is.
 *
 * <p>Every failure path returns {@code false} rather than throwing. The caller must be able to
 * treat "not delivered" as a plain boolean, because what it does next -- destroy the stored code
 * and answer 503 -- is the only safe response, and an exception escaping here would tempt a
 * caller into returning the code instead.
 */
@Component
public class OtpDelivery {

    private static final Logger log = LoggerFactory.getLogger(OtpDelivery.class);

    private static final String BREVO = "brevo";
    private static final String DISABLED = "none";

    private final OtpProperties.Email settings;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    public OtpDelivery(OtpProperties properties, ObjectMapper mapper) {
        this.settings = properties.email();
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * @return true only if the provider accepted the message. False means nothing was sent, and
     *     the caller must destroy the code it was about to promise.
     */
    public boolean send(String to, String code) {
        String provider = settings.provider() == null ? DISABLED : settings.provider().trim().toLowerCase();

        if (DISABLED.equals(provider)) {
            log.warn("OTP delivery is disabled (app.otp.email.provider=none); nothing sent to {}", mask(to));
            return false;
        }
        if (!BREVO.equals(provider)) {
            log.error("Unknown OTP email provider '{}'; nothing sent to {}", provider, mask(to));
            return false;
        }
        if (!settings.configured()) {
            log.error(
                    "OTP email is not configured (need OTP_EMAIL_API_KEY and a verified OTP_EMAIL_FROM);"
                            + " nothing sent to {}",
                    mask(to));
            return false;
        }

        return sendViaBrevo(to, code);
    }

    private boolean sendViaBrevo(String to, String code) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(settings.baseUrl()))
                    .header("api-key", settings.apiKey())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.ofString(payload(to, code)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            // Brevo answers 201 Created, not 200. Treating any 2xx as success would also
            // accept a 202 from a misconfigured proxy that never queued the message.
            if (response.statusCode() != 201) {
                log.warn(
                        "Brevo rejected the code email for {}: HTTP {} {}",
                        mask(to),
                        response.statusCode(),
                        truncate(response.body()));
                return false;
            }
            log.info("Sign-in code sent to {}", mask(to));
            return true;

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted sending the code email for {}", mask(to));
            return false;
        } catch (Exception e) {
            // Deliberately broad: a DNS failure, a TLS failure and a serialization failure are
            // all the same thing to the caller, and none of them may leak the code.
            log.warn("Could not send the code email for {}: {}", mask(to), e.toString());
            return false;
        }
    }

    private String payload(String to, String code) {
        ObjectNode body = mapper.createObjectNode();

        ObjectNode sender = body.putObject("sender");
        sender.put("email", settings.from());
        if (settings.fromName() != null && !settings.fromName().isBlank()) {
            sender.put("name", settings.fromName());
        }

        body.putArray("to").addObject().put("email", to);
        body.put("subject", "Your PeerDSATracker sign-in code");
        body.put("textContent", textBody(code));
        body.put("htmlContent", htmlBody(code));

        return body.toString();
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

    /**
     * {@code aditya@example.com} becomes {@code a***a@example.com}. Enough to tell two addresses
     * apart when reading a log, not enough to be one.
     */
    public static String mask(String email) {
        if (email == null || email.isBlank()) {
            return "(none)";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        String local = email.substring(0, at);
        String domain = email.substring(at);
        return switch (local.length()) {
            case 1 -> "*" + domain;
            case 2 -> local.charAt(0) + "*" + domain;
            default -> local.charAt(0) + "***" + local.charAt(local.length() - 1) + domain;
        };
    }

    private static String truncate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() <= 300 ? body : body.substring(0, 300) + "…";
    }
}
