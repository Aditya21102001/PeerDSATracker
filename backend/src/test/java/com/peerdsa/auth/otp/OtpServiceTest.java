package com.peerdsa.auth.otp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.Tokens;
import com.peerdsa.config.OtpProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * The demo-mode discipline, which is the whole reason this class is worth testing.
 *
 * <p>Demo mode returns the code in the HTTP response so the flow works with no mail provider. The
 * implementation that looks natural --
 *
 * <pre>{@code if (!demoMode && delivery.send(...)) return null; return code; }</pre>
 *
 * -- also returns it whenever delivery fails, which hands a working credential to anyone who can
 * make a send fail. Asking for a code for an address the provider rejects is enough. These tests
 * pin that the two are separate branches and that a failure yields nothing at all.
 */
class OtpServiceTest {

    private static final String EMAIL = "aditya@example.com";

    private OtpCodeRepository codes;
    private UserRepository users;
    private OtpDelivery delivery;

    @BeforeEach
    void setUp() {
        codes = mock(OtpCodeRepository.class);
        users = mock(UserRepository.class);
        delivery = mock(OtpDelivery.class);

        when(codes.save(any())).thenAnswer((Answer<OtpCode>) i -> i.getArgument(0));
        when(codes.countByEmailAndCreatedAtAfter(anyString(), any())).thenReturn(0L);
        when(users.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(user()));
    }

    // ------------------------------------------------------------------- 4. only in demo mode

    @Test
    void demoModeReturnsTheCodeAndSendsNothing() {
        String code = service(true).requestCode(EMAIL);

        assertThat(code).hasSize(6).containsOnlyDigits();
        // Not merely "did not succeed": delivery is never attempted at all in demo mode.
        verify(delivery, never()).send(anyString(), anyString());
    }

    @Test
    void withDemoModeOffASuccessfulSendReturnsNothing() {
        when(delivery.send(eq(EMAIL), anyString())).thenReturn(true);

        assertThat(service(false).requestCode(EMAIL)).isNull();
        verify(delivery).send(eq(EMAIL), anyString());
    }

