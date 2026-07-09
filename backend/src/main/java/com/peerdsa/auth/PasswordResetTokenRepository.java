package com.peerdsa.auth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for {@link PasswordResetToken}, including rate-limit counting and bulk invalidation. */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /** Rate limiting: how many resets has this user asked for recently? */
    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);

    /** Requesting a new link invalidates any outstanding one. */
    @Modifying(clearAutomatically = true)
    @Query("update PasswordResetToken t set t.usedAt = :now where t.userId = :userId and t.usedAt is null")
    int invalidateOutstanding(@Param("userId") Long userId, @Param("now") Instant now);
}
