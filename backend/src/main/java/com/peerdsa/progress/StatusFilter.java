package com.peerdsa.progress;

/** The `status` query parameter on GET /api/sheet/problems. */
public enum StatusFilter {
    SOLVED,
    ATTEMPTED,
    REVISIT,
    /** No SOLVED row for this user. */
    UNSOLVED,
    STARRED;

    /** The backing {@link ProblemStatus}, or null for the pseudo-statuses UNSOLVED and STARRED. */
    public ProblemStatus toProblemStatus() {
        return switch (this) {
            case SOLVED -> ProblemStatus.SOLVED;
            case ATTEMPTED -> ProblemStatus.ATTEMPTED;
            case REVISIT -> ProblemStatus.REVISIT;
            case UNSOLVED, STARRED -> null;
        };
    }
}
