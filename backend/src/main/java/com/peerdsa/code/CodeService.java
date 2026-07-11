package com.peerdsa.code;

import com.peerdsa.analytics.AnalyticsClient;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteRequest;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
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
 * Saves and loads per-problem code drafts, and proxies a run to the Piston sandbox through
 * {@link AnalyticsClient}. This JVM never executes user code and never persists a run's output.
 *
 * <p>The catalogue of runnable languages ({@link #LANGUAGES}) lives here so the backend and the
 * editor agree on exactly which Piston ids are offered; a save or run in any other language is a
 * 400, never a silent pass-through to Piston.
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

    public CodeService(
            CodeSubmissionRepository submissions, ProblemRepository problems, AnalyticsClient analytics) {
        this.submissions = submissions;
        this.problems = problems;
        this.analytics = analytics;
    }

    @Transactional(readOnly = true)
    public List<CodeDraft> drafts(Long userId, Long problemId) {
        return submissions.findByUserIdAndProblemId(userId, problemId).stream()
                .map(CodeDraft::from)
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
        try {
            return analytics.execute(new ExecuteRequest(canonical, source, stdin == null ? "" : stdin));
        } catch (RestClientException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Code execution service unavailable", e);
        }
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
}
