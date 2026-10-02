package com.peerdsa.interview;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InterviewServiceTest {

    @Mock
    private AiInterviewRepository interviewRepo;

    @Mock
    private AiInterviewTurnRepository turnRepo;

    @Mock
    private ProctoredTestRepository testRepo;

    private InterviewService service;

    @BeforeEach
    void setUp() {
        service = new InterviewService(
                interviewRepo,
                turnRepo,
                testRepo,
                null,
                null,
                new ObjectMapper()
        );
    }

    @Test
    void startInterview_createsSessionAndInitialTurn() {
        AiInterview saved = new AiInterview();
        saved.setId(101L);
        saved.setUserId(1L);
        saved.setTrack("JAVA_SPRING");
        saved.setLevel("SENIOR");
        saved.setTargetRole("Senior Java Engineer");
        saved.setStatus("IN_PROGRESS");
        when(interviewRepo.save(any(AiInterview.class))).thenReturn(saved);

        AiInterviewTurn turn1 = new AiInterviewTurn();
        turn1.setId(501L);
        turn1.setInterviewId(101L);
        turn1.setTurnIndex(1);
        turn1.setQuestion("How do Virtual Threads differ from OS threads?");
        turn1.setTopic("Concurrency");
        when(turnRepo.save(any(AiInterviewTurn.class))).thenReturn(turn1);

        InterviewDtos.StartInterviewRequest req = new InterviewDtos.StartInterviewRequest(
                "JAVA_SPRING",
                "Senior Java Engineer",
                "SENIOR"
        );

        InterviewDtos.InterviewSessionDto result = service.startInterview(1L, req);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(101L);
        assertThat(result.track()).isEqualTo("JAVA_SPRING");
        assertThat(result.turns()).hasSize(1);
        assertThat(result.turns().get(0).question()).contains("Virtual Threads");
    }

    @Test
    void submitAnswer_evaluatesAnswerAndAdvancesTurn() {
        AiInterview interview = new AiInterview();
        interview.setId(101L);
        interview.setUserId(1L);
        interview.setTrack("JAVA_SPRING");
        interview.setLevel("MID");
        interview.setStatus("IN_PROGRESS");
        when(interviewRepo.findByIdAndUserId(101L, 1L)).thenReturn(Optional.of(interview));

        AiInterviewTurn turn1 = new AiInterviewTurn();
        turn1.setId(501L);
        turn1.setInterviewId(101L);
        turn1.setTurnIndex(1);
        turn1.setTopic("Concurrency");
        turn1.setQuestion("Explain Virtual Threads.");
        when(turnRepo.findByInterviewIdOrderByTurnIndexAsc(101L)).thenReturn(List.of(turn1));
        when(turnRepo.save(any(AiInterviewTurn.class))).thenAnswer(inv -> inv.getArgument(0));

        InterviewDtos.SubmitAnswerRequest answerReq = new InterviewDtos.SubmitAnswerRequest(
                "Virtual threads are managed by the JVM instead of the OS kernel, allowing millions of concurrent tasks with minimal memory overhead while unmounting when blocking on I/O."
        );

        InterviewDtos.TurnEvaluationDto eval = service.submitAnswer(1L, 101L, answerReq);

        assertThat(eval).isNotNull();
        assertThat(eval.turnIndex()).isEqualTo(1);
        assertThat(eval.score()).isGreaterThanOrEqualTo(60);
        assertThat(eval.isFinished()).isFalse();
        assertThat(eval.nextQuestion()).isNotBlank();
        assertThat(eval.aiEvaluation()).contains("Score:");
    }

    @Test
    void startTest_createsProctoredTestSession() {
        ProctoredTest test = new ProctoredTest();
        test.setId(201L);
        test.setUserId(1L);
        test.setTitle("Full Stack Coding Test");
        test.setTrack("FULL_STACK");
        test.setDurationMinutes(45);
        test.setStatus("IN_PROGRESS");
        when(testRepo.save(any(ProctoredTest.class))).thenReturn(test);

        InterviewDtos.StartTestRequest req = new InterviewDtos.StartTestRequest(
                "FULL_STACK",
                "Full Stack Coding Test",
                45
        );

        InterviewDtos.TestSessionDto session = service.startTest(1L, req);

        assertThat(session).isNotNull();
        assertThat(session.id()).isEqualTo(201L);
        assertThat(session.mcqs()).isNotEmpty();
        assertThat(session.codingProblems()).isNotEmpty();
    }

    @Test
    void submitTest_evaluatesScoreAndProctoringIntegrity() {
        ProctoredTest test = new ProctoredTest();
        test.setId(201L);
        test.setUserId(1L);
        test.setTitle("Full Stack Coding Test");
        test.setTrack("FULL_STACK");
        test.setStatus("IN_PROGRESS");
        when(testRepo.findByIdAndUserId(201L, 1L)).thenReturn(Optional.of(test));
        when(testRepo.save(any(ProctoredTest.class))).thenAnswer(inv -> inv.getArgument(0));

        // Submit correct MCQs (q1->1, q2->1, q3->2, q4->2, q5->1)
        Map<String, Integer> mcqAnswers = Map.of(
                "1", 1,
                "2", 1,
                "3", 2,
                "4", 2,
                "5", 1
        );

        // 1 tab switch violation (-15 integrity score)
        List<InterviewDtos.ProctoringViolationDto> violations = List.of(
                new InterviewDtos.ProctoringViolationDto("TAB_SWITCH", "User navigated away from test window", System.currentTimeMillis())
        );

        InterviewDtos.SubmitTestRequest req = new InterviewDtos.SubmitTestRequest(
                mcqAnswers,
                "public class Solution {}",
                "java",
                1,
                violations
        );

        InterviewDtos.TestResultDto result = service.submitTest(1L, 201L, req);

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("SUBMITTED");
        assertThat(result.mcqScore()).isEqualTo(50); // 5/5 correct = 50 pts
        assertThat(result.integrityScore()).isEqualTo(85); // 100 - 15 = 85
        assertThat(result.proctoringVerdict()).isEqualTo("CLEARED");
    }
}
