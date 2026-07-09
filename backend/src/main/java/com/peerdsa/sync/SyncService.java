package com.peerdsa.sync;

import com.peerdsa.analytics.AnalyticsClient;
import com.peerdsa.sync.SyncRun.TriggerSource;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
// Spring Boot 4 ships Jackson 3, whose ObjectMapper lives in tools.jackson.databind
// rather than com.fasterxml.jackson.databind.
import tools.jackson.databind.ObjectMapper;

/**
 * Spring orchestrates; FastAPI computes. This is the only writer.
 *
 * <p>External stats are cached on {@code platform_accounts.external_stats} and are
 * deliberately NOT merged into {@code daily_activity}. That table is UNIQUE on
 * (user_id, activity_date) and its {@code xp_earned} is tied to the write-time XP
 * invariant on {@code users}; folding LeetCode's submission calendar into it would
 * inflate streaks and XP the user never earned on this sheet. Showing the external
 * numbers side by side is honest; merging them is not.
 */
@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private final PlatformAccountRepository accounts;
    private final SyncRunRepository runs;
    private final AnalyticsClient analytics;
    private final ObjectMapper objectMapper;

    public SyncService(
            PlatformAccountRepository accounts,
            SyncRunRepository runs,
            AnalyticsClient analytics,
            ObjectMapper objectMapper) {
        this.accounts = accounts;
        this.runs = runs;
        this.analytics = analytics;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public PlatformAccount linkAccount(Long userId, Platform platform, String handle) {
        if (handle == null || handle.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Handle is required");
        }
        PlatformAccount account = accounts.findByUserIdAndPlatform(userId, platform)
                .orElseGet(() -> new PlatformAccount(userId, platform, handle.trim()));

        account.setHandle(handle.trim());
        return accounts.save(account);
    }

    @Transactional(readOnly = true)
    public List<PlatformAccount> accountsFor(Long userId) {
        return accounts.findByUserId(userId);
    }

    @Transactional(readOnly = true)
    public List<SyncRun> recentRuns(Long userId) {
        return runs.findTop20ByUserIdOrderByStartedAtDesc(userId);
    }

    @Transactional
    public void unlink(Long userId, Platform platform) {
        accounts.findByUserIdAndPlatform(userId, platform).ifPresent(accounts::delete);
    }

    /** Syncs every linked account for one user. One account failing never fails the others. */
    @Transactional
    public List<SyncRun> syncUser(Long userId, TriggerSource source) {
        return accounts.findByUserId(userId).stream().map(a -> syncAccount(a, source)).toList();
    }

    private SyncRun syncAccount(PlatformAccount account, TriggerSource source) {
        SyncRun run = runs.save(new SyncRun(account.getUserId(), account.getPlatform(), source));

        try {
            Object stats = switch (account.getPlatform()) {
                case LEETCODE -> analytics.fetchLeetCode(account.getHandle());
                case CODEFORCES -> analytics.fetchCodeforces(account.getHandle());
            };

            Map<String, Object> asMap = objectMapper.convertValue(stats, Map.class);
            boolean found = Boolean.TRUE.equals(asMap.get("found"));

            if (!found) {
                // A missing handle is a failed run, not an exception. The cached stats stay.
                run.fail(String.valueOf(asMap.getOrDefault("error", "handle not found")));
            } else {
                account.recordSync(asMap, Instant.now());
                accounts.save(account);
                run.succeed(1);
            }
        } catch (RestClientException | IllegalArgumentException e) {
            log.warn("sync failed for {} account {}: {}", account.getPlatform(), account.getHandle(), e.toString());
            run.fail(e.getMessage());
        }

        return runs.save(run);
    }
}
