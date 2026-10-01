package com.peerdsa.code;

import com.peerdsa.sheet.Problem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Immutable historical record of one submission attempt made by a user for a problem.
 * Tracks verdict, passed test cases, output, and execution diagnostics.
 */
@Entity
@Table(name = "problem_submissions")
public class ProblemSubmission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "problem_id", nullable = false)
    private Problem problem;

    @Column(nullable = false)
    private String language;

    @Column(nullable = false)
    private String source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SubmissionVerdict verdict;

    @Column(name = "passed_test_cases", nullable = false)
    private int passedTestCases;

    @Column(name = "total_test_cases", nullable = false)
    private int totalTestCases;

    @Column
    private String stdout;

    @Column
    private String stderr;

    @Column(name = "compile_output")
    private String compileOutput;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected ProblemSubmission() {}

    public ProblemSubmission(
            Long userId,
            Problem problem,
            String language,
            String source,
            SubmissionVerdict verdict,
            int passedTestCases,
            int totalTestCases,
            String stdout,
            String stderr,
            String compileOutput) {
        this.userId = userId;
        this.problem = problem;
        this.language = language;
        this.source = source;
        this.verdict = verdict;
        this.passedTestCases = passedTestCases;
        this.totalTestCases = totalTestCases;
        this.stdout = stdout;
        this.stderr = stderr;
        this.compileOutput = compileOutput;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Problem getProblem() {
        return problem;
    }

    public String getLanguage() {
        return language;
    }

    public String getSource() {
        return source;
    }

    public SubmissionVerdict getVerdict() {
        return verdict;
    }

    public int getPassedTestCases() {
        return passedTestCases;
    }

    public int getTotalTestCases() {
        return totalTestCases;
    }

    public String getStdout() {
        return stdout;
    }

    public String getStderr() {
        return stderr;
    }

    public String getCompileOutput() {
        return compileOutput;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