    /**
     * The trap, pinned. A failed send must not fall through to the demo-mode return. If this ever
     * regresses, anyone who can provoke a delivery failure -- by asking for a code for an address
     * the provider will not accept -- reads a working credential straight out of the response.
     */
    @Test
    void aDeliveryFailureReturnsNoCodeAndAnswers503() {
        when(delivery.send(eq(EMAIL), anyString())).thenReturn(false);

        assertThatThrownBy(() -> service(false).requestCode(EMAIL))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    /** And the code it was about to promise is destroyed, not left live for nobody to receive. */
    @Test
    void aDeliveryFailureDestroysTheStoredCode() {
        when(delivery.send(eq(EMAIL), anyString())).thenReturn(false);

        assertThatThrownBy(() -> service(false).requestCode(EMAIL))
                .isInstanceOf(ResponseStatusException.class);

        verify(codes).delete(any(OtpCode.class));
    }

    // -------------------------------------------------------------------------- storage rules

    @Test
    void onlyTheHashOfTheCodeIsEverStored() {
        String code = service(true).requestCode(EMAIL);

        ArgumentCaptor<OtpCode> saved = ArgumentCaptor.forClass(OtpCode.class);
        verify(codes).save(saved.capture());

        assertThat(saved.getValue().getCodeHash()).isEqualTo(Tokens.sha256(code)).isNotEqualTo(code);
    }

    @Test
    void issuingANewCodeSupersedesTheOutstandingOne() {
        service(true).requestCode(EMAIL);

        verify(codes).supersedeOutstanding(EMAIL);
    }

    @Test
    void theAddressIsNormalisedBeforeItIsStoredOrCounted() {
        service(true).requestCode("  Aditya@Example.COM  ");

        verify(codes).countByEmailAndCreatedAtAfter(eq(EMAIL), any());
    }

    // ------------------------------------------------------------ rate limiting, and enumeration

    @Test
    void anAddressOverItsHourlyBudgetIsRefusedWith429() {
        when(codes.countByEmailAndCreatedAtAfter(eq(EMAIL), any())).thenReturn(5L);

        assertThatThrownBy(() -> service(true).requestCode(EMAIL))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    /**
     * An address with no account still records the request, so it is throttled exactly like a
     * registered one. Otherwise only real accounts could ever hit the limit, and a 429 would mean
     * "this address is registered" -- the rate limit itself becomes an enumeration oracle.
     */
    @Test
    void aRequestForAnUnregisteredAddressStillCountsTowardsTheRateLimit() {
        when(users.findByEmailIgnoreCase("stranger@example.com")).thenReturn(Optional.empty());

        assertThat(service(true).requestCode("stranger@example.com")).isNull();

        ArgumentCaptor<OtpCode> saved = ArgumentCaptor.forClass(OtpCode.class);
        verify(codes).save(saved.capture());
        // Recorded, but with no secret in it: there is no account for a code to resolve to.
        assertThat(saved.getValue().getCodeHash()).isNull();
        verify(delivery, never()).send(anyString(), anyString());
    }

    @Test
    void theRateLimitIsCheckedBeforeTheAccountIsLookedUp() {
        when(codes.countByEmailAndCreatedAtAfter(anyString(), any())).thenReturn(5L);

        assertThatThrownBy(() -> service(true).requestCode("stranger@example.com"))
                .isInstanceOf(ResponseStatusException.class);

        verify(users, never()).findByEmailIgnoreCase(anyString());
    }

    // ------------------------------------------------------------------------ verification

    @Test
    void aValidCodeResolvesTheAccountFromTheAddressItWasIssuedTo() {
        String code = "123456";
        OtpCode row = live(EMAIL, code);
        when(codes.findByEmailAndCodeHash(EMAIL, Tokens.sha256(code))).thenReturn(Optional.of(row));

        User signedIn = service(true).verifyForSignIn(EMAIL, code);

        assertThat(signedIn.getEmail()).isEqualTo(EMAIL);
    }

    @Test
    void aCodeIsSingleUse() {
        String code = "123456";
        OtpCode row = live(EMAIL, code);
        when(codes.findByEmailAndCodeHash(EMAIL, Tokens.sha256(code))).thenReturn(Optional.of(row));

        service(true).verifyForSignIn(EMAIL, code);

        // The hash is gone, so the same row can never match again.
        assertThat(row.getCodeHash()).isNull();
        assertThat(row.isUsable(Instant.now())).isFalse();
    }

    @Test
    void anExpiredCodeIsRefused() {
        String code = "123456";
        OtpCode expired = OtpCode.issued(EMAIL, Tokens.sha256(code), Instant.now().minusSeconds(1));
        when(codes.findByEmailAndCodeHash(EMAIL, Tokens.sha256(code))).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service(true).verifyForSignIn(EMAIL, code))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    /**
     * A code proves control of the address it was sent to. Matching on the hash alone would let a
     * code mailed to one address verify against another that happened to hold the same digits.
     */
    @Test
    void aCodeIssuedToOneAddressDoesNotVerifyAgainstAnother() {
        String code = "123456";
        when(codes.findByEmailAndCodeHash("victim@example.com", Tokens.sha256(code)))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service(true).verifyForSignIn("victim@example.com", code))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void aBlankCodeIsRefusedWithoutTouchingTheDatabase() {
        assertThatThrownBy(() -> service(true).verifyForSignIn(EMAIL, "   "))
                .isInstanceOf(ResponseStatusException.class);

        verify(codes, never()).findByEmailAndCodeHash(anyString(), anyString());
    }

    // ---------------------------------------------------------------------------- helpers

    private OtpService service(boolean demoMode) {
        OtpProperties properties = new OtpProperties(
                demoMode,
                Duration.ofMinutes(10),
                6,
                5,
                new OtpProperties.Email("brevo", "key", "sender@example.com", "PeerDSA", "https://x/y"));
        return new OtpService(codes, users, delivery, properties);
    }

    private static OtpCode live(String email, String code) {
        return OtpCode.issued(email, Tokens.sha256(code), Instant.now().plusSeconds(600));
    }

    private static User user() {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", 7L);
        user.setEmail(EMAIL);
        user.setUsername("aditya");
        return user;
    }
}
