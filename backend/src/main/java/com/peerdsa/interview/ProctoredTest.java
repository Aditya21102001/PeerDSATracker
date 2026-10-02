package com.peerdsa.interview;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "proctored_tests")
public class ProctoredTest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String track = "FULL_STACK";

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes = 45;

    @Column(nullable = false)
    private String status = "IN_PROGRESS";

    @Column(nullable = false)
    private int score;

    @Column(name = "integrity_score", nullable = false)
    private int integrityScore = 100;

    @Column(name = "proctoring_verdict", nullable = false)
    private String proctoringVerdict = "CLEARED";

    @Column(name = "violations_json", nullable = false)
    private String violationsJson = "[]";

    @Column(name = "mcq_answers_json", nullable = false)
    private String mcqAnswersJson = "{}";

    @Column(name = "code_submission", nullable = false)
    private String codeSubmission = "";

    @Column(name = "code_language", nullable = false)
    private String codeLanguage = "java";

    @Column(name = "test_cases_passed", nullable = false)
    private int testCasesPassed;

    @Column(name = "test_cases_total", nullable = false)
    private int testCasesTotal;

    @Column(nullable = false)
    private String feedback = "";

    @Column(name = "started_at", nullable = false)
    private Instant startedAt = Instant.now();

    @Column(name = "submitted_at")
    private Instant submittedAt;

    public ProctoredTest() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getTrack() { return track; }
    public void setTrack(String track) { this.track = track; }

    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public int getIntegrityScore() { return integrityScore; }
    public void setIntegrityScore(int integrityScore) { this.integrityScore = integrityScore; }

    public String getProctoringVerdict() { return proctoringVerdict; }
    public void setProctoringVerdict(String proctoringVerdict) { this.proctoringVerdict = proctoringVerdict; }

    public String getViolationsJson() { return violationsJson; }
    public void setViolationsJson(String violationsJson) { this.violationsJson = violationsJson; }

    public String getMcqAnswersJson() { return mcqAnswersJson; }
    public void setMcqAnswersJson(String mcqAnswersJson) { this.mcqAnswersJson = mcqAnswersJson; }

    public String getCodeSubmission() { return codeSubmission; }
    public void setCodeSubmission(String codeSubmission) { this.codeSubmission = codeSubmission; }

    public String getCodeLanguage() { return codeLanguage; }
    public void setCodeLanguage(String codeLanguage) { this.codeLanguage = codeLanguage; }

    public int getTestCasesPassed() { return testCasesPassed; }
    public void setTestCasesPassed(int testCasesPassed) { this.testCasesPassed = testCasesPassed; }

    public int getTestCasesTotal() { return testCasesTotal; }
    public void setTestCasesTotal(int testCasesTotal) { this.testCasesTotal = testCasesTotal; }

    public String getFeedback() { return feedback; }
    public void setFeedback(String feedback) { this.feedback = feedback; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
}
