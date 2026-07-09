package com.peerdsa.revision;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/revision")
public class RevisionController {

    private final RevisionService revision;

    public RevisionController(RevisionService revision) {
        this.revision = revision;
    }

    public record ScheduleRequest(Integer intervalDays) {}

    /** Everything whose next review has come due. */
    @GetMapping("/queue")
    public List<RevisionService.RevisionItem> queue(@AuthenticationPrincipal User user) {
        return revision.due(user.getId());
    }

    @GetMapping("/upcoming")
    public List<RevisionService.RevisionItem> upcoming(@AuthenticationPrincipal User user) {
        return revision.upcoming(user.getId());
    }

    @PostMapping("/problems/{problemId}/schedule")
    public RevisionService.RevisionItem schedule(
            @AuthenticationPrincipal User user,
            @PathVariable Long problemId,
            @RequestBody(required = false) ScheduleRequest request) {
        return revision.schedule(user.getId(), problemId, request == null ? null : request.intervalDays());
    }

    /** Recalled it: next review moves one rung up the ladder. */
    @PostMapping("/problems/{problemId}/done")
    public RevisionService.RevisionItem done(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        return revision.markReviewed(user.getId(), problemId);
    }

    /** Forgot it: back to a 1-day interval. */
    @PostMapping("/problems/{problemId}/reset")
    public RevisionService.RevisionItem reset(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        return revision.reset(user.getId(), problemId);
    }

    /** Stop revising this problem; it stays solved. */
    @DeleteMapping("/problems/{problemId}")
    public ResponseEntity<Void> retire(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        revision.retire(user.getId(), problemId);
        return ResponseEntity.noContent().build();
    }
}
