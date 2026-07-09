package com.peerdsa.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request and response bodies for the {@code /api/auth} endpoints. */
public final class AuthDtos {

    private AuthDtos() {}

    /** Registration payload for {@code POST /api/auth/signup}. */
    public record SignupRequest(
            @NotBlank @Email String email,
            // Dots and hyphens allowed: "aditya.yadav" is the name people actually try.
            // Uniqueness is still enforced case-insensitively by uq_users_username_lower.
            @NotBlank @Size(min = 3, max = 30)
                    @Pattern(
                            regexp = "^[a-zA-Z0-9._-]+$",
                            message = "letters, digits, dot, hyphen and underscore only")
                    String username,
            @NotBlank @Size(min = 8, max = 100) String password) {}

    /** Credentials for {@code POST /api/auth/login}. */
    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    /** Wraps the opaque refresh token for {@code /refresh} and {@code /logout}. */
    public record RefreshRequest(@NotBlank String refreshToken) {}

    /** Target address for {@code POST /api/auth/forgot}. */
    public record ForgotRequest(@NotBlank @Email String email) {}

    /** Reset token plus the new password, for {@code POST /api/auth/reset}. */
    public record ResetRequest(@NotBlank String token, @NotBlank @Size(min = 8, max = 100) String password) {}

    /** The only place the raw refresh token is exposed; it is never returned again. */
    public record TokenResponse(String accessToken, String refreshToken, long expiresInSeconds) {}

    /** Profile and gamification snapshot returned by {@code GET /api/auth/me}. */
    public record MeResponse(
            Long id,
            String email,
            String username,
            String displayName,
            int xp,
            int totalSolved,
            int currentStreak,
            int longestStreak) {}
}
