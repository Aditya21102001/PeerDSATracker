package com.peerdsa.code;

import com.peerdsa.analytics.AnalyticsClient;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteRequest;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.gamification.GamificationService;
import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.ProgressService;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Saves and loads per-problem code drafts, proxies a run to the Piston sandbox through
 * {@link AnalyticsClient}, and manages test cases, submission execution and historical records.
 *
 * <p>When a submission passes all test cases, this marks the problem as SOLVED via
 * {@link ProgressService}, automatically awarding XP, extending streak, and unlocking badges.
 */
@Service
public class CodeService {

    /**
     * The languages the editor offers. Each {@code id} is a Piston language id or alias;
     * {@code editorMode} drives client-side highlighting and {@code template} seeds a blank file.
     */
    public static final List<LanguageOption> LANGUAGES = List.of(
            new LanguageOption("python", "Python", "python", """
                    print("Hello, world!")
                    """),
            new LanguageOption("c++", "C++", "cpp", """
                    #include <bits/stdc++.h>
                    using namespace std;

                    int main() {
                        cout << "Hello, world!" << endl;
                        return 0;
                    }
                    """),
            new LanguageOption("java", "Java", "java", """
                    public class Main {
                        public static void main(String[] args) {
                            System.out.println("Hello, world!");
                        }
                    }
                    """),
            new LanguageOption("javascript", "JavaScript", "javascript", """
                    console.log("Hello, world!");
                    """),
            new LanguageOption("c", "C", "c", """
                    #include <stdio.h>

                    int main(void) {
                        printf("Hello, world!\\n");
                        return 0;
                    }
                    """),
            new LanguageOption("go", "Go", "go", """
                    package main

                    import "fmt"

                    func main() {
                        fmt.Println("Hello, world!")
                    }
                    """));

    private static final Map<String, LanguageOption> BY_ID = index();

    private final CodeSubmissionRepository submissions;
    private final ProblemRepository problems;
    private final AnalyticsClient analytics;
    private final TestCaseRepository testCases;
    private final ProblemSubmissionRepository problemSubmissions;
    private final ProgressService progressService;
    private final UserRepository users;

