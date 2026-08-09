package com.peerdsa.config;

import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Where the browser goes when the backend has to hand control back to the SPA -- the OAuth2
 * callback, and password-reset links.
 *
 * <p>Getting this wrong is uniquely nasty. A misconfigured value does not fail: the sign-in
 * succeeds, the backend issues a perfectly good session, and then redirects a production user to
 * {@code http://localhost:4300}, where nothing is listening. It looks like the site ate the login,
 * and nothing in the logs says otherwise.
 *
 * <p>So rather than trust a single variable that is easy to forget, this derives the value:
 *
 * <ol>
 *   <li>{@code APP_FRONTEND_URL} or {@code FRONTEND_BASE_URL}, if either is set. An explicit
 *       answer always wins.
 *   <li>otherwise the first non-loopback entry of {@code app.cors.allowed-origins}. That list has
 *       to name the SPA's real origin for the app to work at all, so on a deployed instance it is
 *       already correct -- and it is the only other place that knows.
 *   <li>otherwise localhost, which is the right answer on a developer's machine and the only
 *       remaining guess anywhere else.
 * </ol>
 *
 * <p>The choice is logged at startup either way, so "why did it send me to localhost" is one line
 * away rather than a debugging session.
 */
@Component
public class FrontendUrl {

    private static final Logger log = LoggerFactory.getLogger(FrontendUrl.class);
    private static final String LOCAL_DEFAULT = "http://localhost:4300";

    private final String value;

    public FrontendUrl(
            @Value("${app.frontend-base-url:}") String configured,
            @Value("${app.cors.allowed-origins:}") List<String> allowedOrigins) {

        if (configured != null && !configured.isBlank()) {
            this.value = trimTrailingSlash(configured.trim());
            log.info("Frontend URL: {} (from APP_FRONTEND_URL / FRONTEND_BASE_URL)", this.value);
            return;
        }

        String derived = allowedOrigins.stream()
                .filter(origin -> origin != null && !origin.isBlank())
                .map(String::trim)
                .filter(origin -> !isLoopback(origin))
                .findFirst()
                .orElse(null);

        if (derived != null) {
            this.value = trimTrailingSlash(derived);
            log.warn(
                    "APP_FRONTEND_URL is not set. Falling back to {}, the first non-local entry of"
                            + " app.cors.allowed-origins. Set APP_FRONTEND_URL explicitly if that is"
                            + " not where the app is served -- OAuth sign-ins redirect there.",
                    this.value);
            return;
        }

        this.value = LOCAL_DEFAULT;
        log.info("Frontend URL: {} (no APP_FRONTEND_URL and no remote CORS origin)", this.value);
    }

    /** Base URL with no trailing slash, so callers can append a path directly. */
    public String get() {
        return value;
    }

    private static boolean isLoopback(String origin) {
        String lower = origin.toLowerCase(Locale.ROOT);
        return lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("[::1]");
    }

    private static String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
