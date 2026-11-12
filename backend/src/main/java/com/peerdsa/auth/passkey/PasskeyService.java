package com.peerdsa.auth.passkey;

import com.peerdsa.auth.AuthService;
import com.peerdsa.auth.dto.AuthDtos.TokenResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.AuthenticatorSelection;
import com.peerdsa.auth.passkey.PasskeyDtos.CreationOptionsPublicKey;
import com.peerdsa.auth.passkey.PasskeyDtos.CredentialDescriptor;
import com.peerdsa.auth.passkey.PasskeyDtos.DeletePasskeyResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.LoginVerifyRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeyListResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.PasskeySummary;
import com.peerdsa.auth.passkey.PasskeyDtos.PubKeyCredParam;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterOptionsResponse;
import com.peerdsa.auth.passkey.PasskeyDtos.RegisterVerifyRequest;
import com.peerdsa.auth.passkey.PasskeyDtos.RequestOptionsPublicKey;
import com.peerdsa.auth.passkey.PasskeyDtos.RpInfo;
import com.peerdsa.auth.passkey.PasskeyDtos.UserInfo;
import com.peerdsa.config.PasskeyProperties;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.exception.DataConversionException;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecord;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticatorTransport;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.attestation.authenticator.AAGUID;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import com.webauthn4j.verifier.exception.VerificationException;
import java.net.URI;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrates WebAuthn passkey registration, discoverable/conditional sign-in, and credential
 * management on top of {@link WebAuthnManager}.
 */
@Service
public class PasskeyService {

    private static final String USER_VERIFICATION_PREFERRED = "preferred";
    private static final String DEVICE_MULTI = "multiDevice";
    private static final String DEVICE_SINGLE = "singleDevice";
    private static final Base64.Encoder B64U_ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64U_DEC = Base64.getUrlDecoder();

    private static final List<PubKeyCredParam> SUPPORTED_ALGS = List.of(
            new PubKeyCredParam("public-key", COSEAlgorithmIdentifier.ES256.getValue()),
            new PubKeyCredParam("public-key", COSEAlgorithmIdentifier.RS256.getValue()),
            new PubKeyCredParam("public-key", COSEAlgorithmIdentifier.EdDSA.getValue()));

