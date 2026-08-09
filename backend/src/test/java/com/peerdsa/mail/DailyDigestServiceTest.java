package com.peerdsa.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.config.FrontendUrl;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.mail.DigestRepository.DigestRow;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;

/**
 * The morning digest.
 *
 * <p>The behaviours worth pinning are the ones whose failure is silent. A run that mails nobody
 * because the transport is unconfigured, a run that mails half its audience because of a quota, and
 * a language model that quietly puts a wrong number in front of a user all look, from the outside,
 * exactly like a run that worked.
 */
class DailyDigestServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 10); // a Monday

    private DigestRepository digests;
    private BrevoMailClient mail;
    private DigestNarrator narrator;

    @BeforeEach
    void setUp() {
        digests = mock(DigestRepository.class);
        mail = mock(BrevoMailClient.class);
        narrator = mock(DigestNarrator.class);

        when(mail.isConfigured()).thenReturn(true);
        when(mail.send(any())).thenReturn(true);
        when(narrator.isAvailable()).thenReturn(true);
        when(narrator.lineFor(any(), anyString())).thenReturn("Keep going, you're closer than you think.");
        when(digests.subscribers(any())).thenReturn(List.of());
    }

    // ------------------------------------------------------------------ it must not send quietly

    @Test
    void aDisabledDigestSendsNothing() {
        when(digests.subscribers(any())).thenReturn(List.of(row(1L, "a@b.com", 5, 3)));

        DailyDigestService.RunReport report = service(false, 200).sendDailyDigestFor(TODAY);

        assertThat(report.sent()).isZero();
        verify(mail, never()).send(any());
    }

    /**
     * Enabled but with no working transport is the dangerous state: a scheduled job that appears to
     * run every morning and delivers nothing. It must not silently no-op.
     */
    @Test
    void anEnabledDigestWithNoTransportSendsNothingRatherThanFailingHalfway() {
        when(mail.isConfigured()).thenReturn(false);
        when(digests.subscribers(any())).thenReturn(List.of(row(1L, "a@b.com", 5, 3)));

        DailyDigestService.RunReport report = service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(report.sent()).isZero();
        verify(mail, never()).send(any());
    }

    // ------------------------------------------------------------------------- the daily cap

    /**
     * Brevo's free allowance is shared with sign-in codes, so a large audience will not all fit.
     * What matters is that the run REPORTS the shortfall rather than truncating in silence -- a
     * job that mails 200 of 500 people looks identical to one that mailed everybody.
     */
    @Test
    void aRunOverTheCapMailsTheCapAndReportsExactlyHowManyItSkipped() {
        List<DigestRow> many = IntStream.rangeClosed(1, 250)
                .mapToObj(i -> row(i, "user" + i + "@example.com", 1, 1))
                .toList();
        when(digests.subscribers(any())).thenReturn(many);

        DailyDigestService.RunReport report = service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(report.sent()).isEqualTo(200);
        assertThat(report.skippedByCap()).isEqualTo(50);
    }

    @Test
    void aRunUnderTheCapSkipsNobody() {
        when(digests.subscribers(any())).thenReturn(List.of(row(1L, "a@b.com", 5, 3)));

        DailyDigestService.RunReport report = service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(report.sent()).isEqualTo(1);
        assertThat(report.skippedByCap()).isZero();
    }

    @Test
    void aFailedSendIsCountedRatherThanAbortingTheRun() {
        when(digests.subscribers(any())).thenReturn(
                List.of(row(1L, "a@b.com", 5, 3), row(2L, "c@d.com", 5, 3)));
        when(mail.send(any())).thenReturn(false).thenReturn(true);

        DailyDigestService.RunReport report = service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(report.sent()).isEqualTo(1);
        assertThat(report.failed()).isEqualTo(1);
    }

    // --------------------------------------------------------------------- what is in the mail

    @Test
    void everyMessageCarriesTheRealFiguresAndAnUnsubscribeLink() {
        when(digests.subscribers(any())).thenReturn(List.of(row(42L, "a@b.com", 7, 3)));

        service(true, 200).sendDailyDigestFor(TODAY);

        BrevoMailClient.Message message = captureMessage();
        assertThat(message.to()).isEqualTo("a@b.com");
        // The numbers are rendered here, from the row -- never asked of the model.
        assertThat(message.htmlBody()).contains("7 days").contains("rank #3");
        assertThat(message.htmlBody()).contains("/api/mail/unsubscribe?u=42&t=");
        assertThat(message.textBody()).contains("Unsubscribe:");
    }

    /** The model writes the sentence; if it says nothing useful the mail still goes out. */
    @Test
    void theNarratorsLineAppearsInTheBody() {
        when(narrator.lineFor(any(), anyString())).thenReturn("One problem today is enough.");
        when(digests.subscribers(any())).thenReturn(List.of(row(1L, "a@b.com", 5, 3)));

        service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(captureMessage().htmlBody()).contains("One problem today is enough.");
    }

    /**
     * A display name is user-controlled and the narrator's line comes from a language model.
     * Neither is trusted markup, even though this only ever renders in the owner's own inbox.
     */
    @Test
    void userControlledTextIsEscapedBeforeItReachesTheHtml() {
        when(narrator.lineFor(any(), anyString())).thenReturn("tricky & \"quoted\"");
        DigestRow evil = row(1L, "a@b.com", 5, 3, "<script>alert(1)</script>", LocalDate.of(2026, 8, 9));
        when(digests.subscribers(any())).thenReturn(List.of(evil));

        service(true, 200).sendDailyDigestFor(TODAY);

        String html = captureMessage().htmlBody();
        assertThat(html).doesNotContain("<script>");
        assertThat(html).contains("&lt;script&gt;");
        assertThat(html).contains("tricky &amp; &quot;quoted&quot;");
    }

    /** A single fixed subject every morning is what trains people to stop opening it. */
    @Test
    void theSubjectReflectsTheSituation() {
        when(digests.subscribers(any())).thenReturn(List.of(
                row(1L, "risk@b.com", 4, 3, "Ana", TODAY.minusDays(2))));

        service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(captureMessage().subject()).isEqualTo("Your 4-day streak ends today");
    }

    @Test
    void somebodyWhoHasNeverPractisedGetsAStartingSubjectNotAStreakOne() {
        when(digests.subscribers(any())).thenReturn(List.of(neverPractised()));

        service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(captureMessage().subject()).isEqualTo("Your first problem is waiting");
    }

    /** Revision guidance only appears when there is actually a queue to clear. */
    @Test
    void theRevisionBlockIsAbsentWhenNothingIsDue() {
        when(digests.subscribers(any())).thenReturn(List.of(row(1L, "a@b.com", 5, 3)));

        service(true, 200).sendDailyDigestFor(TODAY);

        assertThat(captureMessage().htmlBody()).doesNotContain("Due for revision");
    }

    // ---------------------------------------------------------------------------- helpers

    private BrevoMailClient.Message captureMessage() {
        ArgumentCaptor<BrevoMailClient.Message> sent =
                ArgumentCaptor.forClass(BrevoMailClient.Message.class);
        verify(mail).send(sent.capture());
        return sent.getValue();
    }

    private DailyDigestService service(boolean enabled, int cap) {
        JwtProperties jwt = new JwtProperties(
                "test-secret-that-is-definitely-long-enough-for-hs256",
                Duration.ofMinutes(15),
                Duration.ofDays(30),
                Duration.ofSeconds(30),
                Duration.ofDays(90),
                Duration.ofMinutes(15));

        return new DailyDigestService(
                digests,
                mail,
                narrator,
                new UnsubscribeTokens(jwt),
                new FrontendUrl("https://app.example.com", List.of()),
                new DigestMailProperties(enabled, "0 0 9 * * *", "UTC", cap, "https://api.example.com"));
    }

    private static DigestRow row(long id, String email, int streak, long rank) {
        return row(id, email, streak, rank, "Aditya", TODAY.minusDays(1));
    }

    /** Signed up, never solved anything, never had an active day. */
    private static DigestRow neverPractised() {
        DigestRow base = row(1L, "new@b.com", 0, 9, "Sam", null);
        return new DigestRow() {
            public Long getUserId() { return base.getUserId(); }
            public String getEmail() { return base.getEmail(); }
            public String getUsername() { return base.getUsername(); }
            public String getDisplayName() { return base.getDisplayName(); }
            public int getXp() { return 0; }
            public int getTotalSolved() { return 0; }
            public int getCurrentStreak() { return 0; }
            public int getLongestStreak() { return 0; }
            public LocalDate getLastActiveDate() { return null; }
            public long getRank() { return base.getRank(); }
            public int getSolvedThisWeek() { return 0; }
            public int getRevisionsDue() { return 0; }
        };
    }

    /** A hand-built projection: the interface is what the native query returns at runtime. */
    private static DigestRow row(
            long id, String email, int streak, long rank, String displayName, LocalDate lastActive) {
        return new DigestRow() {
            public Long getUserId() {
                return id;
            }

            public String getEmail() {
                return email;
            }

            public String getUsername() {
                return "user" + id;
            }

            public String getDisplayName() {
                return displayName;
            }

            public int getXp() {
                return 1200;
            }

            public int getTotalSolved() {
                return 48;
            }

            public int getCurrentStreak() {
                return streak;
            }

            public int getLongestStreak() {
                return 12;
            }

            public LocalDate getLastActiveDate() {
                return lastActive;
            }

            public long getRank() {
                return rank;
            }

            public int getSolvedThisWeek() {
                return 6;
            }

            public int getRevisionsDue() {
                return 0;
            }
        };
    }
}
