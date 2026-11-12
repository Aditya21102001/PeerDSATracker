package com.peerdsa.auth.passkey;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PasskeyCredentialRepository extends JpaRepository<PasskeyCredential, String> {

    List<PasskeyCredential> findByUserIdOrderByRegisteredAtDesc(Long userId);

    Optional<PasskeyCredential> findByIdAndUserId(String id, Long userId);

    Optional<PasskeyCredential> findFirstByUserIdOrderByRegisteredAtAsc(Long userId);
}

