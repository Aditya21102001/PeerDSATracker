package com.peerdsa.code;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestCaseRepository extends JpaRepository<TestCase, Long> {

    List<TestCase> findByProblemIdOrderByPositionAsc(Long problemId);

    List<TestCase> findByProblemIdAndSampleTrueOrderByPositionAsc(Long problemId);
}
