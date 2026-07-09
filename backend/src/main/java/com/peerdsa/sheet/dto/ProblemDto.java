package com.peerdsa.sheet.dto;

import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.UserProblemStatus;
import com.peerdsa.sheet.Difficulty;
import com.peerdsa.sheet.Problem;

/**
 * Flattened view of a {@link Problem} plus the caller's progress on it, returned by the sheet API.
 * {@code status} is null and {@code starred} false when the user has never touched the problem.
 */
public record ProblemDto(
        Long id,
        String title,
        Difficulty difficulty,
        int position,
        String leetcodeUrl,
        String youtubeUrl,
        String articleUrl,
        Long subStepId,
        String subStepTitle,
        int stepNo,
        String stepTitle,
        /** Null when the user has never marked this problem. */
        ProblemStatus status,
        boolean starred) {

    public static ProblemDto from(Problem p, UserProblemStatus userStatus) {
        var subStep = p.getSubStep();
        var step = subStep.getStep();
        return new ProblemDto(
                p.getId(),
                p.getTitle(),
                p.getDifficulty(),
                p.getPosition(),
                p.getLeetcodeUrl(),
                p.getYoutubeUrl(),
                p.getArticleUrl(),
                subStep.getId(),
                subStep.getTitle(),
                step.getStepNo(),
                step.getTitle(),
                userStatus == null ? null : userStatus.getStatus(),
                userStatus != null && userStatus.isStarred());
    }
}
