package com.peerdsa.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.chat.OpenRouterClient;
import com.peerdsa.config.OpenRouterProperties;
import com.peerdsa.mail.DigestNarrator.Situation;
import com.peerdsa.mail.DigestRepository.DigestRow;
import java.time.Duration;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The one line a language model contributes to the digest.
 *
 * <p>Two rules are being defended. The model must never be able to stop the mail -- every failure
 * mode falls back to written copy. And it must never be able to put a wrong <em>fact</em> in front
 * of a user, which is why it is only ever asked for encouragement while every number is rendered
 * from the database by {@link DailyDigestService}.
 */
class DigestNarratorTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 10);

    private OpenRouterClient openRouter;
    private DigestNarrator narrator;

    @BeforeEach
    void setUp() {
        openRouter = mock(OpenRouterClient.class);
        narrator = new DigestNarrator(openRouter, properties("a-key"));
    }

    // ------------------------------------------------------------------ nothing may stop the mail

    @Test
    void withNoModelConfiguredItUsesTheWrittenFallbackAndNeverCallsUpstream() {
        DigestNarrator offline = new DigestNarrator(openRouter, properties(""));

        assertThat(offline.lineFor(Situation.STREAK_ALIVE, "Aditya", DigestRun.MORNING))
                .isEqualTo(Situation.STREAK_ALIVE.fallback(DigestRun.MORNING));
        verify(openRouter, never()).streamReply(any(), any());
    }

    @Test
    void anUpstreamFailureFallsBackRatherThanPropagating() {
        when(openRouter.streamReply(any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "rate limited"));

        assertThat(lineForRun(Situation.DORMANT, "Sam")).isEqualTo(Situation.DORMANT.fallback(DigestRun.MORNING));
    }

    @Test
    void aGoodReplyIsUsedVerbatim() {
        when(openRouter.streamReply(any(), any())).thenReturn("Ten minutes today beats an hour on Sunday.");

        assertThat(lineForRun(Situation.STREAK_ALIVE, "Aditya"))
                .isEqualTo("Ten minutes today beats an hour on Sunday.");
    }

    // ------------------------------------------------------- models do not follow instructions

    @Test
    void aPreambleIsRejectedInFavourOfTheFallback() {
        when(openRouter.streamReply(any(), any())).thenReturn("Here is the line: go practise.");

        assertThat(lineForRun(Situation.RECENT_LAPSE, "Sam"))
                .isEqualTo(Situation.RECENT_LAPSE.fallback(DigestRun.MORNING));
    }

    @Test
    void surroundingQuotesAndMarkdownAreStripped() {
        when(openRouter.streamReply(any(), any())).thenReturn("  \"**Back to it today.**\"  ");

        assertThat(lineForRun(Situation.RECENT_LAPSE, "Sam")).isEqualTo("Back to it today.");
    }

    @Test
    void aSecondParagraphOfModelChatterIsDropped() {
        when(openRouter.streamReply(any(), any()))
                .thenReturn("Back to it today.\n\nLet me know if you'd like another version!");

        assertThat(lineForRun(Situation.RECENT_LAPSE, "Sam")).isEqualTo("Back to it today.");
    }

    /** This text is interpolated into an HTML email. Markup from a model is never wanted. */
    @Test
    void aReplyContainingMarkupIsRejected() {
        when(openRouter.streamReply(any(), any())).thenReturn("<b>Go practise</b>");

        assertThat(lineForRun(Situation.STREAK_ALIVE, "Sam")).isEqualTo(Situation.STREAK_ALIVE.fallback(DigestRun.MORNING));
    }

    @Test
    void anOverlongRambleIsRejected() {
        when(openRouter.streamReply(any(), any())).thenReturn("word ".repeat(200));

        assertThat(lineForRun(Situation.STREAK_ALIVE, "Sam")).isEqualTo(Situation.STREAK_ALIVE.fallback(DigestRun.MORNING));
    }

    @Test
    void anEmptyReplyFallsBack() {
        when(openRouter.streamReply(any(), any())).thenReturn("   ");

        assertThat(lineForRun(Situation.NEVER_STARTED, "Sam")).isEqualTo(Situation.NEVER_STARTED.fallback(DigestRun.MORNING));
    }

    // -------------------------------------------------------------------- situation classification

    @Test
    void situationsAreClassifiedByHowLongSinceTheyLastPractised() {
        assertThat(DigestNarrator.situationOf(row(TODAY, 10), TODAY)).isEqualTo(Situation.SOLVED_TODAY);
        assertThat(DigestNarrator.situationOf(row(TODAY.minusDays(1), 10), TODAY))
                .isEqualTo(Situation.STREAK_ALIVE);
        assertThat(DigestNarrator.situationOf(row(TODAY.minusDays(2), 10), TODAY))
                .isEqualTo(Situation.STREAK_AT_RISK);
        assertThat(DigestNarrator.situationOf(row(TODAY.minusDays(5), 10), TODAY))
                .isEqualTo(Situation.RECENT_LAPSE);
        assertThat(DigestNarrator.situationOf(row(TODAY.minusDays(60), 10), TODAY))
                .isEqualTo(Situation.DORMANT);
    }

    /** Never active and never solved is a new sign-up; never active but solved is a returning one. */
    @Test
    void aBrandNewSignUpIsDistinguishedFromALapsedOne() {
        assertThat(DigestNarrator.situationOf(row(null, 0), TODAY)).isEqualTo(Situation.NEVER_STARTED);
        assertThat(DigestNarrator.situationOf(row(null, 30), TODAY)).isEqualTo(Situation.DORMANT);
    }

    /** Every situation has real written copy, so a fallback is never a placeholder. */
    @Test
    void everySituationHasAUsableFallbackForBothRuns() {
        for (Situation situation : Situation.values()) {
            for (DigestRun run : DigestRun.values()) {
                assertThat(situation.fallback(run))
                        .as("%s / %s", situation, run)
                        .isNotBlank()
                        .doesNotContain("TODO")
                        .hasSizeLessThan(200);
            }
        }
    }

    /**
     * The evening copy has to acknowledge that the day is nearly gone. "Pick one today and the
     * second gets easier" reads as a morning email that arrived eight hours late.
     */
    @Test
    void theEveningFallbackDiffersFromTheMorningOne() {
        for (Situation situation : Situation.values()) {
            assertThat(situation.fallback(DigestRun.EVENING))
                    .as("%s", situation)
                    .isNotEqualTo(situation.fallback(DigestRun.MORNING));
        }
    }

    // ---------------------------------------------------------------------------- helpers

    /** Morning by default; the evening variant has its own test below. */
    private String lineForRun(DigestNarrator.Situation s, String name) {
        return narrator.lineFor(s, name, DigestRun.MORNING);
    }

    private static OpenRouterProperties properties(String apiKey) {
        return new OpenRouterProperties(
                apiKey,
                "https://openrouter.ai/api/v1",
                "some/model:free",
                "system",
                20,
                Duration.ofSeconds(10),
                Duration.ofSeconds(30),
                "referer",
                "title");
    }

    private static DigestRow row(LocalDate lastActive, int totalSolved) {
        return new DigestRow() {
            public Long getUserId() {
                return 1L;
            }

            public String getEmail() {
                return "a@b.com";
            }

            public String getUsername() {
                return "aditya";
            }

            public String getDisplayName() {
                return "Aditya";
            }

            public int getXp() {
                return 100;
            }

            public int getTotalSolved() {
                return totalSolved;
            }

            public int getCurrentStreak() {
                return 0;
            }

            public int getLongestStreak() {
                return 0;
            }

            public LocalDate getLastActiveDate() {
                return lastActive;
            }

            public long getRank() {
                return 1;
            }

            public int getSolvedThisWeek() {
                return 0;
            }

            public int getRevisionsDue() {
                return 0;
            }
        };
    }
}
