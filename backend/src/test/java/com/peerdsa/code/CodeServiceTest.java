package com.peerdsa.code;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.analytics.AnalyticsClient;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteRequest;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.progress.ProblemStatus;
import com.peerdsa.progress.ProgressService;
import com.peerdsa.sheet.Difficulty;
import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;

class CodeServiceTest {

    private static final long USER_ID = 101L;
    private static final long PROBLEM_ID = 1L;

    private CodeSubmissionRepository submissions;
    private ProblemRepository problems;
    private AnalyticsClient analytics;
    private TestCaseRepository testCases;
    private ProblemSubmissionRepository problemSubmissions;
    private ProgressService progressService;
    private UserRepository users;
    private CodeService codeService;

    private User user;
    private Problem problem;

    @BeforeEach
    void setUp() throws Exception {
        submissions = mock(CodeSubmissionRepository.class);
        problems = mock(ProblemRepository.class);
        analytics = mock(AnalyticsClient.class);
        testCases = mock(TestCaseRepository.class);
        problemSubmissions = mock(ProblemSubmissionRepository.class);
        progressService = mock(ProgressService.class);
        users = mock(UserRepository.class);

        codeService = new CodeService(
                submissions,
                problems,
                analytics,
                testCases,
                problemSubmissions,
                progressService,
                users);

        user = new User();
        setField(user, "id", USER_ID);
        setField(user, "xp", 50);
        setField(user, "totalSolved", 2);
        setField(user, "currentStreak", 1);

        problem = new Problem();
        setField(problem, "id", PROBLEM_ID);
        setField(problem, "difficulty", Difficulty.EASY);
        setField(problem, "title", "Input Output");

        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
        when(problems.findById(PROBLEM_ID)).thenReturn(Optional.of(problem));
        when(submissions.findByUserIdAndProblemIdAndLanguage(eq(USER_ID), eq(PROBLEM_ID), any()))
                .thenReturn(Optional.empty());
        when(submissions.save(any())).thenAnswer((Answer<CodeSubmission>) i -> i.getArgument(0));
        when(problemSubmissions.save(any())).thenAnswer((Answer<ProblemSubmission>) i -> i.getArgument(0));
    }

    @Test
    void submit_passesAllTestCases_marksProblemSolvedAndAwardsXp() {
        TestCase tc1 = new TestCase(problem, "42\n", "42", true, 1);
        TestCase tc2 = new TestCase(problem, "100\n", "100", false, 2);
        when(testCases.findByProblemIdOrderByPositionAsc(PROBLEM_ID)).thenReturn(List.of(tc1, tc2));
        when(progressService.statusesFor(USER_ID, List.of(PROBLEM_ID))).thenReturn(Map.of());

        // First test case run returns 42
        when(analytics.execute(new ExecuteRequest("python", "print(input())", "42\n")))
                .thenReturn(new ExecuteResult(true, "python", "3.10", "42\n", "", null, 0, null, null));
        // Second test case run returns 100
        when(analytics.execute(new ExecuteRequest("python", "print(input())", "100\n")))
                .thenReturn(new ExecuteResult(true, "python", "3.10", "100\n", "", null, 0, null, null));

        CodeService.SubmitResult result =
                codeService.submit(USER_ID, PROBLEM_ID, "python", "print(input())", "");

        assertThat(result.accepted()).isTrue();
        assertThat(result.submission().verdict()).isEqualTo(SubmissionVerdict.ACCEPTED);
        assertThat(result.submission().passedTestCases()).isEqualTo(2);
        assertThat(result.submission().totalTestCases()).isEqualTo(2);
        assertThat(result.newlySolved()).isTrue();
        assertThat(result.xpEarned()).isEqualTo(10); // Easy = 10 XP

        // Verifies status transition to SOLVED was triggered
        verify(progressService).setStatus(USER_ID, PROBLEM_ID, ProblemStatus.SOLVED);
    }

    @Test
    void submit_wrongAnswerOnTestCase_doesNotMarkSolved() {
        TestCase tc1 = new TestCase(problem, "42\n", "42", true, 1);
        when(testCases.findByProblemIdOrderByPositionAsc(PROBLEM_ID)).thenReturn(List.of(tc1));

        // Returns incorrect output "99" instead of "42"
        when(analytics.execute(new ExecuteRequest("python", "print(99)", "42\n")))
                .thenReturn(new ExecuteResult(true, "python", "3.10", "99\n", "", null, 0, null, null));

        CodeService.SubmitResult result = codeService.submit(USER_ID, PROBLEM_ID, "python", "print(99)", "");

        assertThat(result.accepted()).isFalse();
        assertThat(result.submission().verdict()).isEqualTo(SubmissionVerdict.WRONG_ANSWER);
        assertThat(result.submission().passedTestCases()).isEqualTo(0);
        assertThat(result.submission().totalTestCases()).isEqualTo(1);
        assertThat(result.newlySolved()).isFalse();

        // Verifies status transition was NEVER called
        verify(progressService, never()).setStatus(any(), any(), any());
    }

    @Test
    void submit_compileError_recordsCompileOutputAndDoesNotMarkSolved() {
        TestCase tc1 = new TestCase(problem, "42\n", "42", true, 1);
        when(testCases.findByProblemIdOrderByPositionAsc(PROBLEM_ID)).thenReturn(List.of(tc1));

        when(analytics.execute(any()))
                .thenReturn(new ExecuteResult(
                        false, "c++", "11.2", "", "error: expected ';'", "error: expected ';'", 1, null, null));

        CodeService.SubmitResult result = codeService.submit(USER_ID, PROBLEM_ID, "c++", "bad code", "");

        assertThat(result.accepted()).isFalse();
        assertThat(result.submission().verdict()).isEqualTo(SubmissionVerdict.COMPILE_ERROR);
        assertThat(result.submission().compileOutput()).contains("error: expected ';'");
        verify(progressService, never()).setStatus(any(), any(), any());
    }

    private static void setField(Object target, String fieldName, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }
}
