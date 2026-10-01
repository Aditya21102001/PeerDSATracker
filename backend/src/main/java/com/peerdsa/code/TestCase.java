package com.peerdsa.code;

import com.peerdsa.sheet.Problem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A test case for a problem: standard input and the expected standard output.
 * Can be a public sample test case (visible to users in the editor) or an internal test case.
 */
@Entity
@Table(name = "problem_test_cases")
public class TestCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "problem_id", nullable = false)
    private Problem problem;

    @Column(nullable = false)
    private String input = "";

    @Column(name = "expected_output", nullable = false)
    private String expectedOutput = "";

    @Column(name = "is_sample", nullable = false)
    private boolean sample = true;

    @Column(nullable = false)
    private int position = 1;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected TestCase() {}

    public TestCase(Problem problem, String input, String expectedOutput, boolean sample, int position) {
        this.problem = problem;
        this.input = input == null ? "" : input;
        this.expectedOutput = expectedOutput == null ? "" : expectedOutput;
        this.sample = sample;
        this.position = position;
    }

    public Long getId() {
        return id;
    }

    public Problem getProblem() {
        return problem;
    }

    public String getInput() {
        return input;
    }

    public String getExpectedOutput() {
        return expectedOutput;
    }

    public boolean isSample() {
        return sample;
    }

    public int getPosition() {
        return position;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
