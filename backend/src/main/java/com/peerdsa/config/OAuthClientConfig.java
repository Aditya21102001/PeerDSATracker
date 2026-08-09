package com.peerdsa.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * Supplies the Google client registration, defined here rather than under
 * {@code spring.security.oauth2.client.registration.*} for one reason: Spring Boot's
 * auto-configuration builds a {@link ClientRegistration} from whatever it finds, and
 * {@code ClientRegistration.Builder} rejects a blank client id by throwing. Declaring the
 * registration in YAML with an unset env var therefore stops the whole application from starting
 * on any machine without Google credentials -- which is every developer's, and CI.
 *
 * <p>So the credentials live under {@code app.oauth.google.*} and this decides. Unconfigured
 * yields an empty repository rather than no bean at all, because the client auto-configuration
 * wires other beans off it; {@code SecurityConfig} separately declines to install the OAuth2 login
 * filters, so those endpoints simply do not exist.
 */
@Configuration
public class OAuthClientConfig {

    @Bean
    public ClientRegistrationRepository clientRegistrationRepository(OAuthProperties properties) {
        if (!properties.google().configured()) {
            return registrationId -> null;
        }
        return new InMemoryClientRegistrationRepository(google(properties.google()));
    }

    /**
     * {@link CommonOAuth2Provider#GOOGLE} carries the endpoints, the {@code openid profile email}
     * scopes and the {@code {baseUrl}/login/oauth2/code/{registrationId}} redirect template, so the
     * only thing left is the credential pair.
     *
     * <p>{@code {baseUrl}} is derived from the incoming request, which is why
     * {@code server.forward-headers-strategy} matters in production: behind Render's TLS
     * terminator an unaware application resolves it to {@code http://}, and Google refuses a
     * redirect URI that does not match the console entry exactly.
     */
    private static ClientRegistration google(OAuthProperties.Google google) {
        return CommonOAuth2Provider.GOOGLE
                .getBuilder("google")
                .clientId(google.clientId())
                .clientSecret(google.clientSecret())
                .build();
    }
}
