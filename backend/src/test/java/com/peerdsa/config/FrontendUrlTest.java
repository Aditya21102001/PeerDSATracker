package com.peerdsa.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Where a completed OAuth2 sign-in sends the browser.
 *
 * <p>Worth pinning because the failure is invisible: a wrong value still signs the user in, still
 * issues a valid session, and then redirects them to a host that is not serving anything. There is
 * no error anywhere -- it simply looks like the site swallowed the login.
 */
class FrontendUrlTest {

    private static final List<String> DEPLOYED_ORIGINS =
            List.of("https://peer-dsa-tracker-iota.vercel.app", "http://localhost:4300");

    @Test
    void anExplicitValueAlwaysWins() {
        assertThat(url("https://app.example.com", DEPLOYED_ORIGINS)).isEqualTo("https://app.example.com");
    }

    @Test
    void aTrailingSlashIsTrimmedSoCallersCanAppendAPath() {
        assertThat(url("https://app.example.com/", List.of())).isEqualTo("https://app.example.com");
    }

    /**
     * The case this class exists for. Nobody sets APP_FRONTEND_URL on the first deploy, and the
     * old default sent every production Google sign-in to localhost. The CORS list already has to
     * name the real origin for the SPA to work at all, so it is a reliable second source.
     */
    @Test
    void anUnsetValueFallsBackToTheFirstRemoteCorsOrigin() {
        assertThat(url("", DEPLOYED_ORIGINS)).isEqualTo("https://peer-dsa-tracker-iota.vercel.app");
        assertThat(url(null, DEPLOYED_ORIGINS)).isEqualTo("https://peer-dsa-tracker-iota.vercel.app");
    }

    /** Loopback entries are skipped when looking for the deployed origin, in any spelling. */
    @Test
    void loopbackOriginsAreNotMistakenForTheDeployedOne() {
        assertThat(url("", List.of("http://localhost:4300", "http://127.0.0.1:4200", "https://real.example.com")))
                .isEqualTo("https://real.example.com");
    }

    /** On a developer's machine there is no remote origin, and localhost is the right answer. */
    @Test
    void purelyLocalConfigurationStillResolvesToLocalhost() {
        assertThat(url("", List.of("http://localhost:4300", "http://localhost:4200")))
                .isEqualTo("http://localhost:4300");
        assertThat(url("", List.of())).isEqualTo("http://localhost:4300");
    }

    private static String url(String configured, List<String> allowedOrigins) {
        return new FrontendUrl(configured, allowedOrigins).get();
    }
}