    private static final List<PublicKeyCredentialParameters> WEBAUTHN_CRED_PARAMS = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.RS256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.EdDSA));

    private final PasskeyCredentialRepository credentialRepo;
    private final PasskeyChallengeRepository challengeRepo;
    private final UserRepository userRepo;
    private final AuthService authService;
    private final PasskeyProperties properties;
    private final ObjectMapper jsonMapper;
    private final Set<String> trustedOrigins;

    private final SecureRandom random = new SecureRandom();
    private final ObjectConverter webAuthnObjectConverter = new ObjectConverter();
    private final WebAuthnManager webAuthnManager =
            WebAuthnManager.createNonStrictWebAuthnManager(webAuthnObjectConverter);
    private final AttestedCredentialDataConverter attestedDataConverter =
            new AttestedCredentialDataConverter(webAuthnObjectConverter);

    public PasskeyService(
            PasskeyCredentialRepository credentialRepo,
            PasskeyChallengeRepository challengeRepo,
            UserRepository userRepo,
            AuthService authService,
            PasskeyProperties properties,
            ObjectMapper jsonMapper,
            @Value("${app.cors.allowed-origins:}") List<String> corsAllowedOrigins) {
        this.credentialRepo = credentialRepo;
        this.challengeRepo = challengeRepo;
        this.userRepo = userRepo;
        this.authService = authService;
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.trustedOrigins = buildTrustedOrigins(corsAllowedOrigins, properties.allowedOrigins());
    }

    /** Generates registration options (`navigator.credentials.create`) and persists a single-use challenge. */
    @Transactional
    public RegisterOptionsResponse registrationOptions(
            User user, boolean promotion, String requestOrigin, String fallbackHost) {
        OriginContext ctx = resolveCeremonyOrigin(requestOrigin, fallbackHost);
        Instant now = Instant.now();
        challengeRepo.deleteExpired(now);

        List<PasskeyCredential> existing = credentialRepo.findByUserIdOrderByRegisteredAtDesc(user.getId());
        String passkeyUserId = existing.stream()
                .map(PasskeyCredential::getPasskeyUserId)
                .findFirst()
                .orElseGet(() -> B64U_ENC.encodeToString(randomBytes(32)));

        byte[] challengeBytes = randomBytes(32);
        String challengeB64 = B64U_ENC.encodeToString(challengeBytes);
        String challengeId = UUID.randomUUID().toString();

        challengeRepo.save(new PasskeyChallenge(
                challengeId,
                user.getId(),
                passkeyUserId,
                challengeB64,
                PasskeyChallenge.CEREMONY_REGISTRATION,
                USER_VERIFICATION_PREFERRED,
                ctx.rpId(),
                ctx.origin(),
                now.plus(properties.challengeTtl())));

        List<CredentialDescriptor> excludes = existing.stream()
                .map(c -> new CredentialDescriptor(
                        c.getId(),
                        "public-key",
                        parseTransportsList(c.getTransports()).isEmpty()
                                ? null
                                : parseTransportsList(c.getTransports())))
                .toList();

        String accountName = firstNonBlank(user.getUsername(), user.getEmail(), "user-" + user.getId());
        String displayName = firstNonBlank(user.getDisplayName(), user.getUsername(), user.getEmail(), accountName);

        CreationOptionsPublicKey publicKey = new CreationOptionsPublicKey(
                challengeB64,
                new RpInfo(properties.rpName(), ctx.rpId()),
                new UserInfo(passkeyUserId, accountName, displayName),
                SUPPORTED_ALGS,
                properties.challengeTtl().toMillis(),
                excludes,
                new AuthenticatorSelection(
                        promotion ? "platform" : null,
                        "required",
                        true,
                        USER_VERIFICATION_PREFERRED),
                "none");

        return new RegisterOptionsResponse(challengeId, publicKey);
    }

    /** Verifies the registration response, stores the credential, and returns the new summary. */
    @Transactional
    public PasskeySummary verifyRegistration(User user, RegisterVerifyRequest request) {
        PasskeyChallenge challenge = consumeChallenge(
                request.challengeId(), PasskeyChallenge.CEREMONY_REGISTRATION, user.getId());

        String credentialJson = serializeJson(request.credential());
        ServerProperty serverProperty = serverPropertyFor(challenge);

        // userVerification="preferred" only requires UV if the options requested "required".
        boolean requireUv = "required".equalsIgnoreCase(challenge.getExpectedUserVerification());
        RegistrationParameters params =
                new RegistrationParameters(serverProperty, WEBAUTHN_CRED_PARAMS, requireUv, true);

        RegistrationData verified;
        try {
            verified = webAuthnManager.verifyRegistrationResponseJSON(credentialJson, params);
        } catch (DataConversionException | VerificationException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Passkey registration could not be verified");
        }

        AttestedCredentialData attested =
                verified.getAttestationObject().getAuthenticatorData().getAttestedCredentialData();
        if (attested == null || attested.getCredentialId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Authenticator did not return a credential ID");
        }

        String credentialId = B64U_ENC.encodeToString(attested.getCredentialId());
        if (credentialRepo.existsById(credentialId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This passkey is already registered");
        }

        AuthenticatorData<?> authData = verified.getAttestationObject().getAuthenticatorData();
        AAGUID aaguidObj = attested.getAaguid();
        String aaguid = aaguidObj != null ? aaguidObj.getValue().toString() : AAGUID.ZERO.getValue().toString();
        String attestedDataB64 = B64U_ENC.encodeToString(attestedDataConverter.convert(attested));
        String transports = verified.getTransports() == null
                ? ""
                : verified.getTransports().stream()
                        .map(AuthenticatorTransport::getValue)
                        .sorted()
                        .collect(Collectors.joining(","));

        String passkeyUserId = firstNonBlank(
                challenge.getPasskeyUserId(),
                credentialRepo
                        .findFirstByUserIdOrderByRegisteredAtAsc(user.getId())
                        .map(PasskeyCredential::getPasskeyUserId)
                        .orElse(null),
                B64U_ENC.encodeToString(randomBytes(32)));

        String friendlyName = normalizeName(request.name());
        if (friendlyName == null) {
            friendlyName = defaultCredentialName(authData.isFlagBE(), transports);
        }

        PasskeyCredential saved = credentialRepo.save(new PasskeyCredential(
                credentialId,
                user.getId(),
                passkeyUserId,
                attestedDataB64,
                authData.getSignCount(),
                aaguid,
                friendlyName,
                authData.isFlagBE() ? DEVICE_MULTI : DEVICE_SINGLE,
                authData.isFlagBS(),
                authData.isFlagUV(),
                transports,
                challenge.getRpId(),
                Instant.now()));

        return toSummary(saved);
    }

    /** Generates discoverable-credential request options for sign-in (modal & Conditional UI). */
    @Transactional
    public LoginOptionsResponse authenticationOptions(String requestOrigin, String fallbackHost) {
        OriginContext ctx = resolveCeremonyOrigin(requestOrigin, fallbackHost);
        Instant now = Instant.now();
        challengeRepo.deleteExpired(now);

        byte[] challengeBytes = randomBytes(32);
        String challengeB64 = B64U_ENC.encodeToString(challengeBytes);
        String challengeId = UUID.randomUUID().toString();

        challengeRepo.save(new PasskeyChallenge(
                challengeId,
                null,
                null,
                challengeB64,
                PasskeyChallenge.CEREMONY_AUTHENTICATION,
                USER_VERIFICATION_PREFERRED,
                ctx.rpId(),
                ctx.origin(),
                now.plus(properties.challengeTtl())));

        RequestOptionsPublicKey publicKey = new RequestOptionsPublicKey(
                challengeB64,
                ctx.rpId(),
                properties.challengeTtl().toMillis(),
                List.of(),
                USER_VERIFICATION_PREFERRED);

        return new LoginOptionsResponse(challengeId, publicKey);
    }

    /**
     * Verifies an authentication assertion and issues a standard PeerDSATracker session.
     *
     * <p>Returns HTTP 404 when the presented credential ID is unknown in storage so clients can
     * notify password managers via {@code PublicKeyCredential.signalUnknownCredential}.
     */
    @Transactional
    public TokenResponse verifyAuthentication(LoginVerifyRequest request, String userAgent, String ip) {
        PasskeyChallenge challenge =
                consumeChallenge(request.challengeId(), PasskeyChallenge.CEREMONY_AUTHENTICATION, null);

        String credentialId = request.credential().path("id").asString("");
        if (credentialId.isBlank()) {
            credentialId = request.credential().path("rawId").asString("");
        }
        if (credentialId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing credential id");
        }

        PasskeyCredential stored = credentialRepo
                .findById(credentialId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Passkey was deleted or is no longer registered"));

        User user = userRepo
                .findById(stored.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account no longer exists"));

        CredentialRecord record = toCredentialRecord(stored);
        ServerProperty serverProperty = serverPropertyFor(challenge);

        boolean requireUv = "required".equalsIgnoreCase(challenge.getExpectedUserVerification());
        AuthenticationParameters params =
                new AuthenticationParameters(serverProperty, record, null, requireUv, true);

        AuthenticationData verified;
        try {
            verified = webAuthnManager.verifyAuthenticationResponseJSON(serializeJson(request.credential()), params);
        } catch (DataConversionException | VerificationException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Biometric verification failed");
        }

        byte[] assertedHandle = verified.getUserHandle();
        if (assertedHandle != null && assertedHandle.length > 0) {
            String assertedHandleB64 = B64U_ENC.encodeToString(assertedHandle);
            if (!stored.getPasskeyUserId().equals(assertedHandleB64)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credential handle mismatch");
            }
        }

        AuthenticatorData<?> authData = verified.getAuthenticatorData();
        stored.setSignCount(authData.getSignCount());
        stored.setBackedUp(authData.isFlagBS());
        stored.setDeviceType(authData.isFlagBE() ? DEVICE_MULTI : DEVICE_SINGLE);
        stored.setUvInitialized(stored.isUvInitialized() || authData.isFlagUV());
        stored.setLastUsedAt(Instant.now());
        credentialRepo.save(stored);

        return authService.issueSession(user, userAgent, ip);
    }

    /** Lists all passkeys for the signed-in user along with RP metadata for Signal API sync. */
    @Transactional(readOnly = true)
    public PasskeyListResponse listForUser(User user, String requestOrigin, String fallbackHost) {
        List<PasskeyCredential> creds = credentialRepo.findByUserIdOrderByRegisteredAtDesc(user.getId());
        String rpId = resolveRpIdForRead(creds, requestOrigin, fallbackHost);
        String passkeyUserId = creds.stream()
                .map(PasskeyCredential::getPasskeyUserId)
                .findFirst()
                .orElse(null);

        return new PasskeyListResponse(
                rpId,
                passkeyUserId,
                creds.stream().map(PasskeyService::toSummary).toList());
    }

    /** Renames a passkey owned by the user (metadata only; does not alter WebAuthn key material). */
    @Transactional
    public PasskeySummary renameCredential(User user, String credentialId, String rawName) {
        String name = normalizeName(rawName);
        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Passkey name cannot be blank");
        }

        PasskeyCredential credential = credentialRepo
                .findByIdAndUserId(credentialId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Passkey not found"));

        credential.setName(name);
        return toSummary(credentialRepo.save(credential));
    }

    /** Deletes a passkey owned by the user and returns the remaining IDs for Signal API sync. */
    @Transactional
    public DeletePasskeyResponse deleteCredential(
            User user, String credentialId, String requestOrigin, String fallbackHost) {
        PasskeyCredential target = credentialRepo
                .findByIdAndUserId(credentialId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Passkey not found"));

        String passkeyUserId = target.getPasskeyUserId();
        String rpId = target.getRpId();
        credentialRepo.delete(target);

        List<String> remaining = credentialRepo.findByUserIdOrderByRegisteredAtDesc(user.getId()).stream()
                .map(PasskeyCredential::getId)
                .toList();

        String resolvedRpId = (rpId != null && !rpId.isBlank())
                ? rpId
                : resolveRpIdForRead(List.of(), requestOrigin, fallbackHost);

        return new DeletePasskeyResponse(resolvedRpId, passkeyUserId, remaining);
    }

    // ---------------------------------------------------------------------------- helpers

    private PasskeyChallenge consumeChallenge(String challengeId, String ceremony, Long expectedUserId) {
        PasskeyChallenge challenge = challengeRepo
                .findByIdAndCeremony(challengeId, ceremony)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Challenge not found"));

        if (challenge.isConsumed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Challenge has already been used");
        }
        if (challenge.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Challenge expired, please try again");
        }
        if (expectedUserId != null && !expectedUserId.equals(challenge.getUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Challenge does not belong to this account");
        }

        challenge.setConsumed(true);
        return challengeRepo.save(challenge);
    }

    private ServerProperty serverPropertyFor(PasskeyChallenge challenge) {
        return new ServerProperty(
                Origin.create(challenge.getOrigin()),
                challenge.getRpId(),
                new DefaultChallenge(B64U_DEC.decode(challenge.getChallengeB64())));
    }

    private CredentialRecord toCredentialRecord(PasskeyCredential stored) {
        AttestedCredentialData attestedData =
                attestedDataConverter.convert(B64U_DEC.decode(stored.getAttestedCredentialDataB64()));
        Set<AuthenticatorTransport> transports = parseTransportsList(stored.getTransports()).stream()
                .map(AuthenticatorTransport::create)
                .collect(Collectors.toSet());

        return new CredentialRecordImpl(
                null,
                stored.isUvInitialized(),
                DEVICE_MULTI.equals(stored.getDeviceType()),
                stored.isBackedUp(),
                stored.getSignCount(),
                attestedData,
                null,
                null,
                null,
                transports);
    }

    private OriginContext resolveCeremonyOrigin(String requestOrigin, String fallbackHost) {
        String normalizedOrigin = normalizeOrigin(requestOrigin);
        if (normalizedOrigin == null && fallbackHost != null && !fallbackHost.isBlank()) {
            String hostOnly = fallbackHost.split(",")[0].trim();
            String scheme = isLoopbackHost(stripPort(hostOnly)) ? "http://" : "https://";
            normalizedOrigin = normalizeOrigin(scheme + hostOnly);
        }

        if (normalizedOrigin == null || !isTrustedOrigin(normalizedOrigin)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Untrusted WebAuthn origin");
        }

        URI uri = URI.create(normalizedOrigin);
        String originHost = uri.getHost().toLowerCase(Locale.ROOT);
        String rpId = resolveRpId(originHost);
        return new OriginContext(normalizedOrigin, rpId);
    }

    private String resolveRpIdForRead(
            List<PasskeyCredential> creds, String requestOrigin, String fallbackHost) {
        if (properties.rpId() != null && !properties.rpId().isBlank()) {
            return properties.rpId().trim().toLowerCase(Locale.ROOT);
        }
        String normalizedOrigin = normalizeOrigin(requestOrigin);
        if (normalizedOrigin != null && isTrustedOrigin(normalizedOrigin)) {
            return URI.create(normalizedOrigin).getHost().toLowerCase(Locale.ROOT);
        }
        if (!creds.isEmpty() && creds.get(0).getRpId() != null && !creds.get(0).getRpId().isBlank()) {
            return creds.get(0).getRpId();
        }
        if (fallbackHost != null && !fallbackHost.isBlank()) {
            return stripPort(fallbackHost.split(",")[0].trim()).toLowerCase(Locale.ROOT);
        }
        return trustedOrigins.stream()
                .map(o -> URI.create(o).getHost().toLowerCase(Locale.ROOT))
                .findFirst()
                .orElse("localhost");
    }

    private String resolveRpId(String originHost) {
        String configured = properties.rpId();
        if (configured != null && !configured.isBlank()) {
            String expected = configured.trim().toLowerCase(Locale.ROOT);
            if (!originHost.equals(expected) && !originHost.endsWith("." + expected)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Origin does not match configured RP ID");
            }
            return expected;
        }
        return originHost;
    }

    private boolean isTrustedOrigin(String origin) {
        if (trustedOrigins.contains(origin)) {
            return true;
        }
        URI uri = URI.create(origin);
        String host = uri.getHost();
        if (host == null) {
            return false;
        }
        // Always permit loopback HTTP dev servers (e.g. localhost:4300, 127.0.0.1:4200).
        if ("http".equalsIgnoreCase(uri.getScheme()) && isLoopbackHost(host)) {
            return true;
        }
        // If explicit RP ID is configured, permit exact/subdomain HTTPS origins of that RP ID.
        if (properties.rpId() != null && !properties.rpId().isBlank() && "https".equalsIgnoreCase(uri.getScheme())) {
            String rp = properties.rpId().trim().toLowerCase(Locale.ROOT);
            String h = host.toLowerCase(Locale.ROOT);
            return h.equals(rp) || h.endsWith("." + rp);
        }
        return false;
    }

    private static Set<String> buildTrustedOrigins(List<String> corsOrigins, List<String> extraOrigins) {
        Set<String> set = new LinkedHashSet<>();
        if (corsOrigins != null) {
            corsOrigins.stream().map(PasskeyService::normalizeOrigin).filter(s -> s != null).forEach(set::add);
        }
        if (extraOrigins != null) {
            extraOrigins.stream().map(PasskeyService::normalizeOrigin).filter(s -> s != null).forEach(set::add);
        }
        return Set.copyOf(set);
    }

    private static String normalizeOrigin(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            URI uri = URI.create(raw.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            boolean defaultPort = (port == -1)
                    || ("https".equals(scheme) && port == 443)
                    || ("http".equals(scheme) && port == 80);
            return defaultPort ? scheme + "://" + host : scheme + "://" + host + ":" + port;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static boolean isLoopbackHost(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return "localhost".equals(h) || "127.0.0.1".equals(h) || "[::1]".equals(h);
    }

    private static String stripPort(String hostHeader) {
        int colon = hostHeader.lastIndexOf(':');
        return colon > 0 && !hostHeader.endsWith("]") ? hostHeader.substring(0, colon) : hostHeader;
    }

    private String serializeJson(Object value) {
        return jsonMapper.writeValueAsString(value);
    }

    private byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        random.nextBytes(bytes);
        return bytes;
    }

    private static PasskeySummary toSummary(PasskeyCredential c) {
        return new PasskeySummary(
                c.getId(),
                c.getName(),
                c.getAaguid(),
                c.getDeviceType(),
                c.isBackedUp(),
                parseTransportsList(c.getTransports()),
                c.getRpId(),
                c.getRegisteredAt(),
                c.getLastUsedAt());
    }

    private static List<String> parseTransportsList(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private static String normalizeName(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String defaultCredentialName(boolean multiDevice, String transports) {
        if (transports.contains("internal")) {
            return multiDevice ? "Synced Passkey" : "Device Biometric";
        }
        if (transports.contains("usb") || transports.contains("nfc")) {
            return "Security Key";
        }
        if (transports.contains("hybrid") || transports.contains("ble")) {
            return "Cross-Device Passkey";
        }
        return "Passkey";
    }

    private static String firstNonBlank(String... candidates) {
        for (String c : candidates) {
            if (c != null && !c.isBlank()) {
                return c;
            }
        }
        return "";
    }

    private record OriginContext(String origin, String rpId) {}
}
