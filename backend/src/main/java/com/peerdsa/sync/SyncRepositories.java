package com.peerdsa.sync;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface PlatformAccountRepository extends JpaRepository<PlatformAccount, Long> {

    List<PlatformAccount> findByUserId(Long userId);

    Optional<PlatformAccount> findByUserIdAndPlatform(Long userId, Platform platform);
}

interface SyncRunRepository extends JpaRepository<SyncRun, Long> {

    List<SyncRun> findTop20ByUserIdOrderByStartedAtDesc(Long userId);
}
