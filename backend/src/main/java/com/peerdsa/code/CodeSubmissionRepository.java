package com.peerdsa.code;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link CodeSubmission}, keyed by the unique (user, problem, language) triple. */
public interface CodeSubmissionRepository extends JpaRepository<CodeSubmission, Long> {

    /** Every saved language for one problem, which the editor loads together. */
    List<CodeSubmission> findByUserIdAndProblemId(Long userId, Long problemId);

    Optional<CodeSubmission> findByUserIdAndProblemIdAndLanguage(
            Long userId, Long problemId, String language);
}
