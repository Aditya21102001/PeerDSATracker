package com.peerdsa.interview;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AiInterviewTurnRepository extends JpaRepository<AiInterviewTurn, Long> {
    List<AiInterviewTurn> findByInterviewIdOrderByTurnIndexAsc(Long interviewId);
}
