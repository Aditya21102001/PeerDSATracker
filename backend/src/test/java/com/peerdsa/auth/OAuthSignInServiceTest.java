package com.peerdsa.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.config.OAuthProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;

/**
 * Google sign-in, and the two ways it turns into a privilege-escalation bug.
 *
 * <p>The shortcut it is tempting to write is find-or-create: look the email up, create the account
 * if it is missing, give it whatever role was convenient during development. That means anybody who
 * finds the sign-in page clicks one button and becomes a user -- often a privileged one -- of
 * somebody else's system. The subtler variant assigns a role on <em>every</em> sign-in rather than
 * only on creation, which quietly demotes (or promotes) an existing account each time its owner
 * signs in.
 */
class OAuthSignInServiceTest {

    private UserRepository users;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        authService = mock(AuthService.class);

        when(users.save(any())).thenAnswer((Answer<User>) i -> i.getArgument(0));
        when(users.existsByUsernameIgnoreCase(anyString())).thenReturn(false);
        when(authService.issueSession(any(), any(), any()))
                .thenReturn(new TokenResponse("access", "refresh", 900));
    }

    // -------------------------------------------------- 6. an unknown identity, provisioning off

    @Test
    void anUnknownIdentityIsRefusedWhenAutoProvisioningIsOff() {
        when(users.findByEmailIgnoreCase("stranger@gmail.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service(false, "USER")
                        .signIn("stranger@gmail.com", "A Stranger", null, "junit", "ip"))
                .isInstanceOf(OAuthSignInRefusedException.class)
                .hasMessageContaining("No PeerDSATracker account");

        verify(users, never()).save(any());
    }

    @Test
    void anUnknownIdentityIsProvisionedOnlyWhenAutoProvisioningIsOn() {
        when(users.findByEmailIgnoreCase("stranger@gmail.com")).thenReturn(Optional.empty());

        service(true, "USER").signIn("stranger@gmail.com", "A Stranger", null, "junit", "ip");

        verify(users).save(any(User.class));
    }

    /** And even then, never with a privileged role -- see the startup check below. */
    @Test
    void anAutoProvisionedAccountGetsTheConfiguredNonPrivilegedRole() {
        when(users.findByEmailIgnoreCase("stranger@gmail.com")).thenReturn(Optional.empty());

        service(true, "USER").signIn("stranger@gmail.com", "A Stranger", null, "junit", "ip");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo("USER");
        // No password at all: it has never had one, and login must cope with that.
        assertThat(saved.getValue().hasPassword()).isFalse();
        // And the generated username is marked unchosen, so the SPA asks before it goes public.
        assertThat(saved.getValue().isUsernameChosen()).isFalse();
    }

    /**
     * The configuration guard, which is what makes the previous test more than a coincidence.
     * Naming a privileged role fails startup rather than provisioning one admin and finding out
     * afterwards.
     */
    @Test
    void configuringAPrivilegedDefaultRoleRefusesToStart() {
        assertThatThrownBy(() -> new OAuthProperties(true, "ADMIN", new OAuthProperties.Google("id", "secret")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must not be privileged");
    }

    @Test
    void configuringAnUnknownDefaultRoleRefusesToStart() {
        assertThatThrownBy(() -> new OAuthProperties(true, "SUPERUSER", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be one of");
    }

    // -------------------------------------------------------- 7. an existing account keeps its role

    @Test
    void anExistingAccountKeepsItsRoleAfterSigningInThroughTheProvider() {
        User admin = AuthTestFixtures.user(1L, "boss@example.com", "boss", "hash");
        admin.setRole("ADMIN");
        when(users.findByEmailIgnoreCase("boss@example.com")).thenReturn(Optional.of(admin));

        service(true, "USER").signIn("boss@example.com", "The Boss", null, "junit", "ip");

        // Not demoted to the provisioning default, and not saved at all: the provider proves who
        // this is, and has no business editing what they may do.
        assertThat(admin.getRole()).isEqualTo("ADMIN");
        verify(users, never()).save(any());
    }

    @Test
    void anExistingOrdinaryAccountIsNotPromotedEither() {
        User ordinary = AuthTestFixtures.user(2L, "user@example.com", "user", "hash");
        when(users.findByEmailIgnoreCase("user@example.com")).thenReturn(Optional.of(ordinary));

        service(true, "ADMIN_WOULD_BE_REFUSED_SO_USE_USER", "USER")
                .signIn("user@example.com", "A User", null, "junit", "ip");

        assertThat(ordinary.getRole()).isEqualTo("USER");
    }

    @Test
    void anExistingAccountKeepsItsPasswordAndUsername() {
        User existing = AuthTestFixtures.user(3L, "user@example.com", "chosen-name", "the-original-hash");
        when(users.findByEmailIgnoreCase("user@example.com")).thenReturn(Optional.of(existing));

        service(true, "USER").signIn("user@example.com", "Different Google Name", null, "junit", "ip");

        assertThat(existing.getUsername()).isEqualTo("chosen-name");
        assertThat(existing.getPasswordHash()).isEqualTo("the-original-hash");
    }

    // ------------------------------------------------------------------ no address, no sign-in

    @Test
    void anIdentityWithNoEmailIsRefused() {
        assertThatThrownBy(() -> service(true, "USER").signIn(null, "No Address", null, "junit", "ip"))
                .isInstanceOf(OAuthSignInRefusedException.class)
                .hasMessageContaining("did not share an email");

        assertThatThrownBy(() -> service(true, "USER").signIn("   ", "No Address", null, "junit", "ip"))
                .isInstanceOf(OAuthSignInRefusedException.class);

        verify(users, never()).save(any());
    }

    // ------------------------------------------------------------------- the generated username

    @Test
    void aProvisionedAccountGetsAUsernameDerivedFromTheAddress() {
        when(users.findByEmailIgnoreCase("aditya.yadav@gmail.com")).thenReturn(Optional.empty());

        service(true, "USER").signIn("aditya.yadav@gmail.com", "Aditya", null, "junit", "ip");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("aditya.yadav");
    }

    @Test
    void aTakenUsernameIsDisambiguatedRatherThanColliding() {
        when(users.findByEmailIgnoreCase("aditya@gmail.com")).thenReturn(Optional.empty());
        when(users.existsByUsernameIgnoreCase("aditya")).thenReturn(true);

        service(true, "USER").signIn("aditya@gmail.com", "Aditya", null, "junit", "ip");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getUsername()).startsWith("aditya.").hasSizeGreaterThan("aditya".length());
    }

    /** Must satisfy the same rules a self-chosen username does, or the insert violates the schema. */
    @Test
    void aGeneratedUsernameIsAlwaysValid() {
        for (String email : new String[] {"a@x.com", "__@x.com", "!!!@x.com", "ünïcödé@x.com",
                "averyveryverylongaddresswellbeyondthirtycharacters@x.com"}) {
            when(users.findByEmailIgnoreCase(email)).thenReturn(Optional.empty());
            UserRepository fresh = mock(UserRepository.class);
            when(fresh.save(any())).thenAnswer((Answer<User>) i -> i.getArgument(0));
            when(fresh.findByEmailIgnoreCase(email)).thenReturn(Optional.empty());
            when(fresh.existsByUsernameIgnoreCase(anyString())).thenReturn(false);

            new OAuthSignInService(fresh, authService, properties(true, "USER"))
                    .signIn(email, null, null, "junit", "ip");

            ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
            verify(fresh).save(saved.capture());
            String username = saved.getValue().getUsername();

            assertThat(username)
                    .as("generated username for %s", email)
                    .matches("^[a-zA-Z0-9._-]+$")
                    .hasSizeBetween(3, 30);
        }
    }

    // ---------------------------------------------------------------------------- helpers

    private OAuthSignInService service(boolean autoProvision, String defaultRole) {
        return new OAuthSignInService(users, authService, properties(autoProvision, defaultRole));
    }

    /** Overload used only to make one test's intent readable; the first argument is ignored. */
    private OAuthSignInService service(boolean autoProvision, String ignored, String defaultRole) {
        return service(autoProvision, defaultRole);
    }

    private static OAuthProperties properties(boolean autoProvision, String defaultRole) {
        return new OAuthProperties(autoProvision, defaultRole, new OAuthProperties.Google("id", "secret"));
    }
}
