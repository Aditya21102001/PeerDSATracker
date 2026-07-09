package com.peerdsa.analytics;

import com.peerdsa.user.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

/**
 * HTTP surface for the analytics features. Each endpoint delegates to
 * {@link AnalyticsService} and, per the "analytics is optional" rule, translates a failed
 * call into a 503 so a dead analytics service never surfaces as an app-side 500.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsController.class);

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/weakness")
    public AnalyticsDtos.WeaknessResponse weakness(@AuthenticationPrincipal User user) {
        try {
            return analytics.weakness(user.getId());
        } catch (RestClientException e) {
            throw translate(e);
        }
    }

    @GetMapping("/revise-next")
    public AnalyticsDtos.ReviseNextResponse reviseNext(@AuthenticationPrincipal User user) {
        try {
            return analytics.reviseNext(user.getId());
        } catch (RestClientException e) {
            throw translate(e);
        }
    }

    /**
     * The analytics service failing is never a 500: the app itself is fine. But "asleep" and
     * "misconfigured" are different failures and must not share a status code or a silence.
     *
     * <ul>
     *   <li><b>503</b> — nothing answered: connect refused, or the read timed out. On Render's
     *       free tier this is the ordinary cold start, and it is retryable. The client retries
     *       503 with backoff; anything else it gives up on immediately.
     *   <li><b>502</b> — analytics answered, with an error. A wrong {@code INTERNAL_TOKEN} (401)
     *       or a wrong {@code ANALYTICS_BASE_URL} (404) lands here. Retrying cannot fix a
     *       misconfiguration, so the client must not spin on it.
     * </ul>
     *
     * <p>Both are logged. Previously the cause was attached to the exception and dropped on the
     * floor, so a misconfigured deployment reported "service unavailable" and left no trace.
     */
    private static ResponseStatusException translate(RestClientException e) {
        if (e instanceof RestClientResponseException response) {
            // A 4xx is us calling it wrong; a 5xx is it failing on its own. Sending an operator
            // to check credentials after an upstream crash wastes the one clue they have.
            String hint = response.getStatusCode().is4xxClientError()
                    ? "Check ANALYTICS_BASE_URL and INTERNAL_TOKEN."
                    : "Analytics failed internally; check its own logs.";
            log.error(
                    "Analytics returned {} for an internal call. {} Body: {}",
                    response.getStatusCode(),
                    hint,
                    response.getResponseBodyAsString(),
                    e);
            return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Analytics service error", e);
        }
        if (e instanceof ResourceAccessException) {
            // Expected on the free tier: the service is spinning up. Not worth an ERROR.
            log.warn("Analytics unreachable ({}); it is probably cold-starting.", e.getMessage());
        } else {
            log.error("Unexpected failure calling analytics", e);
        }
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Analytics service unavailable", e);
    }
}
