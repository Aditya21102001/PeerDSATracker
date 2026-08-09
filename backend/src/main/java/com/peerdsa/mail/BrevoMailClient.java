package com.peerdsa.mail;

import com.peerdsa.config.OtpProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The one place this application sends email: Brevo's transactional HTTP API.
 *
 * <p><b>HTTP, not SMTP, and that is not a preference.</b> Render -- like Fly and Heroku -- blocks
 * outbound connections on the SMTP ports. A {@code JavaMailSender} implementation therefore passes
 * every local test against a local relay and then silently sends nothing in production: no
 * exception, no bounce, just mail that never exists. This class exists so there is exactly one
 * transport and it is the one that works where the app actually runs.
 *
 * <p>{@code POST https://api.brevo.com/v3/smtp/email}, credential in the {@code api-key} header,
 * and success is <b>201</b> -- not 200. Treating any 2xx as sent would also accept a 202 from a
 * misconfigured proxy that never queued the message.
 *
 * <p>Two rules hold for every caller: message bodies are never logged (one of them carries
 * one-time sign-in codes), and addresses are masked to {@code a***a@example.com}. A log stream is
 * read by more people than a mailbox is.
 *
 * <p>Every failure returns {@code false} rather than throwing, so callers can treat "not
 * delivered" as an ordinary boolean. {@link com.peerdsa.auth.otp.OtpService} depends on that: what
 * it does next -- destroy the code it was about to promise and answer 503 -- is the only safe
 * response, and an exception escaping here would tempt a caller into returning the code instead.
 */
@Component
public class BrevoMailClient {

    private static final Logger log = LoggerFactory.getLogger(BrevoMailClient.class);

    private static final String BREVO = "brevo";
    private static final String DISABLED = "none";

    private final OtpProperties.Email settings;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    /**
     * Credentials come from {@code app.otp.email.*}: one Brevo account, one API key, one verified
     * sender for the whole application. Note that its free tier's 300 messages/day is shared
     * between sign-in codes and digests -- see {@code app.mail.daily-cap}, which leaves headroom
     * so a morning digest run can never starve someone of the code they need to sign in.
     */
    public BrevoMailClient(OtpProperties properties, ObjectMapper mapper) {
        this.settings = properties.email();
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** A message this application is able to send, addressed to one recipient. */
    public record Message(String to, String subject, String textBody, String htmlBody) {}

    /** True only if Brevo accepted the message. False means nothing was sent. */
    public boolean send(Message message) {
        String provider = settings.provider() == null ? DISABLED : settings.provider().trim().toLowerCase();

        if (DISABLED.equals(provider)) {
            log.warn("Email delivery is disabled (app.otp.email.provider=none); nothing sent to {}",
                    mask(message.to()));
            return false;
        }
        if (!BREVO.equals(provider)) {
            log.error("Unknown email provider '{}'; nothing sent to {}", provider, mask(message.to()));
            return false;
        }
        if (!settings.configured()) {
            log.error(
                    "Email is not configured (need OTP_EMAIL_API_KEY and a verified OTP_EMAIL_FROM);"
                            + " nothing sent to {}",
                    mask(message.to()));
            return false;
        }
        return post(message);
    }

    private boolean post(Message message) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(settings.baseUrl()))
                    .header("api-key", settings.apiKey())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.ofString(payload(message)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 201) {
                log.warn(
                        "Brevo rejected a message for {}: HTTP {} {}",
                        mask(message.to()),
                        response.statusCode(),
                        truncate(response.body()));
                return false;
            }
            return true;

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted sending a message to {}", mask(message.to()));
            return false;
        } catch (Exception e) {
            // Deliberately broad: a DNS failure, a TLS failure and a serialization failure are all
            // the same thing to the caller, and none of them may leak the body.
            log.warn("Could not send a message to {}: {}", mask(message.to()), e.toString());
            return false;
        }
    }

    private String payload(Message message) {
        ObjectNode body = mapper.createObjectNode();

        ObjectNode sender = body.putObject("sender");
        sender.put("email", settings.from());
        if (settings.fromName() != null && !settings.fromName().isBlank()) {
            sender.put("name", settings.fromName());
        }

        ArrayNode to = body.putArray("to");
        to.addObject().put("email", message.to());

        body.put("subject", message.subject());
        if (message.textBody() != null) {
            body.put("textContent", message.textBody());
        }
        body.put("htmlContent", message.htmlBody());

        return body.toString();
    }

    /** Whether a send would even be attempted. Lets a scheduled job skip its work entirely. */
    public boolean isConfigured() {
        return BREVO.equals(settings.provider() == null ? "" : settings.provider().trim().toLowerCase())
                && settings.configured();
    }

    /**
     * {@code aditya@example.com} becomes {@code a***a@example.com} -- enough to tell two addresses
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

    /** Recipients of one message, for logging a run's outcome without listing addresses. */
    static String summarise(List<String> recipients) {
        return recipients.size() + " recipient(s)";
    }

    private static String truncate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() <= 300 ? body : body.substring(0, 300) + "…";
    }
}
