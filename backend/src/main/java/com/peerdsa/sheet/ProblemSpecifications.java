package com.peerdsa.sheet;

import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.StatusFilter;
import com.peerdsa.progress.UserProblemStatus;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

public final class ProblemSpecifications {

    private ProblemSpecifications() {}

    /** An absent filter contributes an always-true predicate rather than a null Specification. */
    private static final Specification<Problem> UNFILTERED = (root, query, cb) -> cb.conjunction();

    public static Specification<Problem> difficultyIs(Difficulty difficulty) {
        return difficulty == null
                ? UNFILTERED
                : (root, query, cb) -> cb.equal(root.get("difficulty"), difficulty);
    }

    public static Specification<Problem> stepNoIs(Integer stepNo) {
        return stepNo == null
                ? UNFILTERED
                : (root, query, cb) -> cb.equal(root.get("subStep").get("step").get("stepNo"), stepNo);
    }

    public static Specification<Problem> titleContains(String q) {
        if (q == null || q.isBlank()) {
            return UNFILTERED;
        }
        String pattern = "%" + q.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.get("title")), pattern);
    }

    /**
     * Filters on the caller's own progress via an EXISTS subquery, so the page and
     * count queries stay single statements and problems the user never touched
     * (which have no user_problem_status row at all) are handled by NOT EXISTS.
     */
    public static Specification<Problem> userStatusIs(Long userId, StatusFilter filter) {
        if (filter == null) {
            return UNFILTERED;
        }
        return (root, query, cb) -> {
            Subquery<Long> sub = query.subquery(Long.class);
            Root<UserProblemStatus> ups = sub.from(UserProblemStatus.class);

            Predicate match = switch (filter) {
                case STARRED -> cb.isTrue(ups.get("starred"));
                // "Unsolved" means: no SOLVED row exists. Attempted/starred rows still count as unsolved.
                case UNSOLVED -> cb.equal(ups.get("status"), ProblemStatus.SOLVED);
                case SOLVED, ATTEMPTED, REVISIT -> cb.equal(ups.get("status"), filter.toProblemStatus());
            };

            sub.select(ups.get("id"))
                    .where(cb.and(
                            cb.equal(ups.get("problem").get("id"), root.get("id")),
                            cb.equal(ups.get("userId"), userId),
                            match));

            return filter == StatusFilter.UNSOLVED ? cb.not(cb.exists(sub)) : cb.exists(sub);
        };
    }
}
