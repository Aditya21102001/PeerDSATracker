package com.peerdsa.code;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProblemSubmissionRepository extends JpaRepository<ProblemSubmission, Long> {

    List<ProblemSubmission> findByUserIdAndProblemIdOrderByCreatedAtDesc(Long userId, Long problemId);
}
