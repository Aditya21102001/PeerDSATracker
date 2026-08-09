package com.peerdsa.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.dto.AuthDtos.ChangePasswordRequest;
import com.peerdsa.auth.dto.AuthDtos.ChangePasswordResponse;
import com.peerdsa.auth.dto.AuthDtos.LoginRequest;
import com.peerdsa.auth.dto.AuthDtos.SignupRequest;
import com.peerdsa.auth.otp.OtpService;
import com.peerdsa.config.JwtProperties;
import com.peerdsa.security.JwtService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sign-in by username or email, and the three proofs accepted for a password change.
 *
 * <p>Each test here corresponds to a way this went wrong. Signing in by email only stranded every
 * user who had just recovered their account by email; handing a null password hash to the encoder
 * turned a Google account's sign-in attempt into a 500; and distinguishing "wrong password" from
 * "unknown user" told an attacker which half of a guess had landed.
 */
class AuthServiceLoginTest {

    private static final String PASSWORD = "Passw0rd!";

    private UserRepository users;
    private RefreshTokenRepository refreshTokens;
    private OtpService otpService;
    private PasswordEncoder encoder;
    private JwtService jwtService;
    private AuthService authService;

    private User account;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        otpService = mock(OtpService.class);
        encoder = new BCryptPasswordEncoder();

        JwtProperties properties = AuthTestFixtures.jwtProperties();
        jwtService = new JwtService(properties);
        authService = new AuthService(
                users,
                refreshTokens,
                mock(RefreshTokenRevoker.class),
                encoder,
                jwtService,
                properties,
                otpService);

        when(refreshTokens.save(any())).thenAnswer((Answer<RefreshToken>) i -> i.getArgument(0));
        when(users.save(any())).thenAnswer((Answer<User>) i -> i.getArgument(0));
        when(users.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase(any())).thenReturn(Optional.empty());

