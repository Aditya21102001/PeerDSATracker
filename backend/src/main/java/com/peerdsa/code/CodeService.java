package com.peerdsa.code;

import com.peerdsa.analytics.AnalyticsClient;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteRequest;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.chat.OpenRouterClient;
import com.peerdsa.gamification.GamificationService;
import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.ProgressService;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Saves and loads per-problem code drafts, proxies a run to the Piston sandbox through
 * {@link AnalyticsClient}, and manages test cases, submission execution and historical records.
 *
 * <p>When a submission passes all test cases, this marks the problem as SOLVED via
 * {@link ProgressService}, automatically awarding XP, extending streak, and unlocking badges.
 */
@Service
public class CodeService {

    private static final Logger log = LoggerFactory.getLogger(CodeService.class);

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
    private final OpenRouterClient openRouter;
    private final ObjectMapper mapper;

    public CodeService(
            CodeSubmissionRepository submissions,
            ProblemRepository problems,
            AnalyticsClient analytics,
            TestCaseRepository testCases,
            ProblemSubmissionRepository problemSubmissions,
            ProgressService progressService,
            UserRepository users) {
        this(submissions, problems, analytics, testCases, problemSubmissions, progressService, users, null, new ObjectMapper());
    }

    @Autowired
    public CodeService(
            CodeSubmissionRepository submissions,
            ProblemRepository problems,
            AnalyticsClient analytics,
            TestCaseRepository testCases,
            ProblemSubmissionRepository problemSubmissions,
            ProgressService progressService,
            UserRepository users,
            ObjectProvider<OpenRouterClient> openRouterProvider,
            ObjectMapper mapper) {
        this.submissions = submissions;
        this.problems = problems;
        this.analytics = analytics;
        this.testCases = testCases;
        this.problemSubmissions = problemSubmissions;
        this.progressService = progressService;
        this.users = users;
        this.openRouter = openRouterProvider != null ? openRouterProvider.getIfAvailable() : null;
        this.mapper = mapper != null ? mapper : new ObjectMapper();
    }

