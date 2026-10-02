package com.peerdsa.hire;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface JobOpeningRepository extends JpaRepository<JobOpening, Long> {
    List<JobOpening> findByIsActiveTrueOrderByPostedAtDesc();
}
