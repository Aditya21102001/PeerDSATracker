package com.peerdsa.auth.passkey;

import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.DeletePasskeyResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginVerifyRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeyListResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeySummary;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterOptionsRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterVerifyRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.RenamePasskeyRequest;
import com.peerdsa.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * WebAuthn / Passkey endpoints under {@code /api/auth/passkeys}.
 *
 * <p>{@code /login/options} and {@code /login/verify} are public so unauthenticated users can sign
 * in with biometrics or Conditional UI; registration and management require an active access token.
 */
@RestController
@RequestMapping("/api/auth/passkeys")
public class PasskeyController {

    private final PasskeyService passkeys;

    public PasskeyController(PasskeyService passkeys) {
        this.passkeys = passkeys;
    }

    @PostMapping("/register/options")
    public RegisterOptionsResponse registerOptions(
            @AuthenticationPrincipal User user,
            @RequestBody(required = false) RegisterOptionsRequest body,
            HttpServletRequest request) {
        boolean promotion = body != null && body.isPromotion();
        return passkeys.registrationOptions(user, promotion, requestOrigin(request), fallbackHost(request));
    }

    @PostMapping("/register/verify")
    public PasskeySummary registerVerify(
            @AuthenticationPrincipal User user, @Valid @RequestBody RegisterVerifyRequest body) {
        return passkeys.verifyRegistration(user, body);
    }

    @PostMapping("/login/options")
    public LoginOptionsResponse loginOptions(HttpServletRequest request) {
        return passkeys.authenticationOptions(requestOrigin(request), fallbackHost(request));
    }

    @PostMapping("/login/verify")
    public TokenResponse loginVerify(
            @Valid @RequestBody LoginVerifyRequest body, HttpServletRequest request) {
        return passkeys.verifyAuthentication(body, userAgent(request), clientIp(request));
    }

    @GetMapping
    public PasskeyListResponse list(@AuthenticationPrincipal User user, HttpServletRequest request) {
        return passkeys.listForUser(user, requestOrigin(request), fallbackHost(request));
    }

    @PutMapping("/{id}")
    public PasskeySummary rename(
            @AuthenticationPrincipal User user,
            @PathVariable String id,
            @Valid @RequestBody RenamePasskeyRequest body) {
        return passkeys.renameCredential(user, id, body.name());
    }

    @DeleteMapping("/{id}")
    public DeletePasskeyResponse delete(
            @AuthenticationPrincipal User user, @PathVariable String id, HttpServletRequest request) {
        return passkeys.deleteCredential(user, id, requestOrigin(request), fallbackHost(request));
    }

    private static String requestOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            return origin;
        }
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            try {
                URI uri = URI.create(referer.trim());
                if (uri.getScheme() != null && uri.getHost() != null) {
                    int port = uri.getPort();
                    return port > 0
                            ? uri.getScheme() + "://" + uri.getHost() + ":" + port
                            : uri.getScheme() + "://" + uri.getHost();
                }
            } catch (IllegalArgumentException ignored) {
                // Fall back to forwarded host below.
            }
        }
        return null;
    }

    private static String fallbackHost(HttpServletRequest request) {
        String forwardedHost = request.getHeader("X-Forwarded-Host");
        if (forwardedHost != null && !forwardedHost.isBlank()) {
            return forwardedHost;
        }
        return request.getHeader("Host");
    }

    private static String userAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}

