package com.peerdsa.hire;

import com.peerdsa.hire.HireDtos.ApplyAllRequest;
import com.peerdsa.hire.HireDtos.ApplyAllResult;
import com.peerdsa.hire.HireDtos.CandidateProfileDto;
import com.peerdsa.hire.HireDtos.JobApplicationDto;
import com.peerdsa.hire.HireDtos.JobOpeningDto;
import com.peerdsa.hire.HireDtos.SaveCandidateProfileRequest;
import com.peerdsa.user.User;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hire")
public class HireController {

    private final HireService hireService;

    public HireController(HireService hireService) {
        this.hireService = hireService;
    }

    @GetMapping("/profile")
    public CandidateProfileDto getProfile(@AuthenticationPrincipal User user) {
        return hireService.getProfile(user.getId());
    }

    @PutMapping("/profile")
    public CandidateProfileDto saveProfile(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody SaveCandidateProfileRequest request) {
        return hireService.saveProfile(user.getId(), request);
    }

    @GetMapping("/jobs")
    public List<JobOpeningDto> listJobs(@AuthenticationPrincipal User user) {
        return hireService.listJobs(user.getId());
    }

    @PostMapping("/jobs/{jobId}/apply")
    public JobApplicationDto apply(
            @AuthenticationPrincipal User user,
            @PathVariable Long jobId) {
        return hireService.apply(user.getId(), jobId);
    }

    @PostMapping("/apply-all")
    public ApplyAllResult applyAll(
            @AuthenticationPrincipal User user,
            @RequestBody(required = false) ApplyAllRequest request) {
        Integer threshold = request != null ? request.minMatchScore() : 70;
        return hireService.applyAllMatching(user.getId(), threshold);
    }

    @GetMapping("/applications")
    public List<JobApplicationDto> listApplications(@AuthenticationPrincipal User user) {
        return hireService.listApplications(user.getId());
    }
}
