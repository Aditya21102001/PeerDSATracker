package com.peerdsa.security;

import com.peerdsa.auth.OAuthSignInRefusedException;
import com.peerdsa.auth.OAuthSignInService;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.config.FrontendUrl;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * Turns a completed Google authorization into a session and sends the browser back to the SPA.
 *
 * <p><b>Every refusal is caught here.</b> Letting one propagate renders Spring's error page, on the
 * <em>backend's</em> domain, to a user who clicked a button on the frontend: it reads as a crash,
 * and it strands them on a host with no navigation back. So both outcomes -- signed in, and
 * declined -- leave by the same door, a redirect to the frontend with either a token or a message.
 *
 * <p>The token travels in the URL <b>fragment</b>, not the query string. A fragment is never sent
 * to a server, so it stays out of access logs, out of the proxy in front of them, and out of the
 * {@code Referer} of whatever the SPA loads next. Only the refresh token is passed: the SPA spends
 * it immediately for an access token, so the value that briefly sat in a URL is already rotated by
 * the time the page has finished loading.
 */
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2SuccessHandler.class);

    private final OAuthSignInService oauthSignIn;
    private final FrontendUrl frontendUrl;

    public OAuth2SuccessHandler(OAuthSignInService oauthSignIn, FrontendUrl frontendUrl) {
        this.oauthSignIn = oauthSignIn;
        this.frontendUrl = frontendUrl;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        try {
            OAuth2User principal = (OAuth2User) authentication.getPrincipal();

            TokenResponse tokens = oauthSignIn.signIn(
                    principal.getAttribute("email"),
                    principal.getAttribute("name"),
                    principal.getAttribute("picture"),
                    request.getHeader("User-Agent"),
                    request.getRemoteAddr());

            response.sendRedirect(callbackUrl("token=" + encode(tokens.refreshToken())));

        } catch (OAuthSignInRefusedException e) {
            log.info("Google sign-in refused: {}", e.getMessage());
            response.sendRedirect(callbackUrl("error=" + encode(e.getMessage())));

        } catch (RuntimeException e) {
            // Anything unforeseen goes home the same way rather than out of the filter chain.
            // The detail is logged, never handed to the browser.
            log.error("Google sign-in failed unexpectedly", e);
            response.sendRedirect(callbackUrl(
                    "error=" + encode("Could not complete Google sign-in. Please try again.")));
        }
    }

    private String callbackUrl(String fragment) {
        return frontendUrl.get() + "/oauth/callback#" + fragment;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
