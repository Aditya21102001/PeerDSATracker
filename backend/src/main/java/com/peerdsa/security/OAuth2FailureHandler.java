package com.peerdsa.security;

import com.peerdsa.config.FrontendUrl;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

/**
 * The other way a Google sign-in can end: the provider itself declined, or the round trip was
 * tampered with -- consent refused, the authorization code rejected, a mismatched {@code state}.
 *
 * <p>Same rule as {@link OAuth2SuccessHandler}: the user came from the frontend and must land back
 * on it. The default handler answers 401 on the backend's own domain, which to somebody who
 * clicked "Continue with Google" looks exactly like the site broke.
 *
 * <p>The provider's own message is logged and not forwarded. It describes a protocol failure, and
 * an attacker who can steer it would otherwise have text of their choosing rendered on our page.
 */
@Component
public class OAuth2FailureHandler implements AuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2FailureHandler.class);

    private final FrontendUrl frontendUrl;

    public OAuth2FailureHandler(FrontendUrl frontendUrl) {
        this.frontendUrl = frontendUrl;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {

        log.info("Google sign-in did not complete: {}", exception.getMessage());

        String message = URLEncoder.encode(
                "Google sign-in did not complete. Please try again, or sign in with your password.",
                StandardCharsets.UTF_8);
        response.sendRedirect(frontendUrl.get() + "/oauth/callback#error=" + message);
    }
}
