package com.peerdsa.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.otp.*}: one-time email codes for sign-in and password recovery.
 *
 * @param demoMode returns the code in the API response instead of sending it, so the flow is
 *     usable without a mail provider. MUST be false in production -- it hands a working
 *     credential to whoever asked for it. It is a deliberate, separate branch in
 *     {@link com.peerdsa.auth.otp.OtpService}, never a fallback when delivery fails.
 * @param ttl how long a code stays valid. Short by design.
 * @param length digits per code.
 * @param maxPerHour requests per destination address per hour, counted whether or not the
 *     address has an account.
 */
@ConfigurationProperties(prefix = "app.otp")
public record OtpProperties(boolean demoMode, Duration ttl, int length, int maxPerHour, Email email) {

    /**
     * Delivery settings. HTTP API only: managed hosts (Render, Fly, Heroku) block outbound SMTP
     * ports, so an SMTP mailer works locally and then fails silently in production.
     *
     * @param provider {@code brevo}, or {@code none} to disable delivery outright.
     * @param apiKey provider credential, sent as the {@code api-key} header.
     * @param from sender address. Brevo rejects a sender it has not verified.
     * @param baseUrl the send endpoint; overridable so a test can point it at a local stub.
     */
    public record Email(String provider, String apiKey, String from, String fromName, String baseUrl) {

        public boolean configured() {
            return notBlank(apiKey) && notBlank(from);
        }

        private static boolean notBlank(String value) {
            return value != null && !value.isBlank();
        }
    }
}
