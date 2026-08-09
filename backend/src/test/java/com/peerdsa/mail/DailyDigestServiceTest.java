package com.peerdsa.mail;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class DailyDigestServiceTest {

    /**
     * Note {@code eq("first@example.com")} rather than the bare string. Mockito's rule is
     * all-or-nothing: the moment one argument is a matcher, every argument must be, or the raw
     * value is consumed as if it were a matcher and the verification blows up with
     * InvalidUseOfMatchersException before it ever checks anything.
     */
    @Test
    void sendsDigestToEveryUserWithEmail() {
        UserRepository users = mock(UserRepository.class);
        DigestMailSender sender = mock(DigestMailSender.class);
        DailyDigestService service = new DailyDigestService(users, sender, "peerdsa", "UTC");

        User first = new User();
        first.setEmail("first@example.com");
        first.setUsername("first");
        first.setDisplayName("First");
        first.setCurrentStreak(3);
        first.setLongestStreak(7);
        first.addSolved(5);

        // No display name, so the digest falls back to the username.
        User second = new User();
        second.setEmail("second@example.com");
        second.setUsername("second");
        second.setCurrentStreak(1);
        second.setLongestStreak(1);
        second.addSolved(2);

        when(users.findAll()).thenReturn(List.of(first, second));
        when(sender.sendDailyDigest(anyString(), anyString(), anyString())).thenReturn(true);

        service.sendDailyDigestToAllUsers();

        verify(sender).sendDailyDigest(eq("first@example.com"), contains("daily digest"), contains("First"));
        verify(sender).sendDailyDigest(eq("second@example.com"), contains("daily digest"), contains("second"));
    }

    /** A user with no address is skipped rather than passed to the mailer as null. */
    @Test
    void skipsUsersWithNoEmailAddress() {
        UserRepository users = mock(UserRepository.class);
        DigestMailSender sender = mock(DigestMailSender.class);
        DailyDigestService service = new DailyDigestService(users, sender, "peerdsa", "UTC");

        User blank = new User();
        blank.setEmail("   ");
        blank.setUsername("blank");

        when(users.findAll()).thenReturn(List.of(blank));

        service.sendDailyDigestToAllUsers();

        verify(sender, never()).sendDailyDigest(anyString(), anyString(), anyString());
    }
}
