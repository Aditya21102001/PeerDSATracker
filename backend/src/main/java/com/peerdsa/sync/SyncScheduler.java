package com.peerdsa.sync;

import com.peerdsa.sync.SyncRun.TriggerSource;
import java.util.LinkedHashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodic background sync of every linked account. On Render's free tier {@code @Scheduled}
 * jobs do not fire while the backend is asleep, so in practice sync is driven manually from
 * the /profile button; this fires only while the instance happens to be awake.
 */
@Component
public class SyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(SyncScheduler.class);

    private final PlatformAccountRepository accounts;
    private final SyncService sync;
    private final long throttleMillis;

    public SyncScheduler(
            PlatformAccountRepository accounts,
            SyncService sync,
            @Value("${app.sync.throttle-millis:2000}") long throttleMillis) {
        this.accounts = accounts;
        this.sync = sync;
        this.throttleMillis = throttleMillis;
    }

    /**
     * Staggered per user: Codeforces asks for roughly one request every two seconds, and
     * LeetCode's unofficial endpoint is soft rate-limited with no documented budget.
     */
    @Scheduled(cron = "${app.sync.cron:0 0 */6 * * *}")
    public void syncAllAccounts() {
        Set<Long> userIds = new LinkedHashSet<>();
        accounts.findAll().forEach(a -> userIds.add(a.getUserId()));

        if (userIds.isEmpty()) {
            return;
        }
        log.info("Scheduled sync starting for {} user(s)", userIds.size());

        for (Long userId : userIds) {
            try {
                sync.syncUser(userId, TriggerSource.SCHEDULED);
                Thread.sleep(throttleMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("Scheduled sync interrupted");
                return;
            } catch (RuntimeException e) {
                // syncUser already records a FAILED run per account; keep going.
                log.warn("Scheduled sync failed for user {}: {}", userId, e.toString());
            }
        }
    }
}