        account = AuthTestFixtures.user(7L, "Aditya@Example.com", "aditya", encoder.encode(PASSWORD));
    }

    // ------------------------------------------------------------------ 1. username OR email

    @Test
    void signsInByUsername() {
        when(users.findByUsernameIgnoreCase("aditya")).thenReturn(Optional.of(account));

        assertThat(authService.login(login("aditya"), "junit", "ip").accessToken()).isNotBlank();
    }

    @Test
    void signsInByEmail() {
        when(users.findByEmailIgnoreCase("aditya@example.com")).thenReturn(Optional.of(account));

        assertThat(authService.login(login("aditya@example.com"), "junit", "ip").accessToken())
                .isNotBlank();
    }

    /**
     * A pasted address routinely arrives with a trailing space or a capitalised first letter, and
     * somebody recovering an account is exactly the person least equipped to work out why "it just
     * says invalid". Username lookups go through IgnoreCase; the email is additionally lowercased
     * before the query so it hits the {@code lower(email)} unique index.
     */
    @Test
    void signsInDespiteOddCasingAndStrayWhitespace() {
        when(users.findByUsernameIgnoreCase("ADITYA")).thenReturn(Optional.of(account));
        when(users.findByEmailIgnoreCase("aditya@example.com")).thenReturn(Optional.of(account));

        assertThat(authService.login(login("  ADITYA  "), "junit", "ip").accessToken()).isNotBlank();
        assertThat(authService.login(login("  Aditya@Example.COM \n"), "junit", "ip").accessToken())
                .isNotBlank();
    }

    /**
     * If one person's username is another person's email address, the username wins. The field is
     * labelled "username", and that is the promise it has to keep -- resolving it as an email
     * would sign the caller into somebody else's account.
     */
    @Test
    void aUsernameBeatsSomebodyElsesIdenticalEmailAddress() {
        User usernameOwner = AuthTestFixtures.user(1L, "owner@x.com", "a@b.com", encoder.encode(PASSWORD));
        User emailOwner = AuthTestFixtures.user(2L, "a@b.com", "someone-else", encoder.encode(PASSWORD));

        when(users.findByUsernameIgnoreCase("a@b.com")).thenReturn(Optional.of(usernameOwner));
        when(users.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(emailOwner));

        authService.login(login("a@b.com"), "junit", "ip");

        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        org.mockito.Mockito.verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(1L);
    }

    /** A bare word that is not a username is never tried as an email; there is nothing to try. */
    @Test
    void anIdentifierWithNoAtSignIsNeverLookedUpAsAnEmail() {
        assertThatThrownBy(() -> authService.login(login("nobody"), "junit", "ip"))
                .isInstanceOf(ResponseStatusException.class);

        org.mockito.Mockito.verify(users, org.mockito.Mockito.never()).findByEmailIgnoreCase(any());
    }

    // ------------------------------------------------------- 2. an account with no password hash

    /**
     * An account with no password hash is refused, not crashed on.
     *
     * <p>The usual telling of this is "matches(raw, null) throws". Worth knowing: on the Spring
     * Security shipped with Boot 4 it does <em>not</em> -- both {@code BCryptPasswordEncoder} and
     * {@code DelegatingPasswordEncoder} log and return false. That makes this assertion pass with
     * or without the guard on this stack, which is precisely why the test below it exists: the
     * behaviour must not depend on how tolerant the encoder happens to be this release.
     */
    @Test
    void refusesAnAccountWithNoPasswordHashInsteadOfThrowing() {
        User googleAccount = AuthTestFixtures.user(9L, "g@example.com", "g.7421", null);
        when(users.findByUsernameIgnoreCase("g.7421")).thenReturn(Optional.of(googleAccount));

        assertThatThrownBy(() -> authService.login(login("g.7421"), "junit", "ip"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid username or password");
    }

    /**
     * The guard itself: a null hash never reaches the encoder at all.
     *
     * <p>This is the invariant worth pinning, because it holds whatever the encoder does with a
     * null. Swap in an encoder that throws -- a custom one, or a future Spring Security that
     * restores the older behaviour -- and a Google account's sign-in attempt becomes a 500 where
     * everybody else gets a 401, which is itself a signal that the address belongs to a provider
     * account. A dummy hash is matched instead, so the attempt also still costs a full bcrypt and
     * cannot be told apart by timing.
     */
    @Test
    void anAccountWithNoPasswordHashNeverReachesThePasswordEncoder() {
        PasswordEncoder spy = mock(PasswordEncoder.class);
        when(spy.encode(any())).thenReturn("$2a$10$dummy");
        when(spy.matches(any(), any())).thenReturn(false);

        AuthService withSpy = new AuthService(
                users,
                refreshTokens,
                mock(RefreshTokenRevoker.class),
                spy,
                jwtService,
                AuthTestFixtures.jwtProperties(),
                otpService);

        User googleAccount = AuthTestFixtures.user(9L, "g@example.com", "g.7421", null);
        when(users.findByUsernameIgnoreCase("g.7421")).thenReturn(Optional.of(googleAccount));

        assertThatThrownBy(() -> withSpy.login(login("g.7421"), "junit", "ip"))
                .isInstanceOf(ResponseStatusException.class);

        org.mockito.Mockito.verify(spy, org.mockito.Mockito.never())
                .matches(any(), org.mockito.ArgumentMatchers.isNull());
        // But the encoder IS still consulted, so a missing account and a wrong password take the
        // same amount of time.
        org.mockito.Mockito.verify(spy).matches(any(), org.mockito.ArgumentMatchers.eq("$2a$10$dummy"));
    }

    @Test
    void anEmptyPasswordDoesNotSignInAnAccountThatHasNoPasswordHash() {
        User googleAccount = AuthTestFixtures.user(9L, "g@example.com", "g.7421", null);
        when(users.findByUsernameIgnoreCase("g.7421")).thenReturn(Optional.of(googleAccount));

        assertThatThrownBy(() ->
                        authService.login(new LoginRequest("g.7421", null, ""), "junit", "ip"))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ------------------------------------------------------------------ 3. one message, always

    @Test
    void aWrongPasswordAndAnUnknownIdentifierGiveTheIdenticalMessage() {
        when(users.findByUsernameIgnoreCase("aditya")).thenReturn(Optional.of(account));

        String wrongPassword = messageOf(() -> authService.login(
                new LoginRequest("aditya", null, "not-the-password"), "junit", "ip"));
        String unknownUser = messageOf(() -> authService.login(login("no-such-person"), "junit", "ip"));
        String noPasswordSet = messageOf(() -> {
            User googleAccount = AuthTestFixtures.user(9L, "g@x.com", "g.1", null);
            when(users.findByUsernameIgnoreCase("g.1")).thenReturn(Optional.of(googleAccount));
            authService.login(login("g.1"), "junit", "ip");
        });

        assertThat(wrongPassword).isEqualTo(unknownUser).isEqualTo(noPasswordSet);
    }

    // ----------------------------------------------- audit: public registration is not privileged

    /**
     * Registration is public, so whatever role it grants is a role anyone can have for the cost of
     * an email address. There is no field on {@code SignupRequest} that names one, and this pins
     * the entity default it falls through to.
     */
    @Test
    void publicSelfRegistrationCreatesAnOrdinaryUserNotAnAdmin() {
        authService.signup(new SignupRequest("new@example.com", "newbie", PASSWORD), "junit", "ip");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        org.mockito.Mockito.verify(users).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo("USER");
    }

    // ----------------------------------------------------- 3 (cont). the three password proofs

    @Test
    void changePasswordAcceptsTheCurrentPassword() {
        ChangePasswordResponse response = changePassword(
                account, new ChangePasswordRequest(PASSWORD, null, "brand-new-password"), null);

        assertThat(encoder.matches("brand-new-password", account.getPasswordHash())).isTrue();
        assertThat(response.username()).isEqualTo("aditya");
    }

    @Test
    void changePasswordAcceptsAFreshOneTimeCode() {
        when(otpService.consumeForUser(account, "123456")).thenReturn(true);

        changePassword(account, new ChangePasswordRequest(null, "123456", "brand-new-password"), null);

        assertThat(encoder.matches("brand-new-password", account.getPasswordHash())).isTrue();
    }

    /**
     * The path that makes this a recovery. A Google account has no current password to offer and
     * cannot be asked for one, so a token minted minutes ago by code verification is the proof.
     */
    @Test
    void changePasswordAcceptsACodeVerifiedTokenWithNoOtherProofAtAll() {
        User googleAccount = AuthTestFixtures.user(7L, "g@example.com", "g.7421", null);
        String vbcToken =
                jwtService.generateCodeVerifiedAccessToken(7L, "g@example.com", Instant.now());

        changePassword(googleAccount, new ChangePasswordRequest(null, null, "brand-new-password"), vbcToken);

        assertThat(encoder.matches("brand-new-password", googleAccount.getPasswordHash())).isTrue();
    }

    /** An ordinary session token grants nothing here, however valid it is for everything else. */
    @Test
    void changePasswordRejectsAnOrdinaryTokenAsProof() {
        String ordinary = jwtService.generateAccessToken(7L, "aditya@example.com", Instant.now());

        assertThatThrownBy(() -> changePassword(
                        account, new ChangePasswordRequest(null, null, "brand-new-password"), ordinary))
                .isInstanceOf(ResponseStatusException.class);
    }

    /** A vbc token proves control of <em>its own</em> account, never of the one being edited. */
    @Test
    void changePasswordRejectsACodeVerifiedTokenBelongingToSomebodyElse() {
        String someoneElsesToken =
                jwtService.generateCodeVerifiedAccessToken(999L, "other@example.com", Instant.now());

        assertThatThrownBy(() -> changePassword(
                        account, new ChangePasswordRequest(null, null, "brand-new-password"), someoneElsesToken))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void everyFailedProofGivesTheIdenticalMessage() {
        String wrongCurrentPassword = messageOf(() ->
                changePassword(account, new ChangePasswordRequest("wrong", null, "new-password-here"), null));
        String wrongCode = messageOf(() ->
                changePassword(account, new ChangePasswordRequest(null, "000000", "new-password-here"), null));
        String nothingAtAll = messageOf(() ->
                changePassword(account, new ChangePasswordRequest(null, null, "new-password-here"), null));

        assertThat(wrongCurrentPassword).isEqualTo(wrongCode).isEqualTo(nothingAtAll);
    }

    /**
     * Reported back because it is genuinely news. Recovery found this account by email, but
     * sign-in wants a username -- and for an account provisioned through Google those differ, so
     * without showing it the user sets a correct password and is then told "invalid username or
     * password" with nothing on screen to explain why.
     */
    @Test
    void changePasswordReportsTheUsernameThePasswordWasSetOn() {
        User googleAccount = AuthTestFixtures.user(7L, "aditya.yadav@gmail.com", "aditya.yadav.4821", null);
        String vbcToken = jwtService.generateCodeVerifiedAccessToken(
                7L, "aditya.yadav@gmail.com", Instant.now());

        ChangePasswordResponse response = changePassword(
                googleAccount, new ChangePasswordRequest(null, null, "new-password-here"), vbcToken);

        assertThat(response.username()).isEqualTo("aditya.yadav.4821");
    }

    /** The caller keeps a working session; it is the other devices that are signed out. */
    @Test
    void changePasswordRevokesEveryOldSessionAndHandsBackANewOne() {
        ChangePasswordResponse response = changePassword(
                account, new ChangePasswordRequest(PASSWORD, null, "new-password-here"), null);

        org.mockito.Mockito.verify(refreshTokens).revokeAllForUser(7L);
        assertThat(response.tokens().accessToken()).isNotBlank();
        assertThat(response.tokens().refreshToken()).isNotBlank();
    }

    @Test
    void aSuccessfulChangeLetsTheNewPasswordSignIn() {
        changePassword(account, new ChangePasswordRequest(PASSWORD, null, "new-password-here"), null);
        when(users.findByUsernameIgnoreCase("aditya")).thenReturn(Optional.of(account));

        assertThatCode(() -> authService.login(new LoginRequest("aditya", null, "new-password-here"), "j", "ip"))
                .doesNotThrowAnyException();
    }

    // ------------------------------------------------------ claiming a provisioned username

    /**
     * The point of the step is that the owner has SEEN the name, not that they must replace it, so
     * keeping the generated one is a legitimate outcome and must not collide with itself.
     */
    @Test
    void keepingTheGeneratedUsernameSucceedsAndMarksItChosen() {
        User provisioned = AuthTestFixtures.user(7L, "g@example.com", "aditya.yadav", null);
        provisioned.setUsernameChosen(false);
        when(users.findById(7L)).thenReturn(Optional.of(provisioned));
        when(users.existsByUsernameIgnoreCase("aditya.yadav")).thenReturn(true);

        var me = authService.chooseUsername(provisioned, "aditya.yadav", 0);

        assertThat(me.username()).isEqualTo("aditya.yadav");
        assertThat(me.usernameChosen()).isTrue();
    }

    @Test
    void choosingADifferentFreeUsernameSucceeds() {
        User provisioned = AuthTestFixtures.user(7L, "g@example.com", "aditya.yadav.4821", null);
        provisioned.setUsernameChosen(false);
        when(users.findById(7L)).thenReturn(Optional.of(provisioned));
        when(users.existsByUsernameIgnoreCase("grindmaster")).thenReturn(false);

        var me = authService.chooseUsername(provisioned, "  grindmaster  ", 0);

        assertThat(me.username()).isEqualTo("grindmaster");
        assertThat(provisioned.isUsernameChosen()).isTrue();
    }

    @Test
    void choosingSomebodyElsesUsernameIsRejected() {
        User provisioned = AuthTestFixtures.user(7L, "g@example.com", "aditya.yadav.4821", null);
        when(users.findById(7L)).thenReturn(Optional.of(provisioned));
        when(users.existsByUsernameIgnoreCase("taken")).thenReturn(true);

        assertThatThrownBy(() -> authService.chooseUsername(provisioned, "taken", 0))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("taken");
    }

    /**
     * Only accounts the provider created start unchosen; everybody else must never be prompted.
     */
    @Test
    void anOrdinarySignupCountsAsHavingChosenItsUsername() {
        authService.signup(new SignupRequest("new@example.com", "newbie", PASSWORD), "junit", "ip");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        org.mockito.Mockito.verify(users).save(saved.capture());
        assertThat(saved.getValue().isUsernameChosen()).isTrue();
    }

    // ---------------------------------------------------------------------------- helpers

    private static LoginRequest login(String identifier) {
        return new LoginRequest(identifier, null, PASSWORD);
    }

    /**
     * Calls change-password for {@code user}, stubbing the lookup it performs.
     *
     * <p>The service deliberately re-reads the account inside its transaction rather than saving
     * the detached principal the security filter handed it, so the repository has to answer for
     * that id — and the object it answers with is the one the assertions then inspect.
     */
    private ChangePasswordResponse changePassword(
            User user, ChangePasswordRequest request, String bearerToken) {
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        return authService.changePassword(user, request, bearerToken, "junit", "ip");
    }

    private static String messageOf(Runnable call) {
        try {
            call.run();
            throw new AssertionError("expected the call to be rejected");
        } catch (ResponseStatusException e) {
            return e.getReason();
        }
    }
}
