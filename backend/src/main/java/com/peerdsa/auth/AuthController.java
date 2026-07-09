package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.ForgotRequest;
import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.MeResponse;
import com.peerdsa.auth.dto.AuthDtos.RefreshRequest;
import com.peerdsa.auth.dto.AuthDtos.ResetRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
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

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordReset;
    private final com.peerdsa.streak.StreakService streaks;
    private final boolean resetEnabled;

    public AuthController(
            AuthService authService,
            PasswordResetService passwordReset,
            com.peerdsa.streak.StreakService streaks,
            @Value("${app.reset.enabled}") boolean resetEnabled) {
        this.authService = authService;
        this.passwordReset = passwordReset;
        this.streaks = streaks;
        this.resetEnabled = resetEnabled;
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

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal User user) {
        return new MeResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getDisplayName(),
                user.getXp(),
                user.getTotalSolved(),
                // The stored column goes stale the moment a day is missed.
                streaks.effectiveCurrentStreak(user),
                user.getLongestStreak());
    }

    private static String userAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }

    private static String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}
