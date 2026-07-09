package com.peerdsa.revision;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The interval ladder, rung by rung. It is duplicated in the analytics service as
 * {@code LADDER} in {@code app/services/revision.py}, which has no way to see this class --
 * so if these numbers change, that file must change with them.
 */
class RevisionScheduleTest {

    @Test
    void unscheduledProblemStartsAtTheFirstRung() {
        assertThat(RevisionSchedule.nextInterval(null)).isEqualTo(1);
        assertThat(RevisionSchedule.firstInterval()).isEqualTo(1);
    }

    @Test
    void eachSuccessfulReviewClimbsOneRung() {
        assertThat(RevisionSchedule.nextInterval(1)).isEqualTo(3);
        assertThat(RevisionSchedule.nextInterval(3)).isEqualTo(7);
        assertThat(RevisionSchedule.nextInterval(7)).isEqualTo(16);
        assertThat(RevisionSchedule.nextInterval(16)).isEqualTo(35);
        assertThat(RevisionSchedule.nextInterval(35)).isEqualTo(90);
    }

    @Test
    void theTopRungSaturatesSoReviewsNeverStop() {
        assertThat(RevisionSchedule.nextInterval(90)).isEqualTo(90);
        assertThat(RevisionSchedule.nextInterval(365)).isEqualTo(90);
    }

    @Test
    void anIntervalOffTheLadderClimbsToTheNextRungAbove() {
        // A custom interval the user picked by hand, e.g. 5 days.
        assertThat(RevisionSchedule.nextInterval(5)).isEqualTo(7);
        assertThat(RevisionSchedule.nextInterval(2)).isEqualTo(3);
    }
}
