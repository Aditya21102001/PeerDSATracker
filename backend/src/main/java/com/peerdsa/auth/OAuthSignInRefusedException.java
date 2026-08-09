package com.peerdsa.auth;

/**
 * Sign-in through an identity provider was declined by this application, not by the provider.
 *
 * <p>Separate from an {@code AuthenticationException} on purpose: Google said who this is and was
 * believed. What failed is our own rule -- no matching account and auto-provisioning is off, or no
 * address to match on. The message is written to be shown to the person who clicked the button.
 */
public class OAuthSignInRefusedException extends RuntimeException {

    public OAuthSignInRefusedException(String message) {
        super(message);
    }
}
