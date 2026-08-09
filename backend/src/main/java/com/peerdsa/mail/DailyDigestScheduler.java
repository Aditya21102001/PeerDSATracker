package com.peerdsa.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DailyDigestScheduler {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestScheduler.class);

    private final DailyDigestService dailyDigestService;

    public DailyDigestScheduler(DailyDigestService dailyDigestService) {
        this.dailyDigestService = dailyDigestService;
    }

    @Scheduled(cron = "${app.mail.cron:0 0 8 * * *}", zone = "${app.mail.zone:UTC}")
    public void sendDailyDigest() {
        log.info("Starting daily digest run");
        dailyDigestService.sendDailyDigestToAllUsers();
    }
}
