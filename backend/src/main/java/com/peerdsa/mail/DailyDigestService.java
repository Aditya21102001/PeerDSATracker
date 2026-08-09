package com.peerdsa.mail;

import com.peerdsa.config.FrontendUrl;
import com.peerdsa.mail.DigestRepository.DigestRow;
import com.peerdsa.mail.DigestNarrator.Situation;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The morning practice digest: one personalised email per subscriber, with their own figures and a
 * line written for where they actually are.
 *
 * <p>Three things are load-bearing here.
 *
 * <p><b>Every number comes from the database.</b> {@link DigestNarrator} supplies the encouraging
 * sentence and nothing else -- it is forbidden from quoting statistics precisely because a model
 * congratulating somebody on a streak they do not have is worse than no email. Facts are rendered
 * here, from one query.
 *
 * <p><b>Nothing about a language model can stop the mail.</b> Rate limit, cold start, missing API
 * key: each falls back to a written line and the digest goes out regardless.
 *
 * <p><b>The daily cap is announced, not silent.</b> Brevo's free tier allows 300 messages a day and
 * sign-in codes come out of the same allowance, so a large enough audience will not all fit. When
 * the run truncates it says exactly how many people it skipped -- a job that quietly mails half its
 * users looks identical to one that mailed all of them.
 */
