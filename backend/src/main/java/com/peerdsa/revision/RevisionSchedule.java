package com.peerdsa.revision;

/**
 * A fixed spaced-repetition ladder. Reviewing successfully moves one rung up;
 * forgetting drops back to the bottom.
 *
 * <p>Deliberately not SM-2: without a self-reported recall quality per review there is
 * nothing to feed an ease factor, and a fixed ladder is what most DSA trackers use.
 */
public final class RevisionSchedule {

    static final int[] INTERVALS_DAYS = {1, 3, 7, 16, 35, 90};

    private RevisionSchedule() {}

    public static int firstInterval() {
        return INTERVALS_DAYS[0];
    }

    /**
     * The smallest rung strictly above the current interval, saturating at the top so
     * reviews never stop entirely. A hand-picked interval that is not on the ladder
     * (say 5 days) climbs to the next rung above it, not two rungs up.
     */
    public static int nextInterval(Integer currentIntervalDays) {
        if (currentIntervalDays == null) {
            return firstInterval();
        }
        for (int interval : INTERVALS_DAYS) {
            if (interval > currentIntervalDays) {
                return interval;
            }
        }
        return INTERVALS_DAYS[INTERVALS_DAYS.length - 1];
    }
}
