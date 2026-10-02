package com.peerdsa.hire;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {
    List<JobApplication> findByUserIdOrderByAppliedAtDesc(Long userId);
    Optional<JobApplication> findByUserIdAndJobId(Long userId, Long jobId);
    List<JobApplication> findAllByUserId(Long userId);
}
