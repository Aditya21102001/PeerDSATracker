package com.peerdsa.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class DigestMailSender {

    private static final Logger log = LoggerFactory.getLogger(DigestMailSender.class);

    private final JavaMailSender mailSender;
    private final DigestMailProperties properties;

    public DigestMailSender(JavaMailSender mailSender, DigestMailProperties properties) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public boolean sendDailyDigest(String to, String subject, String htmlBody) {
        if (!properties.enabled()) {
            log.info("Digest mail disabled; skipping mail to {}", to);
            return false;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(
                    mimeMessage,
                    MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                    StandardCharsets.UTF_8.name());
            helper.setFrom(properties.from());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(mimeMessage);
            return true;
        } catch (MessagingException e) {
            log.warn("Failed to send digest mail to {}", to, e);
            return false;
        } catch (RuntimeException e) {
            log.warn("Failed to send digest mail to {}", to, e);
            return false;
        }
    }
}
