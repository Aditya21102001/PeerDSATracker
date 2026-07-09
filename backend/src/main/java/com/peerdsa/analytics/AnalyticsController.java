package com.peerdsa.analytics;

import com.peerdsa.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * HTTP surface for the analytics features. Each endpoint delegates to
 * {@link AnalyticsService} and, per the "analytics is optional" rule, translates a failed
 * call into a 503 so a dead analytics service never surfaces as an app-side 500.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/weakness")
    public AnalyticsDtos.WeaknessResponse weakness(@AuthenticationPrincipal User user) {
        try {
            return analytics.weakness(user.getId());
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    @GetMapping("/revise-next")
    public AnalyticsDtos.ReviseNextResponse reviseNext(@AuthenticationPrincipal User user) {
        try {
            return analytics.reviseNext(user.getId());
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    /** The analytics service being down is a 503, not a 500: the app itself is fine. */
    private static ResponseStatusException unavailable(RestClientException e) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Analytics service unavailable", e);
    }
}
