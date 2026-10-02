package com.peerdsa.interview;

import com.peerdsa.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InterviewControllerTest {

    @Mock
    private InterviewService interviewService;

    private InterviewController controller;
    private User testUser;

    @BeforeEach
    void setUp() throws Exception {
        controller = new InterviewController(interviewService);

        testUser = new User();
        setField(testUser, "id", 42L);
        testUser.setUsername("testcoder");
        testUser.setEmail("testcoder@example.com");
        testUser.setRole("USER");
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    @Test
    void startInterview_whenUserIsNull_throwsUnauthorized() {
        InterviewDtos.StartInterviewRequest req = new InterviewDtos.StartInterviewRequest("JAVA_SPRING", "Engineer", "MID");

        assertThatThrownBy(() -> controller.startInterview(null, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    void startInterview_whenAuthenticated_delegatesToService() {
        InterviewDtos.StartInterviewRequest req = new InterviewDtos.StartInterviewRequest("JAVA_SPRING", "Senior Java Engineer", "SENIOR");
        InterviewDtos.InterviewSessionDto sessionDto = new InterviewDtos.InterviewSessionDto(
                101L, "JAVA_SPRING", "Senior Java Engineer", "SENIOR", "IN_PROGRESS",
                0, 0, 0, 0, "", "", "", "", List.of(), Instant.now(), null
        );

        when(interviewService.startInterview(eq(42L), any())).thenReturn(sessionDto);

        ResponseEntity<InterviewDtos.InterviewSessionDto> response = controller.startInterview(testUser, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().id()).isEqualTo(101L);
    }

    @Test
    void submitAnswer_whenUserIsNull_throwsUnauthorized() {
        InterviewDtos.SubmitAnswerRequest req = new InterviewDtos.SubmitAnswerRequest("Answer content");

        assertThatThrownBy(() -> controller.submitAnswer(null, 101L, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    void startTest_whenUserIsNull_throwsUnauthorized() {
        InterviewDtos.StartTestRequest req = new InterviewDtos.StartTestRequest("FULL_STACK", "Assessment", 45);

        assertThatThrownBy(() -> controller.startTest(null, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }
}
