package com.peerdsa.interview;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class InterviewDtos {

    private InterviewDtos() {}

    public record StartInterviewRequest(
            String track,
            String targetRole,
            String level
    ) {}

    public record InterviewTurnDto(
            Long id,
            int turnIndex,
            String question,
            String topic,
            String candidateAnswer,
            String aiEvaluation,
            int score
    ) {}

    public record InterviewSessionDto(
            Long id,
            String track,
            String targetRole,
            String level,
            String status,
            int overallScore,
            int technicalDepth,
            int problemSolving,
            int communication,
            String feedbackSummary,
            String strengths,
            String weaknesses,
            String recommendedTopics,
            List<InterviewTurnDto> turns,
            Instant createdAt,
            Instant completedAt
    ) {}

    public record SubmitAnswerRequest(
            String answer
    ) {}

    public record TurnEvaluationDto(
            int turnIndex,
            String question,
            String topic,
            String candidateAnswer,
            String aiEvaluation,
            int score,
            boolean isFinished,
            String nextQuestion,
            String nextTopic
    ) {}

    // ------------------------------------------------ Proctored Test DTOs

    public record StartTestRequest(
            String track,
            String title,
            Integer durationMinutes
    ) {}

    public record TestSampleCaseDto(
            String input,
            String expectedOutput
    ) {}

    public record TestCodingProblemDto(
            int id,
            String title,
            String description,
            String constraints,
            String starterCodeJava,
            String starterCodePython,
            String starterCodeCpp,
            List<TestSampleCaseDto> sampleCases
    ) {}

    public record TestMcqQuestionDto(
            int id,
            String question,
            List<String> options,
            String category
    ) {}

    public record TestSessionDto(
            Long id,
            String title,
            String track,
            int durationMinutes,
            String status,
            List<TestMcqQuestionDto> mcqs,
            List<TestCodingProblemDto> codingProblems,
            Instant startedAt
    ) {}

    public record ProctoringViolationDto(
            String type,
            String details,
            long timestampMs
    ) {}

    public record SubmitTestRequest(
            Map<String, Integer> mcqAnswers,
            String codeSubmission,
            String codeLanguage,
            Integer codingProblemId,
            List<ProctoringViolationDto> violations
    ) {}

    public record TestResultDto(
            Long id,
            String title,
            String track,
            String status,
            int score,
            int integrityScore,
            String proctoringVerdict,
            int mcqScore,
            int codeScore,
            int testCasesPassed,
            int testCasesTotal,
            String feedback,
            List<ProctoringViolationDto> violations,
            Instant startedAt,
            Instant submittedAt
    ) {}
}
