package com.peerdsa.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.peerdsa.config.FrontendUrl;
import org.springframework.stereotype.Component;

/**
 * How the reset link reaches the user.
 *
 * <p>There is no mail server wired up, so the link is written to the application log.
 * That is fine for local development and honest about what it is -- but it means a
 * production deployment MUST replace this with a real mailer, or reset links will sit
 * in the logs where operators can read them.
 */
@Component
public class ResetLinkDeliverer {

    private static final Logger log = LoggerFactory.getLogger(ResetLinkDeliverer.class);

    private final FrontendUrl frontendUrl;

    public ResetLinkDeliverer(FrontendUrl frontendUrl) {
        this.frontendUrl = frontendUrl;
    }

    public void deliver(String email, String rawToken) {
        log.warn(
                "PASSWORD RESET for {} -> {}/reset?token={}  (no mailer configured; see ResetLinkDeliverer)",
                email,
                frontendUrl.get(),
                rawToken);
    }
}
