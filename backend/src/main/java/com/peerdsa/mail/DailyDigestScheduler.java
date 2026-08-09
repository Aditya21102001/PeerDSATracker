package com.peerdsa.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fires the morning digest.
 *
 * <p>09:00 in {@code app.mail.zone}, which follows the streak zone by default so the email and the
 * streak counter never disagree about what day it is.
 *
 * <p>Worth knowing on Render's free tier: an instance that has been idle is spun down, and a
 * spun-down instance runs no cron. If the app has had no traffic overnight the 9am run simply does
 * not happen -- nothing here can fix that, and the fix is either a paid instance or an external
 * scheduler pinging the service shortly beforehand.
 */
@Component
public class DailyDigestScheduler {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestScheduler.class);

    private final DailyDigestService dailyDigestService;

    public DailyDigestScheduler(DailyDigestService dailyDigestService) {
        this.dailyDigestService = dailyDigestService;
    }

    @Scheduled(cron = "${app.mail.cron:0 0 9 * * *}", zone = "${app.mail.zone:UTC}")
    public void sendDailyDigest() {
        log.info("Starting the daily digest run");
        try {
            DailyDigestService.RunReport report = dailyDigestService.sendDailyDigestToAllUsers();
            if (report.failed() > 0) {
                log.warn("Daily digest finished with {} failed send(s)", report.failed());
            }
        } catch (RuntimeException e) {
            // A scheduled method that throws is logged by Spring and then never runs again in some
            // configurations. Swallow it here so tomorrow's run still happens.
            log.error("Daily digest run failed", e);
        }
    }
}