@Service
public class DailyDigestService {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestService.class);
    private static final DateTimeFormatter HEADER_DATE = DateTimeFormatter.ofPattern("EEEE d MMMM");

    private final DigestRepository digests;
    private final BrevoMailClient mail;
    private final DigestNarrator narrator;
    private final UnsubscribeTokens unsubscribeTokens;
    private final FrontendUrl frontendUrl;
    private final DigestMailProperties properties;

    public DailyDigestService(
            DigestRepository digests,
            BrevoMailClient mail,
            DigestNarrator narrator,
            UnsubscribeTokens unsubscribeTokens,
            FrontendUrl frontendUrl,
            DigestMailProperties properties) {
        this.digests = digests;
        this.mail = mail;
        this.narrator = narrator;
        this.unsubscribeTokens = unsubscribeTokens;
        this.frontendUrl = frontendUrl;
        this.properties = properties;
    }

    /** What one run did. Returned so the scheduler -- and tests -- can assert on it. */
    public record RunReport(int sent, int failed, int skippedByCap) {}

    /** The scheduled entry point: today, on the configured clock. */
    @Transactional(readOnly = true)
    public RunReport sendDailyDigestToAllUsers() {
        return sendDailyDigestFor(LocalDate.now(ZoneId.of(properties.zone())));
    }

    /**
     * The run itself, for an explicit date.
     *
     * <p>The date is a parameter rather than read from the clock inside, so that "your streak ends
     * today" and "you practised yesterday" are testable statements rather than assertions that
     * quietly change meaning depending on what day the suite happens to run.
     */
    @Transactional(readOnly = true)
    public RunReport sendDailyDigestFor(LocalDate today) {
        if (!properties.enabled()) {
            log.info("Daily digest is disabled (MAIL_ENABLED=false); nothing sent.");
            return new RunReport(0, 0, 0);
        }
        if (!mail.isConfigured()) {
            // Loud, because the alternative is a scheduled job that appears to run every morning
            // and delivers nothing at all.
            log.error(
                    "Daily digest is enabled but email is not configured (OTP_EMAIL_API_KEY and a"
                            + " verified OTP_EMAIL_FROM). No digest was sent.");
            return new RunReport(0, 0, 0);
        }

        // Logged every run so the two settings that are wrong-but-silent can be checked against a
        // real deploy: the zone decides what "9am" and "today" actually mean, and the unsubscribe
        // base is what every footer link points at. A wrong zone mails people in the middle of
        // their afternoon; a wrong base produces links that 404.
        log.info(
                "Daily digest: treating {} as today in zone {}; unsubscribe links point at {}",
                today, properties.zone(), properties.publicBaseUrl());

        List<DigestRow> subscribers = digests.subscribers(today);

        int cap = properties.dailyCap();
        int skippedByCap = Math.max(0, subscribers.size() - cap);
        List<DigestRow> recipients = skippedByCap == 0 ? subscribers : subscribers.subList(0, cap);

        if (skippedByCap > 0) {
            log.warn(
                    "Daily digest capped at {} of {} subscribers; {} skipped. The provider's daily"
                            + " allowance is shared with sign-in codes -- raise MAIL_DAILY_CAP only"
                            + " alongside the plan that pays for it.",
                    cap, subscribers.size(), skippedByCap);
        }
        if (!narrator.isAvailable()) {
            log.info("No language model configured; digests will use their written fallback lines.");
        }

        int sent = 0;
        int failed = 0;
        for (DigestRow row : recipients) {
            if (send(row, today)) {
                sent++;
            } else {
                failed++;
            }
        }

        log.info(
                "Daily digest run for {}: {} sent, {} failed, {} skipped by the cap.",
                today, sent, failed, skippedByCap);
        return new RunReport(sent, failed, skippedByCap);
    }

    private boolean send(DigestRow row, LocalDate today) {
        Situation situation = DigestNarrator.situationOf(row, today);
        String line = narrator.lineFor(situation, firstName(row));

        return mail.send(new BrevoMailClient.Message(
                row.getEmail(), subject(row, situation, today), textBody(row, line, today), htmlBody(row, line, today)));
    }

    /**
     * The subject carries the one fact most likely to make somebody open it, which differs by
     * situation. A single fixed subject line every morning is what trains people to ignore it.
     */
    private String subject(DigestRow row, Situation situation, LocalDate today) {
        return switch (situation) {
            case STREAK_AT_RISK -> "Your %d-day streak ends today".formatted(row.getCurrentStreak());
            case STREAK_ALIVE -> row.getCurrentStreak() > 1
                    ? "Day %d - keep the streak alive".formatted(row.getCurrentStreak() + 1)
                    : "Your practice for %s".formatted(today.format(HEADER_DATE));
            case SOLVED_TODAY -> "You're already done today";
            case NEVER_STARTED -> "Your first problem is waiting";
            case RECENT_LAPSE -> "Pick it back up today";
            case DORMANT -> "Your progress is still here";
        };
    }

    private String textBody(DigestRow row, String line, LocalDate today) {
        return """
                %s

                %s

                Where you are:
                  Current streak   %d days (best: %d)
                  Solved           %d problems
                  This week        %d
                  XP               %d  -  rank #%d
                %s
                Practise: %s/sheet

                ---
                You're getting this because you're signed up to PeerDSATracker.
                Unsubscribe: %s"""
                .formatted(
                        today.format(HEADER_DATE),
                        line,
                        row.getCurrentStreak(),
                        row.getLongestStreak(),
                        row.getTotalSolved(),
                        row.getSolvedThisWeek(),
                        row.getXp(),
                        row.getRank(),
                        row.getRevisionsDue() > 0
                                ? "  Due for revision %d%n".formatted(row.getRevisionsDue())
                                : "",
                        frontendUrl.get(),
                        unsubscribeUrl(row));
    }

    private String htmlBody(DigestRow row, String line, LocalDate today) {
        // Inline styles and a table-free layout: every email client strips <style> blocks, and
        // several ignore flexbox entirely.
        return """
                <div style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
                            background:#f4f5f7;padding:24px">
                  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;
                              padding:28px;border:1px solid #e5e7eb">

                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px">%s</p>
                    <h1 style="margin:0 0 16px;font-size:20px;color:#111827">Morning, %s</h1>

                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151">%s</p>

                    <div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin-bottom:22px">
                      %s
                      %s
                      %s
                      %s
                    </div>
                    %s
                    <a href="%s/sheet"
                       style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;
                              padding:12px 22px;border-radius:8px;font-weight:600">Practise now</a>

                    <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;
                              color:#9ca3af;font-size:12px;line-height:1.6">
                      You're getting this because you signed up to PeerDSATracker.
                      <a href="%s" style="color:#9ca3af">Unsubscribe</a>.
                    </p>
                  </div>
                </div>
                """
                .formatted(
                        escape(today.format(HEADER_DATE)),
                        escape(firstName(row)),
                        escape(line),
                        stat("Current streak", "%d days".formatted(row.getCurrentStreak()),
                                "best %d".formatted(row.getLongestStreak())),
                        stat("Solved", "%d problems".formatted(row.getTotalSolved()),
                                "%d this week".formatted(row.getSolvedThisWeek())),
                        stat("XP", String.valueOf(row.getXp()), "rank #%d".formatted(row.getRank())),
                        row.getRevisionsDue() > 0
                                ? stat("Due for revision", "%d problems".formatted(row.getRevisionsDue()),
                                        "spaced repetition")
                                : "",
                        row.getRevisionsDue() > 0
                                ? """
                                  <p style="margin:0 0 18px;font-size:14px;color:#6b7280">
                                    Clearing your revision queue first is usually worth more than a new problem.
                                  </p>"""
                                : "",
                        frontendUrl.get(),
                        unsubscribeUrl(row));
    }

    private static String stat(String label, String value, String note) {
        return """
               <div style="display:block;margin:0 0 10px">
                 <span style="color:#6b7280;font-size:13px">%s</span><br>
                 <span style="color:#111827;font-size:17px;font-weight:600">%s</span>
                 <span style="color:#9ca3af;font-size:13px"> &middot; %s</span>
               </div>
               """
                .formatted(escape(label), escape(value), escape(note));
    }

    /**
     * Points at the backend, not the SPA: the link has to work when the frontend is down, and for
     * somebody who will never open the app again. See {@link MailPreferencesController}.
     */
    private String unsubscribeUrl(DigestRow row) {
        return "%s/api/mail/unsubscribe?u=%d&t=%s"
                .formatted(properties.publicBaseUrl(), row.getUserId(), unsubscribeTokens.tokenFor(row.getUserId()));
    }

    /** A display name, else the username; first word only, so "Hi Aditya" not "Hi Aditya Yadav". */
    private static String firstName(DigestRow row) {
        String name = row.getDisplayName() == null || row.getDisplayName().isBlank()
                ? row.getUsername()
                : row.getDisplayName();
        if (name == null || name.isBlank()) {
            return "there";
        }
        return name.trim().split("\\s+")[0];
    }

    /**
     * Escapes text interpolated into the HTML body. Display names are user-controlled and the
     * narrator's line comes from a language model -- neither is trusted markup, even though this
     * only ever renders in the account owner's own inbox.
     */
    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
