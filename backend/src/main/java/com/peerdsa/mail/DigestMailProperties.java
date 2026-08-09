package com.peerdsa.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.mail.*}: the morning practice digest.
 *
 * <p>Note what is absent -- host, port, username, password, STARTTLS. The digest used to go over
 * SMTP, which does not work where this application runs: Render blocks the outbound SMTP ports, so
 * that version passed every local test against a local relay and then silently delivered nothing.
 * Sending now goes through {@link BrevoMailClient} over HTTP, and the credentials live with the
 * rest of the mail configuration under {@code app.otp.email.*} -- one account, one API key, one
 * verified sender for the whole application.
 *
 * @param enabled master switch. Off means the scheduled run does nothing at all.
 * @param cron the morning run, in {@link #zone}. Defaults to 09:00 daily.
 * @param eveningCron the evening reminder, which goes only to people who have not practised that
 *     day. Defaults to 18:15. Sending the identical email twice would teach people to ignore
 *     both; this one says something the morning run could not yet know.
 * @param zone which clock "9am" is on, and which calendar decides what "today" and "this week"
 *     mean. Follows the streak zone by default, so a digest and a streak never disagree about
 *     what day it is.
 * @param dailyCap the most messages that may be sent in a DAY, across both runs and persisted in
 *     {@code mail_quota} so an instance restart cannot reset it. Brevo's free tier allows 300 a day and
 *     sign-in codes come out of the same allowance, so this deliberately leaves headroom: a
 *     morning digest run must never consume the quota somebody needs to sign in that afternoon.
 *     Over the cap, the run mails the most recently active subscribers and logs how many it
 *     skipped.
 * @param publicBaseUrl this backend's own public origin, used to build unsubscribe links. Must be
 *     reachable from a mail client, which is why it is the backend's URL and not the SPA's -- the
 *     link has to work even when the frontend is down.
 */
@ConfigurationProperties(prefix = "app.mail")
public record DigestMailProperties(
        boolean enabled,
        String cron,
        String eveningCron,
        String zone,
        int dailyCap,
        String publicBaseUrl) {

    /** Where unsubscribe links point when nothing else says. Only ever right on a developer box. */
    private static final String LOCAL_DEFAULT = "http://localhost:8080";

    public DigestMailProperties {
        // Defaulted here rather than in the YAML. The obvious
        // ${MAIL_PUBLIC_BASE_URL:${RENDER_EXTERNAL_URL:http://localhost:8080}} resolves correctly
        // through Environment.getProperty but binds to null through Binder -- a nested placeholder
        // whose own default contains a colon. That difference is invisible until an unsubscribe
        // link goes out reading "null/api/mail/unsubscribe", so the fallback lives in code where
        // it is plain and tested.
        publicBaseUrl = publicBaseUrl == null || publicBaseUrl.isBlank()
                ? LOCAL_DEFAULT
                : publicBaseUrl.trim();
        if (publicBaseUrl.endsWith("/")) {
            publicBaseUrl = publicBaseUrl.substring(0, publicBaseUrl.length() - 1);
        }
    }
}
