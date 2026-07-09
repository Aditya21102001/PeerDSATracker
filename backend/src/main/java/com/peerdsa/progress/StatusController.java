package com.peerdsa.progress;

import com.peerdsa.user.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/status")
public class StatusController {

    private final ProgressService progress;

    public StatusController(ProgressService progress) {
        this.progress = progress;
    }

    public record StatusRequest(@NotNull ProblemStatus status) {}

    public record StatusResponse(Long problemId, ProblemStatus status, boolean starred) {}

    public record StarResponse(Long problemId, boolean starred) {}

    @PutMapping("/problems/{problemId}")
    public StatusResponse setStatus(
            @AuthenticationPrincipal User user,
            @PathVariable Long problemId,
            @Valid @RequestBody StatusRequest request) {

        UserProblemStatus row = progress.setStatus(user.getId(), problemId, request.status());
        return new StatusResponse(problemId, row.getStatus(), row.isStarred());
    }

    @DeleteMapping("/problems/{problemId}")
    public ResponseEntity<Void> clearStatus(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        progress.clearStatus(user.getId(), problemId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/problems/{problemId}/star")
    public StarResponse toggleStar(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        return new StarResponse(problemId, progress.toggleStar(user.getId(), problemId));
    }
}
