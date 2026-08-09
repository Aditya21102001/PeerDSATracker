package com.peerdsa.mail;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DailyDigestService {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestService.class);
    private static final DateTimeFormatter HEADER_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final UserRepository users;
    private final DigestMailSender sender;
    private final String appName;
    private final ZoneId zone;

    public DailyDigestService(
            UserRepository users,
            DigestMailSender sender,
            @Value("${spring.application.name:peerdsa-backend}") String appName,
            @Value("${app.streak.zone:UTC}") String zone) {
        this.users = users;
        this.sender = sender;
        this.appName = appName;
        this.zone = ZoneId.of(zone);
    }

    @Transactional(readOnly = true)
    public void sendDailyDigestToAllUsers() {
        LocalDate today = LocalDate.now(zone);
        List<User> recipients = users.findAll();

        for (User user : recipients) {
            if (user.getEmail() == null || user.getEmail().isBlank()) {
                continue;
            }
            String subject = String.format("%s · daily digest · %s", appName, today.format(HEADER_DATE));
            String html = buildHtml(user, today);
            boolean sent = sender.sendDailyDigest(user.getEmail(), subject, html);
            if (sent) {
                log.info("Sent daily digest to {}", user.getEmail());
            }
        }
    }

    private String buildHtml(User user, LocalDate today) {
        int current = Math.max(0, user.getCurrentStreak());
        int longest = Math.max(0, user.getLongestStreak());
        int solved = Math.max(0, user.getTotalSolved());

        return String.format(
                """
                <html>
                  <body style=\"font-family: Arial, sans-serif; color: #111827;\">
                    <div style=\"max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;\">
                      <h2 style=\"margin: 0 0 8px;\">%s · daily digest</h2>
                      <p style=\"margin: 0 0 16px; color: #4b5563;\">%s</p>
                      <p style=\"margin: 0 0 16px;\">Hi %s, your study momentum is looking strong.</p>
                      <ul style=\"padding-left: 20px; line-height: 1.6;\">
                        <li><strong>Current streak:</strong> %d days</li>
                        <li><strong>Longest streak:</strong> %d days</li>
                        <li><strong>Total solved:</strong> %d problems</li>
                      </ul>
                      <p style=\"margin-top: 16px;\">Keep the chain alive today with one focused session and one review pass.</p>
                    </div>
                  </body>
                </html>
                """,
                appName,
                today.format(HEADER_DATE),
                user.getDisplayName() == null || user.getDisplayName().isBlank()
                        ? user.getUsername()
                        : user.getDisplayName(),
                current,
                longest,
                solved);
    }
}
