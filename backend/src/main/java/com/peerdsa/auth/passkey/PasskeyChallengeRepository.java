package com.peerdsa.auth.passkey;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasskeyChallengeRepository extends JpaRepository<PasskeyChallenge, String> {

    Optional<PasskeyChallenge> findByIdAndCeremony(String id, String ceremony);

    @Modifying
    @Query("delete from PasskeyChallenge c where c.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}