    public CodeService(
            CodeSubmissionRepository submissions,
            ProblemRepository problems,
            AnalyticsClient analytics,
            TestCaseRepository testCases,
            ProblemSubmissionRepository problemSubmissions,
            ProgressService progressService,
            UserRepository users) {
        this.submissions = submissions;
        this.problems = problems;
        this.analytics = analytics;
        this.testCases = testCases;
        this.problemSubmissions = problemSubmissions;
        this.progressService = progressService;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<CodeDraft> drafts(Long userId, Long problemId) {
        return submissions.findByUserIdAndProblemId(userId, problemId).stream()
                .map(CodeDraft::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TestCaseDto> sampleTestCases(Long problemId) {
        return testCases.findByProblemIdAndSampleTrueOrderByPositionAsc(problemId).stream()
                .map(TestCaseDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SubmissionDto> submissions(Long userId, Long problemId) {
        return problemSubmissions.findByUserIdAndProblemIdOrderByCreatedAtDesc(userId, problemId).stream()
                .map(SubmissionDto::from)
                .toList();
    }

    @Transactional
    public CodeDraft save(Long userId, Long problemId, String language, String source) {
        String canonical = requireSupported(language);
        CodeSubmission row = submissions
                .findByUserIdAndProblemIdAndLanguage(userId, problemId, canonical)
                .orElseGet(() -> {
                    Problem problem = problems.findById(problemId).orElseThrow(
                            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));
                    return new CodeSubmission(userId, problem, canonical);
                });

        row.setSource(source);
        return CodeDraft.from(submissions.save(row));
    }

    /**
     * Runs the given source in Piston's sandbox. A run that reaches Piston but whose code fails to
     * compile or crashes is a normal {@link ExecuteResult} with {@code ran=false}/a non-zero exit;
     * only the analytics service being unreachable is surfaced, as a 503.
     */
    public ExecuteResult run(String language, String source, String stdin) {
        String canonical = requireSupported(language);
        return executeInSandbox(canonical, source, stdin);
    }

    /**
     * Executes the user code against problem test cases, records the submission in history, and
     * automatically transitions the problem status to SOLVED with XP & streak awards on ACCEPTED.
     */
    @Transactional
    public SubmitResult submit(Long userId, Long problemId, String language, String source, String stdin) {
        String canonical = requireSupported(language);
        Problem problem = problems.findById(problemId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));

        // Keep user draft up-to-date
        save(userId, problemId, canonical, source);

        List<TestCase> tcs = testCases.findByProblemIdOrderByPositionAsc(problemId);
        int total = tcs.isEmpty() ? 1 : tcs.size();
        int passed = 0;
        SubmissionVerdict verdict = SubmissionVerdict.ACCEPTED;
        String lastStdout = "";
        String lastStderr = "";
        String compileOutput = null;

        if (tcs.isEmpty()) {
            ExecuteResult res = executeInSandbox(canonical, source, stdin != null ? stdin : "");
            compileOutput = res.compileOutput();
            lastStdout = res.stdout();
            lastStderr = res.stderr();
            if (compileOutput != null && !compileOutput.isBlank()) {
                verdict = SubmissionVerdict.COMPILE_ERROR;
            } else if (res.signal() != null) {
                verdict = SubmissionVerdict.TIME_LIMIT_EXCEEDED;
            } else if (!res.ran() || (res.exitCode() != null && res.exitCode() != 0)) {
                verdict = SubmissionVerdict.RUNTIME_ERROR;
            } else {
                verdict = SubmissionVerdict.ACCEPTED;
                passed = 1;
            }
        } else {
            for (TestCase tc : tcs) {
                ExecuteResult res = executeInSandbox(canonical, source, tc.getInput());
                if (res.compileOutput() != null && !res.compileOutput().isBlank()) {
                    verdict = SubmissionVerdict.COMPILE_ERROR;
                    compileOutput = res.compileOutput();
                    lastStderr = res.stderr();
                    break;
                }
                if (res.signal() != null) {
                    verdict = SubmissionVerdict.TIME_LIMIT_EXCEEDED;
                    lastStderr = res.stderr();
                    lastStdout = res.stdout();
                    break;
                }
                if (!res.ran() || (res.exitCode() != null && res.exitCode() != 0)) {
                    verdict = SubmissionVerdict.RUNTIME_ERROR;
                    lastStderr = res.stderr();
                    lastStdout = res.stdout();
                    break;
                }
                String actual = normalizeOutput(res.stdout());
                String expected = normalizeOutput(tc.getExpectedOutput());
                if (actual.equals(expected)) {
                    passed++;
                    lastStdout = res.stdout();
                } else {
                    verdict = SubmissionVerdict.WRONG_ANSWER;
                    lastStdout = res.stdout();
                    lastStderr = res.stderr();
                    break;
                }
            }
        }

        ProblemSubmission record = new ProblemSubmission(
                userId, problem, canonical, source, verdict, passed, total, lastStdout, lastStderr, compileOutput);
        record = problemSubmissions.save(record);

        boolean isAccepted = verdict == SubmissionVerdict.ACCEPTED;
        boolean newlySolved = false;
        int xpEarned = 0;

        if (isAccepted) {
            var currentStatus = progressService.statusesFor(userId, List.of(problemId)).get(problemId);
            boolean alreadySolved = currentStatus != null && currentStatus.getStatus() == ProblemStatus.SOLVED;
            if (!alreadySolved) {
                newlySolved = true;
                xpEarned = GamificationService.xpFor(problem.getDifficulty());
            }
            progressService.setStatus(userId, problemId, ProblemStatus.SOLVED);
        }

        User user = users.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));

        String message;
        if (isAccepted) {
            message = newlySolved
                    ? String.format("Accepted! +%d XP · Problem marked as SOLVED!", xpEarned)
                    : "Accepted! All test cases passed.";
        } else if (verdict == SubmissionVerdict.COMPILE_ERROR) {
            message = "Compile Error: Check compiler output for details.";
        } else if (verdict == SubmissionVerdict.TIME_LIMIT_EXCEEDED) {
            message = "Time Limit Exceeded.";
        } else if (verdict == SubmissionVerdict.RUNTIME_ERROR) {
            message = "Runtime Error: Code execution failed or crashed.";
        } else {
            message = String.format("Wrong Answer: %d of %d test cases passed.", passed, total);
        }

        return new SubmitResult(
                SubmissionDto.from(record),
                isAccepted,
                newlySolved,
                xpEarned,
                user.getTotalSolved(),
                user.getCurrentStreak(),
                message);
    }

    /**
     * Sends a background non-blocking ping to the analytics service to wake it up
     * from a cold start if it was spun down on Render.
     */
    public void warmup() {
        Thread thread = new Thread(() -> {
            try {
                analytics.ping();
            } catch (Exception ignored) {
                // Background warm-up ping to wake up spun-down instances; non-critical
            }
        }, "analytics-warmup");
        thread.setDaemon(true);
        thread.start();
    }

    private ExecuteResult executeInSandbox(String language, String source, String stdin) {
        if (isRenderProduction() && analytics.isLocalhost()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Code runner service is not configured. Set ANALYTICS_BASE_URL on Render.");
        }

        RestClientException lastException = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return analytics.execute(new ExecuteRequest(language, source, stdin == null ? "" : stdin));
            } catch (RestClientException e) {
                lastException = e;
                if (attempt < 3) {
                    try {
                        Thread.sleep(1500L * attempt);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Code execution service unavailable", lastException);
    }

    private static boolean isRenderProduction() {
        return System.getenv("RENDER") != null || System.getenv("RENDER_EXTERNAL_URL") != null;
    }

    private static String normalizeOutput(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\r\n", "\n").replaceAll("[ \t\r\n]+$", "").trim();
    }

    private static String requireSupported(String language) {
        LanguageOption option = language == null ? null : BY_ID.get(language);
        if (option == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported language");
        }
        return option.id();
    }

    private static Map<String, LanguageOption> index() {
        Map<String, LanguageOption> byId = new LinkedHashMap<>();
        LANGUAGES.forEach(option -> byId.put(option.id(), option));
        return byId;
    }

    /** One offered language: a Piston id, a display label, a highlighting mode, and a starter file. */
    public record LanguageOption(String id, String label, String editorMode, String template) {}

    /** A user's saved source for one problem in one language. */
    public record CodeDraft(Long problemId, String language, String source, Instant updatedAt) {
        static CodeDraft from(CodeSubmission row) {
            return new CodeDraft(
                    row.getProblem().getId(), row.getLanguage(), row.getSource(), row.getUpdatedAt());
        }
    }

    /** A sample test case for client display. */
    public record TestCaseDto(
            Long id, Long problemId, String input, String expectedOutput, boolean sample, int position) {
        static TestCaseDto from(TestCase tc) {
            return new TestCaseDto(
                    tc.getId(),
                    tc.getProblem().getId(),
                    tc.getInput(),
                    tc.getExpectedOutput(),
                    tc.isSample(),
                    tc.getPosition());
        }
    }

    /** Historical submission record for client display. */
    public record SubmissionDto(
            Long id,
            Long problemId,
            String language,
            String source,
            SubmissionVerdict verdict,
            int passedTestCases,
            int totalTestCases,
            String stdout,
            String stderr,
            String compileOutput,
            Instant createdAt) {
        static SubmissionDto from(ProblemSubmission s) {
            return new SubmissionDto(
                    s.getId(),
                    s.getProblem().getId(),
                    s.getLanguage(),
                    s.getSource(),
                    s.getVerdict(),
                    s.getPassedTestCases(),
                    s.getTotalTestCases(),
                    s.getStdout(),
                    s.getStderr(),
                    s.getCompileOutput(),
                    s.getCreatedAt());
        }
    }

    /** Result of POST /api/code/problems/{problemId}/submit. */
    public record SubmitResult(
            SubmissionDto submission,
            boolean accepted,
            boolean newlySolved,
            int xpEarned,
            int totalSolved,
            int currentStreak,
            String message) {}
}
