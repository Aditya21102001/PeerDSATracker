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

    /**
     * Credentials for {@code POST /api/auth/login}.
     *
     * <p>{@code identifier} is a username <em>or</em> an email. Both have to work: recovery is
     * keyed by email while sign-in is keyed by username, and an account provisioned through Google
     * has a generated username its owner has never seen.
     *
     * <p>{@code email} is the field this endpoint used to take, kept because the frontend deploys
     * separately from the backend -- for the minutes between the two, the old SPA is still posting
     * it. Neither is annotated {@code @NotBlank}; {@link #account()} resolves them and
     * {@code AuthService} rejects a blank result with the same 401 as a wrong password, so an empty
     * body cannot be told apart from a wrong guess.
     */
    public record LoginRequest(String identifier, String email, @NotBlank String password) {

        /** The identifier to sign in with, preferring the current field over the legacy one. */
        public String account() {
            return identifier != null && !identifier.isBlank() ? identifier : email;
        }
    }

    /** Wraps the opaque refresh token for {@code /refresh} and {@code /logout}. */
    public record RefreshRequest(@NotBlank String refreshToken) {}

    /** Target address for {@code POST /api/auth/forgot}. */
    public record ForgotRequest(@NotBlank @Email String email) {}

    /** Reset token plus the new password, for {@code POST /api/auth/reset}. */
    public record ResetRequest(@NotBlank String token, @NotBlank @Size(min = 8, max = 100) String password) {}

    /**
     * What the sign-in screen may offer, from {@code GET /api/auth/options}.
     *
     * <p>Exists so the frontend does not have to duplicate the backend's configuration and drift
     * from it. Without it, a "Continue with Google" button ships on every deployment and 401s on
     * the ones without credentials, which reads as a broken site rather than an absent feature.
     *
     * @param googleEnabled whether Google credentials are actually configured on this backend.
     * @param otpDemoMode whether one-time codes come back in the HTTP response instead of by
     *     email. Not a secret -- the very next request would reveal it -- and the UI needs it to
     *     label the code as the development affordance it is.
     */
    public record AuthOptions(boolean googleEnabled, boolean otpDemoMode) {}

    /** Destination for {@code POST /api/auth/otp/request}. */
    public record OtpRequest(@NotBlank @Email String email) {}

    /**
     * Answer to {@code POST /api/auth/otp/request}.
     *
     * <p>{@code demoCode} is non-null only when {@code app.otp.demo-mode} is on, which is how the
     * flow stays usable with no mail provider configured. It is never populated as a fallback when
     * delivery fails -- that case is a 503 with the stored code destroyed. {@code demoMode} is
     * echoed so the UI can say plainly that it is showing a code it should not have.
     */
    public record OtpRequestResponse(boolean demoMode, String demoCode) {}

    /**
     * Code sign-in for {@code POST /api/auth/otp/verify}.
     *
     * <p>Only these two fields, deliberately. The account is resolved from the address the code was
     * issued to, which the server already knows; accepting any further identifier here would let a
     * code mailed to one address sign in whatever account the request named.
     */
    public record OtpVerifyRequest(@NotBlank @Email String email, @NotBlank String code) {}

    /**
     * Payload for {@code POST /api/auth/change-password}: a new password plus <em>one</em> proof
     * that the caller is entitled to set it.
     *
     * <p>The account is never taken from here -- it comes from the authenticated session. The two
     * proof fields are both optional because there are three accepted proofs and only one need
     * hold: a token issued by code verification within its window (nothing to send at all), a fresh
     * one-time code, or the current password. Somebody who has forgotten their password has no
     * current password to give, and an account created through Google has never had one, which is
     * exactly what makes this a recovery rather than a convenience.
     */
    public record ChangePasswordRequest(
            String currentPassword, String code, @NotBlank @Size(min = 8, max = 100) String newPassword) {}

    /**
     * Answer to a successful password change.
     *
     * <p>{@code username} is here because it is genuinely news to the user. Recovery finds the
     * account by email while sign-in wants a username, and for every account created through Google
     * those differ -- so without showing it, the user sets a correct password and is then told
     * "invalid username or password" with nothing on screen to explain why.
     *
     * <p>{@code tokens} replaces the caller's session. Changing a password revokes every existing
     * refresh token, which is the point; issuing a fresh pair to whoever proved themselves means
     * that logs out the other devices rather than all of them.
     */
    public record ChangePasswordResponse(String username, TokenResponse tokens) {}

    /** The only place the raw refresh token is exposed; it is never returned again. */
    public record TokenResponse(String accessToken, String refreshToken, long expiresInSeconds) {}

    /**
     * Profile and gamification snapshot returned by {@code GET /api/auth/me}.
     *
     * @param hasPassword false for an account that has only ever signed in through Google. The UI
     *     needs it to say "set a password" instead of asking for a current one it cannot have.
     */
    public record MeResponse(
            Long id,
            String email,
            String username,
            String displayName,
            boolean hasPassword,
            int xp,
            int totalSolved,
            int currentStreak,
            int longestStreak) {}
}
