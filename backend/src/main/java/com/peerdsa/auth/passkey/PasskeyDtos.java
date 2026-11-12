package com.peerdsa.auth.passkey;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import tools.jackson.databind.JsonNode;

/** Request and response payloads for WebAuthn / Passkey endpoints. */
public final class PasskeyDtos {

    private PasskeyDtos() {}

    /** Optional hint when asking the server for registration options. */
    public record RegisterOptionsRequest(Boolean promotion) {
        public boolean isPromotion() {
            return Boolean.TRUE.equals(promotion);
        }
    }

    public record RpInfo(String name, String id) {}

    public record UserInfo(String id, String name, String displayName) {}

    public record PubKeyCredParam(String type, long alg) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CredentialDescriptor(String id, String type, List<String> transports) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AuthenticatorSelection(
            String authenticatorAttachment,
            String residentKey,
            boolean requireResidentKey,
            String userVerification) {}

    public record CreationOptionsPublicKey(
            String challenge,
            RpInfo rp,
            UserInfo user,
            List<PubKeyCredParam> pubKeyCredParams,
            long timeout,
            List<CredentialDescriptor> excludeCredentials,
            AuthenticatorSelection authenticatorSelection,
            String attestation) {}

    public record RegisterOptionsResponse(String challengeId, CreationOptionsPublicKey publicKey) {}

    public record RegisterVerifyRequest(
            @NotBlank String challengeId,
            @NotNull JsonNode credential,
            @Size(max = 80) String name) {}

    public record RequestOptionsPublicKey(
            String challenge,
            String rpId,
            long timeout,
            List<CredentialDescriptor> allowCredentials,
            String userVerification) {}

    public record LoginOptionsResponse(String challengeId, RequestOptionsPublicKey publicKey) {}

    public record LoginVerifyRequest(@NotBlank String challengeId, @NotNull JsonNode credential) {}

    public record RenamePasskeyRequest(@NotBlank @Size(max = 80) String name) {}

    public record PasskeySummary(
            String id,
            String name,
            String aaguid,
            String deviceType,
            boolean backedUp,
            List<String> transports,
            String rpId,
            Instant registeredAt,
            Instant lastUsedAt) {}

    public record PasskeyListResponse(
            String rpId,
            String passkeyUserId,
            List<PasskeySummary> credentials) {}

    public record DeletePasskeyResponse(
            String rpId,
            String passkeyUserId,
            List<String> remainingCredentialIds) {}
}

