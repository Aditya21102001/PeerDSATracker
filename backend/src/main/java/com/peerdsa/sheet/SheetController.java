package com.peerdsa.sheet;

import com.peerdsa.progress.ProgressService;
import com.peerdsa.progress.StatusFilter;
import com.peerdsa.progress.UserProblemStatus;
import com.peerdsa.sheet.dto.ProblemDto;
import com.peerdsa.user.User;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only REST surface over the sheet: the paginated problem list, a single problem, and the
 * user's progress summary. Every problem is returned with the caller's own status, fetched one page
 * at a time rather than per row.
 */
@RestController
@RequestMapping("/api/sheet")
public class SheetController {

    private static final int MAX_PAGE_SIZE = 200;

    /** The sheet's own order: step, then sub-step, then position within the sub-step. */
    private static final Sort SHEET_ORDER =
            Sort.by("subStep.step.stepNo", "subStep.position", "position");

    private final ProblemRepository problems;
    private final ProgressService progress;

    public SheetController(ProblemRepository problems, ProgressService progress) {
        this.problems = problems;
        this.progress = progress;
    }

    /**
     * One page of problems matching the filters, each carrying the caller's status. Page size is
     * clamped to {@value #MAX_PAGE_SIZE} so a client can't pull the whole sheet in one request.
     */
    @GetMapping("/problems")
    public Page<ProblemDto> problems(
            @AuthenticationPrincipal User user,
            @RequestParam(required = false) Integer step,
            @RequestParam(required = false) Difficulty difficulty,
            @RequestParam(required = false) StatusFilter status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        Specification<Problem> spec = Specification.allOf(
                ProblemSpecifications.stepNoIs(step),
                ProblemSpecifications.difficultyIs(difficulty),
                ProblemSpecifications.titleContains(q),
                ProblemSpecifications.userStatusIs(user.getId(), status));

        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Page<Problem> found = problems.findAll(spec, PageRequest.of(Math.max(page, 0), pageSize, SHEET_ORDER));

        // One extra query for the whole page rather than one per row.
        List<Long> ids = found.getContent().stream().map(Problem::getId).toList();
        Map<Long, UserProblemStatus> byProblem = progress.statusesFor(user.getId(), ids);

        return found.map(p -> ProblemDto.from(p, byProblem.get(p.getId())));
    }

    @GetMapping("/problems/{problemId}")
    public ProblemDto problem(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        Problem found = problems.findWithStepById(problemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));

        var status = progress.statusesFor(user.getId(), List.of(problemId)).get(problemId);
        return ProblemDto.from(found, status);
    }

    @GetMapping("/progress")
    public ProgressService.SheetProgress progress(@AuthenticationPrincipal User user) {
        return progress.progress(user.getId());
    }
}
