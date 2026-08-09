package com.peerdsa.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

/**
 * Binds the real {@code application.yml} to the real property records.
 *
 * <p>Worth its own test because misconfiguration here fails <em>silently</em>. A property renamed
 * on one side of the boundary does not error -- it binds to the record's default, so
 * {@code demoMode} quietly becomes false, or {@code sessionMax} becomes null and the absolute cap
 * stops capping. Nothing in a normal test run notices.
 *
 * <p>No Spring context is started: that would need the Neon database. {@link Binder} over a
 * {@link StandardEnvironment} resolves {@code ${VAR:default}} placeholders exactly as the
 * application does, which is the part actually being checked.
 */
class ApplicationYamlBindingTest {

    private final StandardEnvironment environment = loadApplicationYaml();

    @Test
    void jwtPropertiesBindWithTheAbsoluteCapAndVerifiedWindowPresent() {
        JwtProperties jwt = bind("app.jwt", JwtProperties.class);

        assertThat(jwt.accessTtl()).isEqualTo(Duration.ofMinutes(15));
        assertThat(jwt.refreshTtl()).isEqualTo(Duration.ofDays(30));
        assertThat(jwt.refreshGrace()).isEqualTo(Duration.ofSeconds(30));

        // The two that stop a session renewing itself forever, and stop a code-verified session
        // rewriting a password forever. Null here means the guard is inert.
        assertThat(jwt.sessionMax()).isNotNull().isEqualTo(Duration.ofDays(90));
        assertThat(jwt.verifiedWindow()).isNotNull().isEqualTo(Duration.ofMinutes(15));

        // The cap has to outlast a single refresh, or every session dies at its first rotation.
        assertThat(jwt.sessionMax()).isGreaterThan(jwt.refreshTtl());
        // And the vbc window has to be short. This is the one that guards a shared machine.
        assertThat(jwt.verifiedWindow()).isLessThanOrEqualTo(Duration.ofMinutes(30));
    }

    @Test
    void otpPropertiesBindIncludingTheNestedEmailBlock() {
        OtpProperties otp = bind("app.otp", OtpProperties.class);

        assertThat(otp.ttl()).isEqualTo(Duration.ofMinutes(10));
        assertThat(otp.length()).isEqualTo(6);
        assertThat(otp.maxPerHour()).isEqualTo(5);

        // Nested record: a typo in the yaml key leaves every field null, and delivery then fails
        // closed with "not configured" rather than loudly.
        assertThat(otp.email()).isNotNull();
        assertThat(otp.email().provider()).isEqualTo("brevo");
        assertThat(otp.email().baseUrl()).isEqualTo("https://api.brevo.com/v3/smtp/email");
        // Unset by default, so an out-of-the-box run sends nothing rather than half-sending.
        assertThat(otp.email().configured()).isFalse();
    }

    /**
     * The default is demo mode ON, which is right for a developer's first run and catastrophic in
     * production. This asserts the default and, more importantly, that the env var actually
     * overrides it -- a misspelt placeholder would pin it on forever.
     */
    @Test
    void demoModeDefaultsOnLocallyAndIsOverridableByEnvironment() {
        assertThat(bind("app.otp", OtpProperties.class).demoMode()).isTrue();

        StandardEnvironment production = loadApplicationYaml();
        production.getPropertySources().addFirst(singleProperty("OTP_DEMO_MODE", "false"));

        assertThat(Binder.get(production)
                        .bind("app.otp", Bindable.of(OtpProperties.class))
                        .get()
                        .demoMode())
                .isFalse();
    }

    @Test
    void oauthPropertiesDefaultToRefusingUnknownIdentitiesAndAnUnprivilegedRole() {
        OAuthProperties oauth = bind("app.oauth", OAuthProperties.class);

        assertThat(oauth.autoProvision()).isFalse();
        assertThat(oauth.defaultRole()).isEqualTo("USER");
        assertThat(OAuthProperties.PRIVILEGED_ROLES).doesNotContain(oauth.defaultRole());

        // Blank credentials by default, so Google sign-in is absent rather than broken.
        assertThat(oauth.google().configured()).isFalse();
    }

