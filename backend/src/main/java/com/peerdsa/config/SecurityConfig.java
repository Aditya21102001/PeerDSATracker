package com.peerdsa.config;

import com.peerdsa.security.JwtAuthenticationFilter;
import com.peerdsa.security.OAuth2FailureHandler;
import com.peerdsa.security.OAuth2SuccessHandler;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless HTTP security: no session, CSRF disabled (there is no cookie to forge), and the
 * {@link JwtAuthenticationFilter} placed ahead of the username/password filter.
 *
 * <p><b>What {@code authenticated()} means here.</b> Everything not listed as public requires a
 * valid token, and that is only a meaningful bar because this application never issues a token to
 * an identity it has not verified. There is no guest pass, no anonymous trial token, no
 * "attendee" credential -- every token comes from a password, a code sent to a registered address,
 * or an OAuth2 provider. Were any endpoint ever to hand out a token for a self-asserted identity,
 * {@code authenticated()} would silently degrade to "asked for a token", and every rule below would
 * have to be restated in terms of roles instead. {@link com.peerdsa.security.JwtService} enforces
 * the other half of that promise: only a token of type {@code access} authenticates at all, so a
 * scoped or challenge token added later cannot become a session by accident.
 *
 * <p>{@code /api/peers/search} deliberately stays authenticated: an open endpoint would let anyone
 * enumerate every registered username.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    /**
     * Endpoints reachable without a token. Each one either establishes a session or is the
     * documented no-op that keeps account enumeration impossible.
     */
    private static final String[] PUBLIC_AUTH_ENDPOINTS = {
        "/api/auth/signup",
        "/api/auth/login",
        "/api/auth/refresh",
        "/api/auth/forgot",
        "/api/auth/reset",
        // Asking for a one-time code and redeeming it are both pre-session by definition: the
        // whole point is that the caller cannot prove who they are yet. Rate limiting and the
        // uniform 202 in OtpService are what make them safe to expose, not authentication.
        "/api/auth/otp/request",
        "/api/auth/otp/verify",
        // Which sign-in methods this deployment offers. Read before anyone is signed in, by
        // definition, and it holds nothing secret.
        "/api/auth/options",
    };

    /** The OAuth2 redirect dance. Public because the browser arrives here with no token at all. */
    private static final String[] OAUTH_ENDPOINTS = {"/oauth2/**", "/login/oauth2/**"};

    private final List<String> allowedOrigins;
    private final OAuthProperties oauthProperties;

    public SecurityConfig(
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins,
            OAuthProperties oauthProperties) {
        this.allowedOrigins = allowedOrigins;
        this.oauthProperties = oauthProperties;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtFilter,
            OAuth2SuccessHandler oauthSuccess,
            OAuth2FailureHandler oauthFailure)
            throws Exception {

        http
                // .cors() installs Spring's CorsFilter early in the chain, so preflight
                // OPTIONS is answered before the JWT filter can reject it as anonymous.
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_AUTH_ENDPOINTS).permitAll()
                        .requestMatchers(OAUTH_ENDPOINTS).permitAll()
                        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                        // Notably NOT public: /api/auth/change-password. It resolves the account
                        // from the session, so it must have one.
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(
                        (req, res, ex) -> res.sendError(HttpMethod.OPTIONS.name().equals(req.getMethod()) ? 200 : 401)))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        configureGoogleLogin(http, oauthSuccess, oauthFailure);

        return http.build();
    }

    /**
     * Installs the OAuth2 login filters, but only when Google credentials actually exist.
     *
     * <p>Without the guard, {@code /oauth2/authorization/google} would exist on every deployment
     * and answer with a redirect to a Google page that immediately errors, because there is no
     * client id to send. Absent credentials should mean the feature is not there at all, so the
     * frontend's own check (does the button appear) and the backend's agree.
     *
     * <p>STATELESS sessions and OAuth2 login do coexist: the authorization request is held in the
     * servlet session for the two hops between the redirect out and the callback back, and the
     * resulting {@code Authentication} is never persisted -- {@link OAuth2SuccessHandler} converts
     * it to a JWT and redirects, which is exactly the stateless outcome we want.
     */
    private void configureGoogleLogin(
            HttpSecurity http, OAuth2SuccessHandler success, OAuth2FailureHandler failure) throws Exception {

        if (!oauthProperties.google().configured()) {
            log.info(
                    "Google sign-in is OFF: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it."
                            + " /oauth2/authorization/google will 401 until then.");
            return;
        }

        http.oauth2Login(oauth -> oauth.successHandler(success).failureHandler(failure));

        log.info(
                "Google sign-in is ON (auto-provisioning {}, default role for new accounts: {}).",
                oauthProperties.autoProvision() ? "ENABLED" : "disabled",
                oauthProperties.defaultRole());
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        // Required if the refresh token later moves into an httpOnly cookie.
        config.setAllowCredentials(true);

        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
