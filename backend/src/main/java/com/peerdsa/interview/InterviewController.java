package com.peerdsa.interview;

import com.peerdsa.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class InterviewController {

    private final InterviewService interviewService;

    public InterviewController(InterviewService interviewService) {
        this.interviewService = interviewService;
    }

    private User requireUser(User user) {
        if (user == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "Please sign in to access AI interview features.");
        }
        return user;
    }

    // ------------------------------------------------------------- AI Mock Interview

    @PostMapping("/interview/start")
    public ResponseEntity<InterviewDtos.InterviewSessionDto> startInterview(
            @AuthenticationPrincipal User user,
            @RequestBody(required = false) InterviewDtos.StartInterviewRequest req) {
        return ResponseEntity.ok(interviewService.startInterview(requireUser(user).getId(), req));
    }

    @PostMapping("/interview/{id}/answer")
    public ResponseEntity<InterviewDtos.TurnEvaluationDto> submitAnswer(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @RequestBody(required = false) InterviewDtos.SubmitAnswerRequest req) {
        return ResponseEntity.ok(interviewService.submitAnswer(requireUser(user).getId(), id, req));
    }

    @GetMapping("/interview/{id}")
    public ResponseEntity<InterviewDtos.InterviewSessionDto> getInterview(
            @AuthenticationPrincipal User user,
            @PathVariable Long id) {
        return ResponseEntity.ok(interviewService.getInterview(requireUser(user).getId(), id));
    }

    @GetMapping("/interview/history")
    public ResponseEntity<List<InterviewDtos.InterviewSessionDto>> listInterviews(
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(interviewService.listInterviews(requireUser(user).getId()));
    }

    // ------------------------------------------------------------- AI Proctored Test

    @PostMapping("/proctor/start")
    public ResponseEntity<InterviewDtos.TestSessionDto> startTest(
            @AuthenticationPrincipal User user,
            @RequestBody(required = false) InterviewDtos.StartTestRequest req) {
        return ResponseEntity.ok(interviewService.startTest(requireUser(user).getId(), req));
    }

    @PostMapping("/proctor/{id}/submit")
    public ResponseEntity<InterviewDtos.TestResultDto> submitTest(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @RequestBody(required = false) InterviewDtos.SubmitTestRequest req) {
        return ResponseEntity.ok(interviewService.submitTest(requireUser(user).getId(), id, req));
    }

    @GetMapping("/proctor/{id}")
    public ResponseEntity<InterviewDtos.TestResultDto> getTest(
            @AuthenticationPrincipal User user,
            @PathVariable Long id) {
        return ResponseEntity.ok(interviewService.getTest(requireUser(user).getId(), id));
    }

    @GetMapping("/proctor/history")
    public ResponseEntity<List<InterviewDtos.TestResultDto>> listTests(
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(interviewService.listTests(requireUser(user).getId()));
    }
}
