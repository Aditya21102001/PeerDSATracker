package com.peerdsa.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fires the two daily sends.
 *
 * <p>Both run in {@code app.mail.zone}, which follows the streak zone by default so the emails and
 * the streak counter never disagree about what day it is.
 *
 * <p>They are not the same email. The morning run goes to every subscriber; the evening one goes
 * only to people who have not practised yet that day, and says so. See {@link DigestRun}.
 *
 * <p>Both draw on one shared daily budget ({@link MailQuotaService}), so the second run cannot
 * overspend the provider allowance that one-time sign-in codes also depend on. If the morning run
 * consumed everything, the evening one sends nothing and says why.
 *
 * <p>Worth knowing on Render's free tier: an idle instance is spun down, and a spun-down instance
 * runs no cron. If the app has had no traffic beforehand, a scheduled run simply does not happen --
 * nothing here can fix that, and the fix is either a paid instance or an external pinger hitting
 * the service shortly before each slot.
 */
@Component
public class DailyDigestScheduler {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestScheduler.class);

    private final DailyDigestService dailyDigestService;

    public DailyDigestScheduler(DailyDigestService dailyDigestService) {
        this.dailyDigestService = dailyDigestService;
    }

    /** The full digest, to everyone. 09:00 by default. */
    @Scheduled(cron = "${app.mail.cron:0 0 9 * * *}", zone = "${app.mail.zone:UTC}")
    public void sendMorningDigest() {
        run(DigestRun.MORNING);
    }

    /** The reminder, to whoever has not practised yet. 18:15 by default. */
    @Scheduled(cron = "${app.mail.evening-cron:0 15 18 * * *}", zone = "${app.mail.zone:UTC}")
    public void sendEveningReminder() {
        run(DigestRun.EVENING);
    }

    private void run(DigestRun which) {
        log.info("Starting the {} digest run", which.label());
        try {
            DailyDigestService.RunReport report = dailyDigestService.sendDailyDigestToAllUsers(which);
            if (report.failed() > 0) {
                log.warn("The {} digest finished with {} failed send(s)", which.label(), report.failed());
            }
        } catch (RuntimeException e) {
            // A scheduled method that throws is logged by Spring and, in some configurations, never
            // scheduled again. Swallow it here so tomorrow's run still happens.
            log.error("The {} digest run failed", which.label(), e);
        }
    }
}
