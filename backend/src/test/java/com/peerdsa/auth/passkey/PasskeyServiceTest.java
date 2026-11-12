package com.peerdsa.auth.passkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.auth.AuthService;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.DeletePasskeyResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginVerifyRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeyListResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeySummary;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterVerifyRequest;
import com.peerdsa.config.PasskeyProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import com.webauthn4j.converter.AttestationObjectConverter;
import com.webauthn4j.converter.AuthenticatorDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.data.attestation.AttestationObject;
import com.webauthn4j.data.attestation.authenticator.AAGUID;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.authenticator.COSEKey;
import com.webauthn4j.data.attestation.authenticator.EC2COSEKey;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.extension.authenticator.AuthenticationExtensionAuthenticatorOutput;
import com.webauthn4j.data.extension.authenticator.RegistrationExtensionAuthenticatorOutput;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PasskeyServiceTest {

    private static final String ORIGIN = "http://localhost:4300";
    private static final String RP_ID = "localhost";
    private static final Base64.Encoder B64U = Base64.getUrlEncoder().withoutPadding();

    private PasskeyCredentialRepository credentialRepo;
    private PasskeyChallengeRepository challengeRepo;
    private UserRepository userRepo;
    private AuthService authService;
    private PasskeyService passkeyService;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final ObjectConverter webAuthnObjectConverter = new ObjectConverter();
    private final AttestationObjectConverter attestationConverter =
            new AttestationObjectConverter(webAuthnObjectConverter);
    private final AuthenticatorDataConverter authDataConverter =
            new AuthenticatorDataConverter(webAuthnObjectConverter);

    private Map<String, PasskeyChallenge> storedChallenges;
    private Map<String, PasskeyCredential> storedCredentials;

    @BeforeEach
    void setUp() {
        storedChallenges = new ConcurrentHashMap<>();
        storedCredentials = new ConcurrentHashMap<>();

        credentialRepo = mock(PasskeyCredentialRepository.class);
        challengeRepo = mock(PasskeyChallengeRepository.class);
        userRepo = mock(UserRepository.class);
        authService = mock(AuthService.class);

        when(challengeRepo.save(any())).thenAnswer(i -> {
            PasskeyChallenge c = i.getArgument(0);
            storedChallenges.put(c.getId(), c);
            return c;
        });
        when(challengeRepo.findByIdAndCeremony(any(), any())).thenAnswer(i -> {
            PasskeyChallenge c = storedChallenges.get(i.getArgument(0));
            return c != null && c.getCeremony().equals(i.getArgument(1)) ? Optional.of(c) : Optional.empty();
        });

        when(credentialRepo.save(any())).thenAnswer(i -> {
            PasskeyCredential c = i.getArgument(0);
            storedCredentials.put(c.getId(), c);
            return c;
        });
        when(credentialRepo.existsById(any())).thenAnswer(i -> storedCredentials.containsKey(i.getArgument(0)));
        when(credentialRepo.findById(any())).thenAnswer(i -> Optional.ofNullable(storedCredentials.get(i.getArgument(0))));
        when(credentialRepo.findByUserIdOrderByRegisteredAtDesc(any())).thenAnswer(i -> {
            Long uid = i.getArgument(0);
            return storedCredentials.values().stream()
                    .filter(c -> c.getUserId().equals(uid))
                    .toList();
        });
        when(credentialRepo.findFirstByUserIdOrderByRegisteredAtAsc(any())).thenAnswer(i -> {
            Long uid = i.getArgument(0);
            return storedCredentials.values().stream()
                    .filter(c -> c.getUserId().equals(uid))
                    .findFirst();
        });
        when(credentialRepo.findByIdAndUserId(any(), any())).thenAnswer(i -> {
            PasskeyCredential c = storedCredentials.get(i.getArgument(0));
            return c != null && c.getUserId().equals(i.getArgument(1)) ? Optional.of(c) : Optional.empty();
        });
        doAnswer(i -> {
                    PasskeyCredential c = i.getArgument(0);
                    storedCredentials.remove(c.getId());
                    return null;
                })
                .when(credentialRepo)
                .delete(any());

        PasskeyProperties props = new PasskeyProperties("PeerDSATracker", "", List.of(), Duration.ofMinutes(5));
        passkeyService = new PasskeyService(
                credentialRepo,
                challengeRepo,
                userRepo,
                authService,
                props,
                objectMapper,
                List.of(ORIGIN));
    }

    @Test
    void registrationAndAuthenticationRoundTripVerifyCryptographicallyAndIssueSession() throws Exception {
        User user = testUser(42L, "ada@example.com", "ada");
        when(userRepo.findById(42L)).thenReturn(Optional.of(user));
        TokenResponse expectedSession = new TokenResponse("access-jwt", "refresh-opaque", 900L);
        when(authService.issueSession(user, "TestAgent", "127.0.0.1")).thenReturn(expectedSession);

        // 1. Registration options
        RegisterOptionsResponse regOptions = passkeyService.registrationOptions(user, true, ORIGIN, RP_ID);
        assertThat(regOptions.publicKey().rp().id()).isEqualTo(RP_ID);
        assertThat(regOptions.publicKey().challenge()).doesNotContain("=");
        assertThat(regOptions.publicKey().user().id()).doesNotContain("=");
        assertThat(regOptions.publicKey().authenticatorSelection().residentKey()).isEqualTo("required");
        assertThat(regOptions.publicKey().authenticatorSelection().requireResidentKey()).isTrue();
        assertThat(regOptions.publicKey().authenticatorSelection().authenticatorAttachment()).isEqualTo("platform");

        // 2. Synthesize authenticator key pair & attestation response
        KeyPair kp = generateEcKeyPair();
        byte[] credId = new byte[32];
        for (int i = 0; i < credId.length; i++) credId[i] = (byte) (i + 1);
        String credIdB64 = B64U.encodeToString(credId);
        UUID aaguidUuid = UUID.fromString("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4");

        JsonNode registrationCredential = buildRegistrationResponseJson(
                regOptions.publicKey().challenge(), credId, credIdB64, aaguidUuid, kp);

        PasskeySummary summary = passkeyService.verifyRegistration(
                user, new RegisterVerifyRequest(regOptions.challengeId(), registrationCredential, "Pixel Fingerprint"));

        assertThat(summary.id()).isEqualTo(credIdB64);
        assertThat(summary.name()).isEqualTo("Pixel Fingerprint");
        assertThat(summary.aaguid()).isEqualTo(aaguidUuid.toString());
        assertThat(summary.deviceType()).isEqualTo("multiDevice");
        assertThat(summary.backedUp()).isTrue();
        assertThat(summary.transports()).containsExactly("internal");

        // 3. Replaying registration challenge is rejected
        assertThatThrownBy(() -> passkeyService.verifyRegistration(
                        user, new RegisterVerifyRequest(regOptions.challengeId(), registrationCredential, "Dup")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        // 4. Subsequent registration options include existing credential in excludeCredentials
        RegisterOptionsResponse secondOptions = passkeyService.registrationOptions(user, false, ORIGIN, RP_ID);
        assertThat(secondOptions.publicKey().authenticatorSelection().authenticatorAttachment()).isNull();
        assertThat(secondOptions.publicKey().excludeCredentials()).hasSize(1);
        assertThat(secondOptions.publicKey().excludeCredentials().get(0).id()).isEqualTo(credIdB64);

        // 5. Authentication options & assertion verification
        LoginOptionsResponse loginOptions = passkeyService.authenticationOptions(ORIGIN, RP_ID);
        assertThat(loginOptions.publicKey().rpId()).isEqualTo(RP_ID);
        assertThat(loginOptions.publicKey().allowCredentials()).isEmpty();

        byte[] userHandleBytes = Base64.getUrlDecoder().decode(regOptions.publicKey().user().id());
        JsonNode assertionJson = buildAssertionResponseJson(
                loginOptions.publicKey().challenge(), credIdB64, userHandleBytes, kp, 5L);

        TokenResponse session = passkeyService.verifyAuthentication(
                new LoginVerifyRequest(loginOptions.challengeId(), assertionJson), "TestAgent", "127.0.0.1");

        assertThat(session).isEqualTo(expectedSession);
        assertThat(storedCredentials.get(credIdB64).getSignCount()).isEqualTo(5L);
        assertThat(storedCredentials.get(credIdB64).getLastUsedAt()).isNotNull();
    }

    @Test
    void unknownCredentialReturns404ForSignalUnknownCredential() throws Exception {
        LoginOptionsResponse loginOptions = passkeyService.authenticationOptions(ORIGIN, RP_ID);
        KeyPair kp = generateEcKeyPair();
        JsonNode unknownAssertion = buildAssertionResponseJson(
                loginOptions.publicKey().challenge(), "unknownCredId1234", null, kp, 1L);

        assertThatThrownBy(() -> passkeyService.verifyAuthentication(
                        new LoginVerifyRequest(loginOptions.challengeId(), unknownAssertion), "UA", "127.0.0.1"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void rejectsUntrustedOrigin() {
        User user = testUser(1L, "u@example.com", "user");
        assertThatThrownBy(() -> passkeyService.registrationOptions(user, false, "https://attacker.example", null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void listRenameAndDeleteEnforceOwnership() {
        User owner = testUser(10L, "owner@example.com", "owner");
        User intruder = testUser(11L, "other@example.com", "other");
        storedCredentials.put(
                "cred-1",
                new PasskeyCredential(
                        "cred-1",
                        10L,
                        "userHandle10",
                        "dummyData",
                        1L,
                        AAGUID.ZERO.getValue().toString(),
                        "MacBook",
                        "multiDevice",
                        true,
                        true,
                        "internal,hybrid",
                        RP_ID,
                        Instant.now()));

        PasskeyListResponse list = passkeyService.listForUser(owner, ORIGIN, RP_ID);
        assertThat(list.rpId()).isEqualTo(RP_ID);
        assertThat(list.passkeyUserId()).isEqualTo("userHandle10");
        assertThat(list.credentials()).hasSize(1);

        assertThatThrownBy(() -> passkeyService.renameCredential(intruder, "cred-1", "Hacked"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        PasskeySummary renamed = passkeyService.renameCredential(owner, "cred-1", "Work MacBook");
        assertThat(renamed.name()).isEqualTo("Work MacBook");

        DeletePasskeyResponse deleted = passkeyService.deleteCredential(owner, "cred-1", ORIGIN, RP_ID);
        assertThat(deleted.rpId()).isEqualTo(RP_ID);
        assertThat(deleted.passkeyUserId()).isEqualTo("userHandle10");
        assertThat(deleted.remainingCredentialIds()).isEmpty();
        verify(credentialRepo).delete(any(PasskeyCredential.class));
    }

    // ---------------------------------------------------------------------------- helpers

    private static User testUser(long id, String email, String username) {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", id);
        user.setEmail(email);
        user.setUsername(username);
        user.setDisplayName(username);
        return user;
    }

    private static KeyPair generateEcKeyPair() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        return kpg.generateKeyPair();
    }

    private JsonNode buildRegistrationResponseJson(
            String challengeB64, byte[] credId, String credIdB64, UUID aaguidUuid, KeyPair kp) throws Exception {
        byte[] rpIdHash = MessageDigest.getInstance("SHA-256").digest(RP_ID.getBytes(StandardCharsets.UTF_8));
        COSEKey coseKey = EC2COSEKey.create((ECPublicKey) kp.getPublic(), COSEAlgorithmIdentifier.ES256);
        AttestedCredentialData attested = new AttestedCredentialData(new AAGUID(aaguidUuid), credId, coseKey);
        byte flags = (byte) (AuthenticatorData.BIT_UP
                | AuthenticatorData.BIT_UV
                | AuthenticatorData.BIT_BE
                | AuthenticatorData.BIT_BS
                | AuthenticatorData.BIT_AT);
        AuthenticatorData<RegistrationExtensionAuthenticatorOutput> authData =
                new AuthenticatorData<>(rpIdHash, flags, 1L, attested);
        AttestationObject attObj = new AttestationObject(authData, new NoneAttestationStatement());
        byte[] attObjBytes = attestationConverter.convertToBytes(attObj);

        String clientDataJson =
                "{\"type\":\"webauthn.create\",\"challenge\":\"" + challengeB64 + "\",\"origin\":\"" + ORIGIN + "\"}";
        String clientDataB64 = B64U.encodeToString(clientDataJson.getBytes(StandardCharsets.UTF_8));

        Map<String, Object> payload = Map.of(
                "id", credIdB64,
                "rawId", credIdB64,
                "type", "public-key",
                "response", Map.of(
                        "clientDataJSON", clientDataB64,
                        "attestationObject", B64U.encodeToString(attObjBytes),
                        "transports", List.of("internal")),
                "clientExtensionResults", Map.of());
        return objectMapper.valueToTree(payload);
    }

    private JsonNode buildAssertionResponseJson(
            String challengeB64, String credIdB64, byte[] userHandle, KeyPair kp, long signCount) throws Exception {
        byte[] rpIdHash = MessageDigest.getInstance("SHA-256").digest(RP_ID.getBytes(StandardCharsets.UTF_8));
        byte flags = (byte) (AuthenticatorData.BIT_UP | AuthenticatorData.BIT_UV | AuthenticatorData.BIT_BE | AuthenticatorData.BIT_BS);
        AuthenticatorData<AuthenticationExtensionAuthenticatorOutput> authData =
                new AuthenticatorData<>(rpIdHash, flags, signCount);
        byte[] authDataBytes = authDataConverter.convert(authData);

        String clientDataJson =
                "{\"type\":\"webauthn.get\",\"challenge\":\"" + challengeB64 + "\",\"origin\":\"" + ORIGIN + "\"}";
        byte[] clientDataBytes = clientDataJson.getBytes(StandardCharsets.UTF_8);
        byte[] clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataBytes);

        byte[] signedData = new byte[authDataBytes.length + clientDataHash.length];
        System.arraycopy(authDataBytes, 0, signedData, 0, authDataBytes.length);
        System.arraycopy(clientDataHash, 0, signedData, authDataBytes.length, clientDataHash.length);

        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(kp.getPrivate());
        sig.update(signedData);
        byte[] sigBytes = sig.sign();

        Map<String, Object> responseMap = userHandle == null
                ? Map.of(
                        "clientDataJSON", B64U.encodeToString(clientDataBytes),
                        "authenticatorData", B64U.encodeToString(authDataBytes),
                        "signature", B64U.encodeToString(sigBytes))
                : Map.of(
                        "clientDataJSON", B64U.encodeToString(clientDataBytes),
                        "authenticatorData", B64U.encodeToString(authDataBytes),
                        "signature", B64U.encodeToString(sigBytes),
                        "userHandle", B64U.encodeToString(userHandle));

        return objectMapper.valueToTree(Map.of(
                "id", credIdB64,
                "rawId", credIdB64,
                "type", "public-key",
                "response", responseMap,
                "clientExtensionResults", Map.of()));
    }
}
