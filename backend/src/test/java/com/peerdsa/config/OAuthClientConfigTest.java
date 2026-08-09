package com.peerdsa.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * Boots just the OAuth2 client wiring -- no database, no web server -- to prove three things that
 * are otherwise only true by reasoning, and whose failure mode is "the application does not start".
 *
 * <ol>
 *   <li>With no credentials, the context still comes up. Nothing about the Google feature may make
 *       a deployment without it fail.
 *   <li>With credentials, exactly one Google registration exists, pointing at the redirect URI that
 *       has to be registered in the Google console.
 *   <li>Boot's own OAuth2 client auto-configuration coexists with the hand-rolled repository. This
 *       is the one worth checking: {@code spring.security.oauth2.client.registration.google.*} is
 *       what people set from tutorials, and if the auto-configuration were to build a second
 *       {@code ClientRegistrationRepository} from those properties -- or throw on a blank client
 *       id -- startup would break in production and nowhere else.
 * </ol>
 */
class OAuthClientConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OAuth2ClientAutoConfiguration.class))
            .withUserConfiguration(OAuthClientConfig.class);

    @Test
    void aDeploymentWithNoGoogleCredentialsStartsAndHasNoRegistrations() {
        runner.withBean(OAuthProperties.class, () -> properties("", ""))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(ClientRegistrationRepository.class);
                    // Present but empty: other client beans wire off it, while the login filters
                    // are never installed (see SecurityConfig).
                    assertThat(context.getBean(ClientRegistrationRepository.class)
                                    .findByRegistrationId("google"))
                            .isNull();
                });
    }

    @Test
    void credentialsProduceOneGoogleRegistrationWithTheExpectedRedirectUri() {
        runner.withBean(OAuthProperties.class, () -> properties("an-id", "a-secret"))
                .run(context -> {
                    assertThat(context).hasNotFailed();

                    ClientRegistration google = context.getBean(ClientRegistrationRepository.class)
                            .findByRegistrationId("google");

                    assertThat(google).isNotNull();
                    assertThat(google.getClientId()).isEqualTo("an-id");
                    // {baseUrl}/login/oauth2/code/google once resolved -- this is the value that
                    // must appear verbatim in the Google console's Authorized redirect URIs.
                    assertThat(google.getRedirectUri()).isEqualTo("{baseUrl}/{action}/oauth2/code/{registrationId}");
                    assertThat(google.getScopes()).contains("email");

                    assertThat(context.getBean(ClientRegistrationRepository.class))
                            .isInstanceOf(InMemoryClientRegistrationRepository.class);
                });
    }

    /**
     * The scenario that prompted this test: the Spring-standard properties are set (as every
     * tutorial instructs) while this application supplies its own repository. Boot must back off
     * rather than build a competing one or reject a blank id.
     */
    @Test
    void springStandardRegistrationPropertiesDoNotBreakStartup() {
        runner.withBean(OAuthProperties.class, () -> properties("an-id", "a-secret"))
                .withPropertyValues(
                        "spring.security.oauth2.client.registration.google.client-id=an-id",
                        "spring.security.oauth2.client.registration.google.client-secret=a-secret")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    // Exactly one, and it is ours.
                    assertThat(context).hasSingleBean(ClientRegistrationRepository.class);
                    assertThat(context.getBean(ClientRegistrationRepository.class)
                                    .findByRegistrationId("google")
                                    .getClientId())
                            .isEqualTo("an-id");
                });
    }

    /** And the same properties left blank -- the state that used to abort startup outright. */
    @Test
    void blankSpringStandardRegistrationPropertiesDoNotBreakStartup() {
        runner.withBean(OAuthProperties.class, () -> properties("", ""))
                .withPropertyValues(
                        "spring.security.oauth2.client.registration.google.client-id=",
                        "spring.security.oauth2.client.registration.google.client-secret=")
                .run(context -> assertThat(context).hasNotFailed());
    }

    private static OAuthProperties properties(String clientId, String clientSecret) {
        return new OAuthProperties(true, "USER", new OAuthProperties.Google(clientId, clientSecret));
    }
}
