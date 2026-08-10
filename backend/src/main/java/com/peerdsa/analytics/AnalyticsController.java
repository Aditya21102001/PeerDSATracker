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
     * The analytics service failing is never a 500: the app itself is fine. But "not up yet" and
     * "answered wrongly" are different failures, and only one of them is worth retrying.
     *
     * <ul>
     *   <li><b>503</b> — the service is not up. Either nothing answered (connect refused, read
     *       timed out) or Render's edge answered <em>for</em> it while it cold-started. Measured:
     *       a spun-down free-tier service returns a gateway error in ~1.1s, so this is the
     *       ordinary cold-start path, not a timeout. Retryable, and the client retries 503.
     *   <li><b>502</b> — analytics itself answered, with an error. A wrong {@code INTERNAL_TOKEN}
     *       (401), a wrong {@code ANALYTICS_BASE_URL} (404), or a crash (500). Retrying cannot fix
     *       a misconfiguration, so the client must not spin on it.
     * </ul>
     *
     * <p>The distinction is the status, not the exception type: a proxy standing in for a dead
     * origin emits 502/503/504, and FastAPI never does. Mapping those to 502 would tell the
     * client "give up" on the one failure that always resolves itself within a minute.
     *
     * <p>Both are logged. Previously the cause was attached to the exception and dropped on the
     * floor, so a misconfigured deployment reported "service unavailable" and left no trace.
     */
    private static ResponseStatusException translate(RestClientException e) {
        if (e instanceof RestClientResponseException response) {
            if (isGatewayError(response.getStatusCode().value())) {
                log.warn(
                        "Analytics gateway returned {}; the service is probably cold-starting.",
                        response.getStatusCode());
                return unavailable(e);
            }
            String hint = hintFor(response.getStatusCode().value());
            log.error(
                    "Analytics returned {} for an internal call. {} Body: {}",
                    response.getStatusCode(),
                    hint,
                    response.getResponseBodyAsString(),
                    e);
            // The status is repeated in the message on purpose. "Analytics service error" is true
            // of a wrong token, a wrong URL, and an upstream crash alike, and the three have
            // nothing in common to do about them -- so the one person who can fix it had to go
            // read Render's logs to learn which it was. Naming the status and the variable turns
            // a support round-trip into something visible in the browser's network tab.
            return new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Analytics service error (upstream " + response.getStatusCode().value()
                            + "). " + hint, e);
        }
        if (e instanceof ResourceAccessException) {
            // Expected on the free tier: the service is spinning up. Not worth an ERROR.
            log.warn("Analytics unreachable ({}); it is probably cold-starting.", e.getMessage());
        } else {
            log.error("Unexpected failure calling analytics", e);
        }
        return unavailable(e);
    }

    /**
     * What to actually do about an upstream status.
     *
     * <p>The previous split -- 4xx means "check credentials", 5xx means "check its logs" -- was
     * too coarse to be useful: a 401 and a 404 are both 4xx but have different single-line fixes,
     * and 422 (which is what a drifted request contract produces) is neither. Each status below is
     * a failure this pair of services can genuinely produce, matched to the one thing that fixes it.
     */
    static String hintFor(int status) {
        return switch (status) {
            // The two services carry different INTERNAL_TOKEN values. Easy to drift, because the
            // live services were created by hand rather than from render.yaml's shared env group.
            case 401, 403 -> "Analytics rejected our token: INTERNAL_TOKEN differs between the two services.";
            // Right host, wrong path -- ANALYTICS_BASE_URL usually has a trailing path or is
            // pointing at something that is not the analytics service.
            case 404 -> "Analytics has no such route: check ANALYTICS_BASE_URL.";
            // FastAPI's own validation error. The request contract drifted: the Java records in
            // AnalyticsDtos no longer match the Pydantic models.
            case 422 -> "Analytics rejected the request body: the DTO contract has drifted.";
            default -> status >= 500
                    ? "Analytics failed internally; check its own logs."
                    : "Unexpected client error calling analytics.";
        };
    }

    /** Statuses a proxy emits when the origin is unreachable. FastAPI never returns these. */
    private static boolean isGatewayError(int status) {
        return status == 502 || status == 503 || status == 504;
    }

    private static ResponseStatusException unavailable(RestClientException e) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Analytics service unavailable", e);
    }
}
