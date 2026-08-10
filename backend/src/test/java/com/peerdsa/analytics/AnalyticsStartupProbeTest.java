package com.peerdsa.analytics;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.net.ConnectException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

/**
 * The probe's only job is to report; its hard requirement is that it never does anything else.
 *
 * <p>Analytics is optional -- the app works without it and the dashboard degrades to an "insights
 * unavailable" panel. A probe that propagated a failure would take the whole site down over a
 * feature the user can live without, and it runs during startup, where an escaping exception is
 * most expensive. So every branch below asserts the same thing: it swallows.
 */
class AnalyticsStartupProbeTest {

    private final AnalyticsClient client = mock(AnalyticsClient.class);
    private final AnalyticsStartupProbe probe = new AnalyticsStartupProbe(client);

    @Test
    void aSuccessfulPingIsTheHappyPath() {
        doNothing().when(client).ping();

        assertThatCode(probe::probe).doesNotThrowAnyException();
        verify(client).ping();
    }

    /** A wrong INTERNAL_TOKEN. Worth an ERROR in the deploy log -- and nothing more. */
    @Test
    void aRejectedTokenIsReportedButNeverThrown() {
        doThrow(HttpClientErrorException.create(HttpStatus.UNAUTHORIZED, "Unauthorized", null, null, null))
                .when(client)
                .ping();

        assertThatCode(probe::probe).doesNotThrowAnyException();
    }

    /**
     * The normal state of a free-tier service nobody has called yet. Render's edge answers with a
     * gateway status while the instance wakes; treating that as a misconfiguration would put a
     * false alarm in the log of every single deploy.
     */
    @Test
    void aColdInstanceIsNotAnError() {
        for (HttpStatus gateway : new HttpStatus[] {
            HttpStatus.BAD_GATEWAY, HttpStatus.SERVICE_UNAVAILABLE, HttpStatus.GATEWAY_TIMEOUT
        }) {
            doThrow(HttpServerErrorException.create(gateway, gateway.getReasonPhrase(), null, null, null))
                    .when(client)
                    .ping();

            assertThatCode(probe::probe).doesNotThrowAnyException();
        }
    }

    @Test
    void anUnreachableServiceIsReportedButNeverThrown() {
        doThrow(new ResourceAccessException("connect", new ConnectException("refused")))
                .when(client)
                .ping();

        assertThatCode(probe::probe).doesNotThrowAnyException();
    }
}
