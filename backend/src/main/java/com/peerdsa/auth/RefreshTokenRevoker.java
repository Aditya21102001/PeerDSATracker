package com.peerdsa.auth;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Revocation must survive the exception that reports the theft.
 *
 * <p>Refresh-token reuse is answered with a 401, but throwing from inside
 * {@code AuthService.refresh}'s transaction rolls back everything that
 * transaction did -- including the revocation. Committing in a separate
 * transaction is what actually kills the compromised session.
 *
 * <p>This lives in its own bean because Spring's transaction proxy does not
 * intercept self-invocation: calling a REQUIRES_NEW method on {@code this}
 * would silently join the caller's transaction.
 */
@Service
public class RefreshTokenRevoker {

    private final RefreshTokenRepository refreshTokens;

    public RefreshTokenRevoker(RefreshTokenRepository refreshTokens) {
        this.refreshTokens = refreshTokens;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int revokeAllForUser(Long userId) {
        return refreshTokens.revokeAllForUser(userId);
    }
}
