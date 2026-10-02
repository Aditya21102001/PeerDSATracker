package com.peerdsa.interview;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AiInterviewRepository extends JpaRepository<AiInterview, Long> {
    List<AiInterview> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<AiInterview> findByIdAndUserId(Long id, Long userId);
}