    /**
     * Google credentials are accepted under the short names and under Spring's own long ones.
     *
     * <p>The long form is what every Spring Boot tutorial prints, so it is what people set. It
     * cannot work by itself here: {@link OAuthClientConfig} declares the
     * {@code ClientRegistrationRepository} bean, so Boot's OAuth2 client auto-configuration backs
     * off and never looks at {@code spring.security.oauth2.client.registration.*}. Setting them
     * would then look entirely correct and do nothing -- no error, no log, no button.
     */
    @Test
    void googleCredentialsBindFromEitherTheShortOrTheSpringStandardEnvironmentVariables() {
        StandardEnvironment shortNames = loadApplicationYaml();
        shortNames.getPropertySources().addFirst(properties(
                "GOOGLE_CLIENT_ID", "short-id",
                "GOOGLE_CLIENT_SECRET", "short-secret"));

        StandardEnvironment springNames = loadApplicationYaml();
        springNames.getPropertySources().addFirst(properties(
                "SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID", "long-id",
                "SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET", "long-secret"));

        assertThat(bindOauth(shortNames).google().configured()).isTrue();
        assertThat(bindOauth(shortNames).google().clientId()).isEqualTo("short-id");

        assertThat(bindOauth(springNames).google().configured()).isTrue();
        assertThat(bindOauth(springNames).google().clientId()).isEqualTo("long-id");
    }

    /** With neither set, the feature must be absent rather than half-configured. */
    @Test
    void googleSignInIsAbsentWhenNeitherNamingIsSet() {
        assertThat(bind("app.oauth", OAuthProperties.class).google().configured()).isFalse();
    }

    /** Configuring a privileged default role must stop the application, not warn. */
    @Test
    void aPrivilegedOauthDefaultRoleFailsBinding() {
        StandardEnvironment dangerous = loadApplicationYaml();
        dangerous.getPropertySources().addFirst(singleProperty("OAUTH_DEFAULT_ROLE", "ADMIN"));

        assertThatThrownBy(() -> Binder.get(dangerous).bind("app.oauth", Bindable.of(OAuthProperties.class)))
                .hasRootCauseInstanceOf(IllegalStateException.class);
    }

    /**
     * The datasource block has to survive too. It was briefly wiped out by a second top-level
     * {@code spring:} key added further down the file -- YAML replaces a duplicate mapping rather
     * than merging it, so the application would have started with no database at all.
     */
    @Test
    void theSingleSpringBlockStillCarriesTheDatasourceAndFlywayConfiguration() {
        // Raw, not resolved: these two are ${NEON_*} with no default, precisely because there is no
        // safe fallback for a database URL. Only their presence is being checked.
        assertThat(raw("spring.datasource.url")).isEqualTo("${NEON_POOLED_URL}");
        assertThat(raw("spring.flyway.url")).isEqualTo("${NEON_UNPOOLED_URL}");
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        // And the mail block whose arrival, as a second top-level `spring:` key, is what deleted
        // all of the above until the two blocks were merged.
        assertThat(environment.getProperty("spring.mail.host")).isNotBlank();
    }

    /** Behind Render's TLS terminator this is what makes the OAuth2 redirect_uri come out https. */
    @Test
    void forwardedHeadersAreHonouredSoTheOauthRedirectUriIsBuiltCorrectly() {
        assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
    }

    // ---------------------------------------------------------------------------- helpers

    private <T> T bind(String prefix, Class<T> type) {
        return Binder.get(environment).bind(prefix, Bindable.of(type)).get();
    }

    /** The value as written in the file, with {@code ${...}} placeholders left intact. */
    private String raw(String key) {
        for (PropertySource<?> source : environment.getPropertySources()) {
            Object value = source.getProperty(key);
            if (value != null) {
                return value.toString();
            }
        }
        return null;
    }

    private static StandardEnvironment loadApplicationYaml() {
        StandardEnvironment environment = new StandardEnvironment();
        try {
            List<PropertySource<?>> sources =
                    new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"));
            sources.forEach(environment.getPropertySources()::addLast);
        } catch (IOException e) {
            throw new IllegalStateException("could not read application.yml", e);
        }
        return environment;
    }

    private static OAuthProperties bindOauth(StandardEnvironment environment) {
        return Binder.get(environment).bind("app.oauth", Bindable.of(OAuthProperties.class)).get();
    }

    private static PropertySource<?> singleProperty(String key, String value) {
        return properties(key, value);
    }

    /** An overriding property source from alternating key/value arguments. */
    private static PropertySource<?> properties(String... keyValuePairs) {
        java.util.Map<String, Object> values = new java.util.LinkedHashMap<>();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            values.put(keyValuePairs[i], keyValuePairs[i + 1]);
        }
        return new org.springframework.core.env.MapPropertySource("override", values);
    }
}
