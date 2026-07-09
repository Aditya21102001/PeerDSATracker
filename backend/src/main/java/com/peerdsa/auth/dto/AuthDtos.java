package com.peerdsa.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

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

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record ForgotRequest(@NotBlank @Email String email) {}

    public record ResetRequest(@NotBlank String token, @NotBlank @Size(min = 8, max = 100) String password) {}

    public record TokenResponse(String accessToken, String refreshToken, long expiresInSeconds) {}

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
