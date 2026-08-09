package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.AuthOptions;
import com.peerdsa.auth.dto.AuthDtos.ChangePasswordRequest;
import com.peerdsa.auth.dto.AuthDtos.ChooseUsernameRequest;
import com.peerdsa.auth.dto.AuthDtos.ChangePasswordResponse;
import com.peerdsa.auth.dto.AuthDtos.ForgotRequest;
import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.MeResponse;
import com.peerdsa.auth.dto.AuthDtos.OtpRequest;
import com.peerdsa.auth.dto.AuthDtos.OtpRequestResponse;
import com.peerdsa.auth.dto.AuthDtos.OtpVerifyRequest;
import com.peerdsa.auth.dto.AuthDtos.RefreshRequest;
import com.peerdsa.auth.dto.AuthDtos.ResetRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.otp.OtpService;
import com.peerdsa.config.OAuthProperties;
import com.peerdsa.config.OtpProperties;
import com.peerdsa.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST surface for authentication: signup, login, refresh-token rotation, logout, one-time code
 * sign-in, password change, and the older password-reset request/consume pair. The reset endpoints
 * 404 when the feature flag is off.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String BEARER = "Bearer ";

    private final AuthService authService;
    private final OtpService otpService;
    private final OtpProperties otpProperties;
    private final OAuthProperties oauthProperties;
    private final PasswordResetService passwordReset;
    private final com.peerdsa.streak.StreakService streaks;
    private final boolean resetEnabled;

    public AuthController(
            AuthService authService,
            OtpService otpService,
            OtpProperties otpProperties,
            OAuthProperties oauthProperties,
            PasswordResetService passwordReset,
            com.peerdsa.streak.StreakService streaks,
            @Value("${app.reset.enabled}") boolean resetEnabled) {
        this.authService = authService;
        this.otpService = otpService;
        this.otpProperties = otpProperties;
        this.oauthProperties = oauthProperties;
        this.passwordReset = passwordReset;
        this.streaks = streaks;
        this.resetEnabled = resetEnabled;
    }

    /**
     * What this deployment actually supports. Public, and deliberately so: it holds no secret, and
     * the alternative is a frontend that guesses. A "Continue with Google" button on a backend with
     * no Google credentials is worse than no button -- it looks like the site is broken.
     */
    @GetMapping("/options")
    public AuthOptions options() {
        return new AuthOptions(oauthProperties.google().configured(), otpProperties.demoMode());
    }

    /**
     * With no mailer configured, a reset link only reaches the application log. Rather
     * than tell a user "a reset link is on its way" and never send one, the endpoints
     * report 404: the feature is absent, not broken.
     */
    private void requireResetEnabled() {
        if (!resetEnabled) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Password reset is not available");
        }
    }

    @PostMapping("/signup")
    public ResponseEntity<TokenResponse> signup(
            @Valid @RequestBody SignupRequest request, HttpServletRequest http) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(authService.signup(request, userAgent(http), ip(http)));
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        return authService.login(request, userAgent(http), ip(http));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request, HttpServletRequest http) {
        return authService.refresh(request.refreshToken(), userAgent(http), ip(http));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    /**
     * Asks for a one-time code. Public, and answers 202 whether or not the address is registered:
     * any other behaviour tells an anonymous caller which addresses have accounts.
     *
     * <p>A 429 is possible and does not leak anything, because the rate limit is applied to the
     * address before the account is looked up. A 503 means the mail provider would not take the
     * message, and the code that was about to be issued has been destroyed.
     *
     * <p>{@code demoCode} in the body is populated only when {@code app.otp.demo-mode} is on --
     * never when delivery fails.
     */
    @PostMapping("/otp/request")
    public ResponseEntity<OtpRequestResponse> requestCode(@Valid @RequestBody OtpRequest request) {
        String demoCode = otpService.requestCode(request.email());
        return ResponseEntity.accepted()
                .body(new OtpRequestResponse(otpProperties.demoMode(), demoCode));
    }

    /** Signs in with a code. The returned token carries {@code vbc}; see {@link AuthService}. */
    @PostMapping("/otp/verify")
    public TokenResponse verifyCode(@Valid @RequestBody OtpVerifyRequest request, HttpServletRequest http) {
        return authService.loginWithCode(request.email(), request.code(), userAgent(http), ip(http));
    }

    /**
     * Sets a new password. Authenticated, and the account comes from the session -- there is no
     * field in the body that names a user, which is what keeps this from being "change anyone's
     * password". The proof may be the caller's own code-verified token, a fresh code, or the
     * current password; see {@link AuthService#changePassword}.
     */
    @PostMapping("/change-password")
    public ChangePasswordResponse changePassword(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletRequest http) {
        return authService.changePassword(user, request, bearerToken(http), userAgent(http), ip(http));
    }

    /**
     * Always 204, even for an unknown email. Any other behaviour tells an anonymous
     * caller which addresses are registered.
     */
    @PostMapping("/forgot")
    public ResponseEntity<Void> forgot(@Valid @RequestBody ForgotRequest request) {
        requireResetEnabled();
        passwordReset.requestReset(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset")
    public ResponseEntity<Void> reset(@Valid @RequestBody ResetRequest request) {
        requireResetEnabled();
        passwordReset.reset(request.token(), request.password());
        return ResponseEntity.noContent().build();
    }

    /**
     * Sets the username for an account that was provisioned one through Google.
     *
     * <p>Authenticated, and the account comes from the session. Validated with the same rules as a
     * self-chosen username at signup -- the value ends up on the public leaderboard, so it must not
     * be able to be an email address.
     */
    @PostMapping("/username")
    public MeResponse chooseUsername(
            @AuthenticationPrincipal User user, @Valid @RequestBody ChooseUsernameRequest request) {
        return authService.chooseUsername(user, request.username(), streaks.effectiveCurrentStreak(user));
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal User user) {
        return new MeResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getDisplayName(),
                // False for an account that has only ever signed in through Google, so the UI can
                // offer "set a password" rather than ask for a current one that does not exist.
                user.hasPassword(),
                user.isUsernameChosen(),
                user.getXp(),
                user.getTotalSolved(),
                // The stored column goes stale the moment a day is missed.
                streaks.effectiveCurrentStreak(user),
                user.getLongestStreak());
    }

    /** The caller's raw access token, or null. Only ever used to inspect its own {@code vbc}. */
    private static String bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith(BEARER) ? header.substring(BEARER.length()) : null;
    }

    private static String userAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }

    private static String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}
