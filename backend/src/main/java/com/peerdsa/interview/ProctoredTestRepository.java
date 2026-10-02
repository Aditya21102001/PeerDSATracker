package com.peerdsa.interview;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProctoredTestRepository extends JpaRepository<ProctoredTest, Long> {
    List<ProctoredTest> findByUserIdOrderByStartedAtDesc(Long userId);
    Optional<ProctoredTest> findByIdAndUserId(Long id, Long userId);
}
