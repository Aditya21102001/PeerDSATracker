package com.peerdsa.auth;

import com.peerdsa.auth.dto.AuthDtos.ChangePasswordRequest;
import com.peerdsa.auth.dto.AuthDtos.ChangePasswordResponse;
import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.otp.OtpDelivery;
import com.peerdsa.auth.otp.OtpService;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Core authentication logic: credential checks, plus issuing and rotating the JWT access token
 * and opaque refresh token. Only the SHA-256 of a refresh token is persisted; the raw value is
 * handed to the client once and never stored.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** One message for every way sign-in can fail. Which half was wrong is not the caller's business. */
    private static final String SIGN_IN_FAILED = "Invalid username or password";

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final RefreshTokenRevoker revoker;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final OtpService otpService;

    /**
     * A hash of a random string nobody will ever submit, matched against when no account was
     * found so that a miss costs the same as a wrong password. Without it, "no such user" returns
     * in microseconds while "wrong password" spends tens of milliseconds in bcrypt -- a difference
     * anyone can measure over the network, which turns sign-in into an account-enumeration oracle
     * however careful the error message is. Computed with the configured encoder so it stays
     * correct if bcrypt is ever swapped out.
     */
    private final String noSuchUserHash;

    public AuthService(
            UserRepository users,
            RefreshTokenRepository refreshTokens,
            RefreshTokenRevoker revoker,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            JwtProperties jwtProperties,
            OtpService otpService) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.revoker = revoker;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
        this.otpService = otpService;
        this.noSuchUserHash = passwordEncoder.encode(Tokens.random(32));
    }

    @Transactional
    public TokenResponse signup(SignupRequest request, String userAgent, String ip) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        if (users.existsByUsernameIgnoreCase(request.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken");
        }

        User user = new User();
        user.setEmail(request.email());
        user.setUsername(request.username());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.username());
        // Note the absence of setRole: registration is public, so it takes the entity's default
        // of USER and there is no field a caller could send to ask for anything else.
        users.save(user);

        return issueTokens(user, userAgent, ip, Instant.now(), false).response();
    }

    /**
     * Signs in with a username <em>or</em> an email.
     *
     * <p>Both are required, not a nicety. Recovery is keyed by email while sign-in is keyed by
     * username, and an account provisioned through Google has a generated username its owner has
     * never seen -- so a user who has just recovered their account by email would otherwise have no
     * way in. Username is tried first, so if one person's username is another's email address the
     * username wins; the field is labelled "username", and that is the promise it makes.
     */
    @Transactional
    public TokenResponse login(LoginRequest request, String userAgent, String ip) {
        User user = findByIdentifier(request.account()).orElse(null);

        // Deliberately one branch: a null user, an account with no password hash, and a wrong
        // password are indistinguishable from outside. Two things are going on here.
        //
        // The null hash never reaches the encoder. On the Spring Security shipped with Boot 4 a
        // null encoded password merely logs and returns false -- but that is a promise of the
        // encoder, not of this code. Older versions threw, a custom or delegating encoder may
        // throw, and if one does then a Google account's sign-in attempt becomes a 500 where
        // everyone else gets a 401, which is itself a signal about that address.
        //
        // And a miss still pays for a bcrypt, against a dummy hash. Skipping it would make "no
        // such user" return in microseconds while "wrong password" takes tens of milliseconds --
        // a difference anyone can measure, and an account-enumeration oracle no error message can
        // paper over.
        boolean known = user != null && user.hasPassword();
        String hash = known ? user.getPasswordHash() : noSuchUserHash;
        boolean ok = passwordEncoder.matches(request.password(), hash) && known;

        if (!ok) {
            log.info("Failed sign-in attempt for identifier {}", OtpDelivery.mask(request.account()));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, SIGN_IN_FAILED);
        }
        log.info("User {} signed in with a password", user.getId());
        return issueTokens(user, userAgent, ip, Instant.now(), false).response();
    }

    /**
     * Resolves a sign-in identifier: username first, then email if it could be one.
     *
     * <p>The email is normalised (trimmed, lowercased) because a pasted address routinely arrives
     * with a trailing space or a capitalised first letter, and someone recovering an account is
     * exactly the person least able to work out why "it just says invalid".
     */
    private Optional<User> findByIdentifier(String rawIdentifier) {
        String identifier = rawIdentifier == null ? "" : rawIdentifier.trim();
        if (identifier.isEmpty()) {
            return Optional.empty();
        }
        Optional<User> byUsername = users.findByUsernameIgnoreCase(identifier);
        if (byUsername.isPresent()) {
            return byUsername;
        }
        return identifier.contains("@")
                ? users.findByEmailIgnoreCase(identifier.toLowerCase(Locale.ROOT))
                : Optional.empty();
    }

    /**
     * Signs in with a one-time code sent to the account's registered address.
     *
     * <p>The token this returns carries {@code vbc}: this session began by proving control of the
     * address. That is what lets the set-a-password step work for somebody who cannot supply an old
     * password -- and the reason the frontend must actually present that step. Without it, a user
     * who has forgotten their password signs in by code forever and never recovers the account, so
     * the one-time code stops being a recovery and becomes a permanent second credential.
     */
    @Transactional
    public TokenResponse loginWithCode(String email, String code, String userAgent, String ip) {
        User user = otpService.verifyForSignIn(email, code);
        log.info(
                "User {} signed in with a one-time code; token carries vbc for {}",
                user.getId(),
                jwtProperties.verifiedWindow());
        return issueTokens(user, userAgent, ip, Instant.now(), true).response();
    }

    /** A session for an identity an OAuth2 provider vouched for. Never code-verified. */
    @Transactional
    public TokenResponse issueSession(User user, String userAgent, String ip) {
        return issueTokens(user, userAgent, ip, Instant.now(), false).response();
    }

    /**
     * Sets a new password, given exactly one of three proofs, tried in this order:
     *
     * <ol>
     *   <li>the caller's own token, if it was issued by code verification and is still inside its
     *       window -- they proved control of the address minutes ago and have nothing left to send;
     *   <li>a fresh one-time code;
     *   <li>the current password.
     * </ol>
     *
     * The first two are what make this a recovery rather than a convenience: somebody who has
     * forgotten their password has no current password to give, and an account created through
     * Google has never had one.
     *
     * @param user resolved from the session by the security filter. Never from the request body --
     *     a body parameter here would be an "change anyone's password" endpoint.
     * @param bearerToken the caller's raw access token, for the {@code vbc} check. May be null.
     */
    @Transactional
    public ChangePasswordResponse changePassword(
            User principal, ChangePasswordRequest request, String bearerToken, String userAgent, String ip) {

        // Re-read inside the transaction. The principal comes from JwtAuthenticationFilter, which
        // runs before any transaction, so it is a detached snapshot taken at the start of the
        // request. Saving that snapshot would write back every field it holds -- silently undoing
        // any xp or streak update another request committed in between.
        User user = users.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));

        // Short-circuits in order, so a caller holding a code-verified token never has a code
        // consumed on their behalf. The name is kept only for the log line: which proof was
        // accepted is exactly what you want to know when auditing an account takeover, and it is
        // never reported back to the caller.
        String proof = null;
        if (provedByCodeVerifiedToken(user, bearerToken)) {
            proof = "code-verified session (vbc)";
        } else if (otpService.consumeForUser(user, request.code())) {
            proof = "fresh one-time code";
        } else if (provedByCurrentPassword(user, request.currentPassword())) {
            proof = "current password";
        }

        if (proof == null) {
            // One message, whichever proof was offered and whichever way it failed. Saying "wrong
            // current password" rather than "wrong code" tells a guesser which half they got right.
            log.info("Rejected password change for user {}: no proof of identity held", user.getId());
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "We could not confirm it is you. Check your current password or code and try again.");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        users.save(user);

        // A password change is exactly the moment an existing session may belong to whoever the
        // password is being changed away from. Kill them all, then hand the caller -- who just
        // proved themselves -- a new one, so this signs out the other devices rather than all of
        // them and strands the person mid-recovery.
        int revoked = refreshTokens.revokeAllForUser(user.getId());
        log.info(
                "Password changed for user {} (username {}, proof: {}); revoked {} refresh token(s)",
                user.getId(),
                user.getUsername(),
                proof,
                revoked);

        TokenResponse tokens = issueTokens(user, userAgent, ip, Instant.now(), false).response();
        return new ChangePasswordResponse(user.getUsername(), tokens);
    }

    /**
     * The {@code vbc} proof. {@link JwtService#isVerifiedByCode} enforces the window; the subject
     * check here is belt and braces -- the filter already authenticated this very token as this
     * user, but a proof that grants a password rewrite should not rely on that being true forever.
     */
    private boolean provedByCodeVerifiedToken(User user, String bearerToken) {
        if (bearerToken == null || !jwtService.isVerifiedByCode(bearerToken)) {
            return false;
        }
        return Objects.equals(user.getId(), jwtService.extractUserId(bearerToken));
    }

    private boolean provedByCurrentPassword(User user, String currentPassword) {
        if (currentPassword == null || currentPassword.isBlank() || !user.hasPassword()) {
            return false;
        }
        return passwordEncoder.matches(currentPassword, user.getPasswordHash());
    }

    /**
     * Rotates the presented refresh token. Presenting a token that was already rotated is
     * normally treated as theft: every session for that user is revoked.
     *
     * <p>The exception is a <em>rotation race</em>. The Angular interceptor single-flights
     * refreshes, but only within one page: two open tabs, or a reload that starts while the
     * previous page's refresh is still in flight, both present the same token. Without the
     * grace window below, the loser's 401 revokes the whole family — including the token the
     * winner was handed milliseconds earlier — and the user is silently signed out of every
     * tab. That is a self-inflicted denial of service on the honest path, and it is far more
     * common than actual theft.
     *
     * <p>So a replay is benign when the presented token was rotated (it has a successor) and
     * that rotation happened within {@code app.jwt.refresh-grace}. The racer is handed a fresh
     * token chain of its own; nothing is revoked. A token revoked <em>without</em> a successor
     * (i.e. by logout) has no successor to date the grace window from, so replaying it is still
     * theft. Replay after the window is still theft.
     *
     * <p>The cost: a stolen token replayed inside the grace window buys a session. That is the
     * standard trade this pattern makes, and the window is deliberately seconds, not minutes.
     *
     * <p>Every path out of here preserves {@code sessionStartedAt} and mints an ordinary token.
     * Both matter: refresh expiry slides forward on each use, so the session start is the only
     * thing bounding it, and a renewed session is no longer "just verified" -- carrying {@code vbc}
     * across a rotation would let a session rewrite the password for as long as it stayed alive.
     */
    @Transactional
    public TokenResponse refresh(String rawToken, String userAgent, String ip) {
        RefreshToken stored = refreshTokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        requireWithinSessionCap(stored);

        if (stored.isRevoked()) {
            if (!isRotationRace(stored)) {
                // REQUIRES_NEW: the 401 below would otherwise roll this revocation back.
                revoker.revokeAllForUser(stored.getUserId());
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
            }
            User racer = users.findById(stored.getUserId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
            return issueTokens(racer, userAgent, ip, stored.getSessionStartedAt(), false).response();
        }
        if (!stored.isUsable()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }

        User user = users.findById(stored.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));

        Issued issued = issueTokens(user, userAgent, ip, stored.getSessionStartedAt(), false);
        stored.revoke();
        stored.setReplacedBy(issued.refreshToken().getId());
        return issued.response();
    }

    /**
     * The absolute cap. Each rotation pushes {@code expiresAt} another {@code refreshTtl} into the
     * future, so a session that is merely used often enough never ends on its own -- and neither
     * would a stolen token. {@code sessionStartedAt} is copied unchanged onto every successor, so
     * this measures from the moment the user actually authenticated however long the chain is.
     *
     * <p>Nothing is revoked here: the cap is not evidence of theft, and every later refresh fails
     * this same check anyway.
     */
    private void requireWithinSessionCap(RefreshToken stored) {
        Instant start = stored.getSessionStartedAt();
        if (start != null && !Instant.now().isBefore(start.plus(jwtProperties.sessionMax()))) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Session expired; please sign in again");
        }
    }

    /**
     * True when a revoked token was superseded so recently that a second, honest client could
     * still have been holding it. The successor's {@code createdAt} is the rotation instant.
     */
    private boolean isRotationRace(RefreshToken presented) {
        Long successorId = presented.getReplacedBy();
        if (successorId == null) {
            return false;
        }
        return refreshTokens.findById(successorId)
                .map(RefreshToken::getCreatedAt)
                .filter(Objects::nonNull)
                .filter(rotatedAt -> Instant.now().isBefore(rotatedAt.plus(jwtProperties.refreshGrace())))
                .isPresent();
    }

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findByTokenHash(sha256(rawToken)).ifPresent(RefreshToken::revoke);
    }

    /** The persisted refresh token alongside the response, so callers can link the rotation chain. */
    private record Issued(TokenResponse response, RefreshToken refreshToken) {}

    private Issued issueTokens(
            User user, String userAgent, String ip, Instant sessionStartedAt, boolean verifiedByCode) {

        String access = verifiedByCode
                ? jwtService.generateCodeVerifiedAccessToken(user.getId(), user.getEmail(), sessionStartedAt)
                : jwtService.generateAccessToken(user.getId(), user.getEmail(), sessionStartedAt);

        String rawRefresh = Tokens.random(48);

        RefreshToken saved = refreshTokens.save(new RefreshToken(
                user.getId(),
                sha256(rawRefresh),
                Instant.now().plus(jwtProperties.refreshTtl()),
                sessionStartedAt,
                userAgent,
                ip));

        var response = new TokenResponse(access, rawRefresh, jwtProperties.accessTtl().toSeconds());
        return new Issued(response, saved);
    }

    private static String sha256(String value) {
        return Tokens.sha256(value);
    }
}
