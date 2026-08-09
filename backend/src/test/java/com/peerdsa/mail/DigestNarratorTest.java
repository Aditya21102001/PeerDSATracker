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

        assertThat(offline.lineFor(Situation.STREAK_ALIVE, "Aditya"))
                .isEqualTo(Situation.STREAK_ALIVE.fallback());
        verify(openRouter, never()).streamReply(any(), any());
    }

    @Test
    void anUpstreamFailureFallsBackRatherThanPropagating() {
        when(openRouter.streamReply(any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "rate limited"));

        assertThat(narrator.lineFor(Situation.DORMANT, "Sam")).isEqualTo(Situation.DORMANT.fallback());
    }

    @Test
    void aGoodReplyIsUsedVerbatim() {
        when(openRouter.streamReply(any(), any())).thenReturn("Ten minutes today beats an hour on Sunday.");

        assertThat(narrator.lineFor(Situation.STREAK_ALIVE, "Aditya"))
                .isEqualTo("Ten minutes today beats an hour on Sunday.");
    }

    // ------------------------------------------------------- models do not follow instructions

    @Test
    void aPreambleIsRejectedInFavourOfTheFallback() {
        when(openRouter.streamReply(any(), any())).thenReturn("Here is the line: go practise.");

        assertThat(narrator.lineFor(Situation.RECENT_LAPSE, "Sam"))
                .isEqualTo(Situation.RECENT_LAPSE.fallback());
    }

    @Test
    void surroundingQuotesAndMarkdownAreStripped() {
        when(openRouter.streamReply(any(), any())).thenReturn("  \"**Back to it today.**\"  ");

        assertThat(narrator.lineFor(Situation.RECENT_LAPSE, "Sam")).isEqualTo("Back to it today.");
    }

    @Test
    void aSecondParagraphOfModelChatterIsDropped() {
        when(openRouter.streamReply(any(), any()))
                .thenReturn("Back to it today.\n\nLet me know if you'd like another version!");

        assertThat(narrator.lineFor(Situation.RECENT_LAPSE, "Sam")).isEqualTo("Back to it today.");
    }

    /** This text is interpolated into an HTML email. Markup from a model is never wanted. */
    @Test
    void aReplyContainingMarkupIsRejected() {
        when(openRouter.streamReply(any(), any())).thenReturn("<b>Go practise</b>");

        assertThat(narrator.lineFor(Situation.STREAK_ALIVE, "Sam")).isEqualTo(Situation.STREAK_ALIVE.fallback());
    }

    @Test
    void anOverlongRambleIsRejected() {
        when(openRouter.streamReply(any(), any())).thenReturn("word ".repeat(200));

        assertThat(narrator.lineFor(Situation.STREAK_ALIVE, "Sam")).isEqualTo(Situation.STREAK_ALIVE.fallback());
    }

    @Test
    void anEmptyReplyFallsBack() {
        when(openRouter.streamReply(any(), any())).thenReturn("   ");

        assertThat(narrator.lineFor(Situation.NEVER_STARTED, "Sam")).isEqualTo(Situation.NEVER_STARTED.fallback());
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
    void everySituationHasAUsableFallback() {
        for (Situation situation : Situation.values()) {
            assertThat(situation.fallback()).isNotBlank().doesNotContain("TODO").hasSizeLessThan(200);
        }
    }

    // ---------------------------------------------------------------------------- helpers

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