    @Transactional(readOnly = true)
    public List<CodeDraft> drafts(Long userId, Long problemId) {
        return submissions.findByUserIdAndProblemId(userId, problemId).stream()
                .map(CodeDraft::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TestCaseDto> sampleTestCases(Long problemId) {
        List<TestCaseDto> list = testCases.findByProblemIdAndSampleTrueOrderByPositionAsc(problemId).stream()
                .map(TestCaseDto::from)
                .toList();
        if (!list.isEmpty()) {
            return list;
        }

        Problem p = problems.findById(problemId).orElse(null);
        String title = p != null ? p.getTitle() : "";
        List<DefaultProblemCatalog.DefaultCase> catalogCases = DefaultProblemCatalog.getForProblem(problemId, title);
        return catalogCases.stream()
                .filter(DefaultProblemCatalog.DefaultCase::sample)
                .map(c -> new TestCaseDto(null, problemId, c.input(), c.expectedOutput(), c.sample(), c.position()))
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
     * Runs the given source in Piston's sandbox, falling back to the AI sandbox engine or local runner
     * when the external sandbox is cold or unreachable.
     */
    public ExecuteResult run(String language, String source, String stdin) {
        String canonical = requireSupported(language);
        return executeInSandbox(canonical, source, stdin);
    }

    private record EvaluationCase(String input, String expectedOutput) {}

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
        List<EvaluationCase> evaluationCases = new ArrayList<>();
        if (!tcs.isEmpty()) {
            for (TestCase tc : tcs) {
                evaluationCases.add(new EvaluationCase(tc.getInput(), tc.getExpectedOutput()));
            }
        } else {
            List<DefaultProblemCatalog.DefaultCase> defaults = DefaultProblemCatalog.getForProblem(problemId, problem.getTitle());
            if (defaults != null && !defaults.isEmpty()) {
                for (var dc : defaults) {
                    evaluationCases.add(new EvaluationCase(dc.input(), dc.expectedOutput()));
                }
            }
        }

        int total = evaluationCases.isEmpty() ? 1 : evaluationCases.size();
        int passed = 0;
        SubmissionVerdict verdict = SubmissionVerdict.ACCEPTED;
        String lastStdout = "";
        String lastStderr = "";
        String compileOutput = null;

        if (evaluationCases.isEmpty()) {
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
            for (EvaluationCase tc : evaluationCases) {
                ExecuteResult res = executeInSandbox(canonical, source, tc.input());
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
                String expected = normalizeOutput(tc.expectedOutput());
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
        // 1. Try Piston sandbox via AnalyticsClient
        if (!isRenderProduction() || !analytics.isLocalhost()) {
            try {
                ExecuteResult res = analytics.execute(new ExecuteRequest(language, source, stdin == null ? "" : stdin));
                if (res != null && (res.ran() || (res.compileOutput() != null && !res.compileOutput().isBlank()))) {
                    return res;
                }
            } catch (RestClientException e) {
                log.warn("Analytics execution service unreachable or failed ({}). Attempting fallback engine.", e.getMessage());
            }
        }

        // 2. Try OpenRouter AI sandbox evaluation (supports C++, Java, Python, JavaScript, Go, C)
        if (openRouter != null && openRouter.isConfigured()) {
            try {
                ExecuteResult aiRes = evaluateWithAiSandbox(language, source, stdin);
                if (aiRes != null) {
                    return aiRes;
                }
            } catch (Exception e) {
                log.warn("AI Sandbox evaluation failed ({}). Attempting local process execution.", e.getMessage());
            }
        }

        // 3. Try Local process execution
        try {
            ExecuteResult localRes = executeLocally(language, source, stdin);
            if (localRes != null) {
                return localRes;
            }
        } catch (Exception e) {
            log.warn("Local execution fallback failed ({}).", e.getMessage());
        }

        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Code execution service is currently unavailable. Please verify sandbox setup or try again shortly.");
    }

    private ExecuteResult evaluateWithAiSandbox(String language, String source, String stdin) {
        String sysPrompt = """
            You are a strict, ultra-precise competitive programming online judge and execution sandbox.
            Simulate running the provided code with the provided standard input (stdin) exactly as a language runtime would.
            
            Determine:
            1. Compile/Syntax errors: If code cannot compile, set "ran": false, "exitCode": 1, "compileOutput": "compiler diagnostic message", "stdout": "", "stderr": "".
            2. Runtime errors: If unhandled exception or crash, set "ran": true, "exitCode": 1, "compileOutput": null, "stdout": output printed before crash, "stderr": "exception traceback".
            3. Normal execution: Set "ran": true, "exitCode": 0, "compileOutput": null, "stdout": exact output printed, "stderr": "".
            
            Return ONLY valid JSON matching this schema:
            {
              "ran": boolean,
              "exitCode": number,
              "stdout": string,
              "stderr": string,
              "compileOutput": string or null
            }
            Do NOT include markdown fences, comments, or extra text. Only raw JSON.
            """;

        String userPrompt = "Language: " + language + "\n\nStdin:\n" + (stdin == null ? "" : stdin) + "\n\nSource Code:\n" + source;

        String raw = openRouter.complete(sysPrompt, userPrompt);
        if (raw == null || raw.isBlank()) {
            return null;
        }

        String cleaned = raw.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        cleaned = cleaned.trim();

        try {
            JsonNode root = mapper.readTree(cleaned);
            boolean ran = root.path("ran").asBoolean(true);
            int exitCode = root.path("exitCode").asInt(0);
            String stdout = root.path("stdout").asText("");
            String stderr = root.path("stderr").asText("");
            String compileOutput = root.hasNonNull("compileOutput") ? root.path("compileOutput").asText() : null;
            return new ExecuteResult(ran, language, "ai-sandbox", stdout, stderr, compileOutput, exitCode, null, null);
        } catch (Exception e) {
            log.warn("Failed to parse AI execution response: {}", e.getMessage());
            return null;
        }
    }

    private ExecuteResult executeLocally(String language, String source, String stdin) {
        String command = null;
        String fileName = null;
        if ("python".equalsIgnoreCase(language)) {
            command = isWindows() ? "python" : "python3";
            fileName = "solution.py";
        } else if ("javascript".equalsIgnoreCase(language)) {
            command = "node";
            fileName = "solution.js";
        } else if ("java".equalsIgnoreCase(language)) {
            command = "java";
            fileName = "Main.java";
        }

        if (command == null) {
            return null;
        }

        try {
            Path tempDir = Files.createTempDirectory("peerdsa_exec_");
            Path sourcePath = tempDir.resolve(fileName);
            Files.writeString(sourcePath, source == null ? "" : source);

            ProcessBuilder pb = new ProcessBuilder(command, sourcePath.toAbsolutePath().toString());
            pb.directory(tempDir.toFile());
            Process process = pb.start();

            if (stdin != null && !stdin.isEmpty()) {
                try (var writer = new java.io.OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8)) {
                    writer.write(stdin);
                    writer.flush();
                }
            } else {
                process.getOutputStream().close();
            }

            boolean completed = process.waitFor(6, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                deleteDirectory(tempDir);
                return new ExecuteResult(true, language, "local", "", "Time limit exceeded", null, 124, "SIGKILL", null);
            }

            String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.exitValue();
            deleteDirectory(tempDir);

            String compileOutput = null;
            if (exitCode != 0 && (stderr.contains("error:") || stderr.contains("SyntaxError:"))) {
                compileOutput = stderr;
            }

            return new ExecuteResult(true, language, "local", stdout, stderr, compileOutput, exitCode, null, null);
        } catch (Exception e) {
            log.debug("Local execution not viable: {}", e.getMessage());
            return null;
        }
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    private static void deleteDirectory(Path path) {
        try {
            if (Files.exists(path)) {
                try (var stream = Files.walk(path)) {
                    stream.sorted(java.util.Comparator.reverseOrder())
                            .map(Path::toFile)
                            .forEach(java.io.File::delete);
                }
            }
        } catch (Exception ignored) {}
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
