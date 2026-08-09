package com.peerdsa.mail;

import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The day's remaining email budget, shared by everything that sends.
 *
 * <p>Exists because the digest now runs twice daily. A per-run cap of 200 across two runs is 400
 * against a provider allowance of 300 -- and the overspend is not merely a truncated digest, since
 * one-time sign-in codes draw on the same allowance. Blowing the budget on marketing mail means
 * people cannot sign in, which is a far worse outcome than a few users missing an evening nudge.
 *
 * <p>Counted in the database rather than in memory: Render's free tier restarts instances freely,
 * and an in-memory counter resets to zero on restart -- exactly when it would let the same budget
 * be spent a second time.
 */
@Service
public class MailQuotaService {

    private static final Logger log = LoggerFactory.getLogger(MailQuotaService.class);

    private final MailQuotaRepository quotas;
    private final DigestMailProperties properties;

    public MailQuotaService(MailQuotaRepository quotas, DigestMailProperties properties) {
        this.quotas = quotas;
        this.properties = properties;
    }

    /** How many more messages may go out today across every sender. Never negative. */
    @Transactional(readOnly = true)
    public int remainingToday(LocalDate day) {
        int alreadySent = quotas.findById(day).map(MailQuota::getSent).orElse(0);
        return Math.max(0, properties.dailyCap() - alreadySent);
    }

    /**
     * Records messages that have actually been sent.
     *
     * <p>{@code REQUIRES_NEW} so the count survives whatever happens to the caller's transaction.
     * The digest run is {@code readOnly}, and a failure part-way through must not roll back the
     * record of mail that has already left -- those messages cannot be un-sent, and forgetting them
     * would let the next run spend the budget again.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(LocalDate day, int count) {
        if (count <= 0) {
            return;
        }
        int alreadySent = quotas.findById(day).map(MailQuota::getSent).orElse(0);
        quotas.save(new MailQuota(day, alreadySent + count));
        log.info("Mail quota for {}: {} of {} used", day, alreadySent + count, properties.dailyCap());
    }
}
