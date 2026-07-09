package com.peerdsa.streak;

import com.peerdsa.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * A broken streak leaves no trace at write time -- an idle day writes nothing at all,
 * so `users.current_streak` stays stale until something corrects it. Reads go through
 * {@link StreakService#effectiveCurrentStreak}, but the stored column also backs the
 * leaderboard, so it gets reconciled once a day.
 */
@Component
public class StreakScheduler {

    private static final Logger log = LoggerFactory.getLogger(StreakScheduler.class);

    private final UserRepository users;

    public StreakScheduler(UserRepository users) {
        this.users = users;
    }

    @Scheduled(cron = "${app.streak.reset-cron:0 15 0 * * *}", zone = "${app.streak.zone:UTC}")
    @Transactional
    public void resetBrokenStreaks() {
        int reset = users.resetStaleStreaks();
        if (reset > 0) {
            log.info("Reset {} broken streak(s)", reset);
        }
    }
}
