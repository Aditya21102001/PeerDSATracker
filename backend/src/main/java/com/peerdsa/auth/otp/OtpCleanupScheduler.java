package com.peerdsa.auth.otp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drops OTP rows old enough that they no longer bound a rate limit. Hourly rather than on every
 * request: a DELETE on the hot path would make issuing a code cost a table write nobody is waiting
 * on, and the table is tiny either way.
 */
@Component
public class OtpCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(OtpCleanupScheduler.class);

    private final OtpService otpService;

    public OtpCleanupScheduler(OtpService otpService) {
        this.otpService = otpService;
    }

    @Scheduled(cron = "0 20 * * * *")
    public void purge() {
        int removed = otpService.deleteRowsPastTheRateWindow();
        if (removed > 0) {
            log.info("Purged {} expired one-time code row(s)", removed);
        }
    }
}
