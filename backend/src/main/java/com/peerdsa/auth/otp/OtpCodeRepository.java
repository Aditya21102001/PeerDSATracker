package com.peerdsa.auth.otp;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for {@link OtpCode}: per-destination rate limiting and code lookup. */
public interface OtpCodeRepository extends JpaRepository<OtpCode, Long> {

    /**
     * Matched on the pair, never on the hash alone: two destinations can legitimately hold the
     * same six digits at once, and a code proves control of the address it was sent to -- nothing
     * more. {@code codeHash} is never null here, and a consumed row's null hash matches nothing,
     * so spent codes fall out of this query on their own.
     */
    Optional<OtpCode> findByEmailAndCodeHash(String email, String codeHash);

    /** Counts every request for the address, including ones that issued no code. */
    long countByEmailAndCreatedAtAfter(String email, Instant after);

    /** Only the newest code should work. Supersedes the rest without dropping their audit rows. */
    @Modifying(clearAutomatically = true)
    @Query("update OtpCode c set c.codeHash = null where c.email = :email and c.codeHash is not null")
    int supersedeOutstanding(@Param("email") String email);

    /**
     * Housekeeping. Keyed on {@code createdAt}, not {@code expiresAt}: a row stops being able to
     * verify after the 10-minute TTL but keeps counting towards the hourly rate limit long after,
     * so deleting on expiry would hand an attacker a fresh budget every ten minutes.
     */
    @Modifying
    @Query("delete from OtpCode c where c.createdAt < :before")
    int deleteCreatedBefore(@Param("before") Instant before);
}
