package com.peerdsa.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Calls the analytics service's cheapest authenticated route once at boot and logs, in one line,
 * whether this deployment is wired to it correctly.
 *
 * <p><b>Why.</b> The two services are paired by two environment variables -- {@code
 * ANALYTICS_BASE_URL} and a shared {@code INTERNAL_TOKEN} -- and nothing verified that pairing.
 * When it was wrong the only symptom was a 502 on the dashboard's insight panel, hours or days
 * later, for a user who could do nothing about it. The information needed to fix it existed only
 * in a log line nobody had a reason to go and read. This moves that answer to the moment of
 * deployment, where the person who set the variables is still watching.
 *
 * <p><b>Why it cannot fail the boot.</b> Analytics is optional by design: the app is fully usable
 * without it, and the dashboard already degrades to an "insights unavailable" state. A probe that
 * threw would turn a degraded panel into a dead site. It also must not <em>block</em> the boot --
 * Render allows the health check five seconds, while a cold analytics instance can take up to a
 * minute to answer -- so the call happens on its own daemon thread and the result is logged
 * whenever it arrives.
 */
@Component
public class AnalyticsStartupProbe {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsStartupProbe.class);

    private final AnalyticsClient client;

    public AnalyticsStartupProbe(AnalyticsClient client) {
        this.client = client;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void probeOnStartup() {
        // A plain daemon thread rather than a virtual one: this module targets Java 17. Daemon so
        // a probe still waiting on a cold instance cannot hold up a shutdown.
        Thread thread = new Thread(this::probe, "analytics-probe");
        thread.setDaemon(true);
        thread.start();
    }

    /** Package-private so a test can run it synchronously rather than racing a thread. */
    void probe() {
        try {
            client.ping();
            log.info("Analytics service reachable and the shared INTERNAL_TOKEN matches.");
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            // A gateway status here means the instance is merely asleep, which is the normal state
            // of a free-tier service nobody has called yet -- not a misconfiguration.
            if (status == 502 || status == 503 || status == 504) {
                log.info("Analytics service is cold ({}); it will wake on the first real call.", status);
            } else {
                log.error("Analytics probe failed with {}. {}", status, AnalyticsController.hintFor(status));
            }
        } catch (ResourceAccessException e) {
            log.warn(
                    "Analytics service unreachable at startup ({}). Expected if it is spun down; "
                            + "check ANALYTICS_BASE_URL if the insight panel stays down.",
                    e.getMessage());
        } catch (RestClientException e) {
            log.warn("Analytics probe could not complete", e);
        }
    }
}
