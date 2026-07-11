package com.peerdsa.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.config.OpenRouterProperties;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * Chat persistence. The load-bearing property is ownership: a conversation is only ever reachable
 * by the user it belongs to, so a read or delete of someone else's id must 404, never leak.
 */
class ChatServiceTest {

    private ChatConversationRepository conversations;
    private ChatMessageRepository messages;
    private ChatService service;

    @BeforeEach
    void setUp() {
        conversations = mock(ChatConversationRepository.class);
        messages = mock(ChatMessageRepository.class);
        OpenRouterProperties props = new OpenRouterProperties(
                "sk-test", "http://x", "m:free", "sys", 20,
                Duration.ofSeconds(1), Duration.ofSeconds(1), "r", "t");
        service = new ChatService(conversations, messages, props);
    }

    @Test
    void readingSomeoneElsesConversationIs404() {
        when(conversations.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.conversationDetail(1L, 99L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));

        verify(messages, never()).findByConversationIdOrderByIdAsc(anyLong());
    }

    @Test
    void deletingSomeoneElsesConversationIs404AndDeletesNothing() {
        when(conversations.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteConversation(1L, 99L))
                .isInstanceOf(ResponseStatusException.class);

        verify(conversations, never()).delete(any());
    }

    @Test
    void prepareTurnCreatesAConversationTitledFromTheMessageAndReturnsTheUserTurn() {
        // save() assigns the generated id, as the database would.
        when(conversations.save(any())).thenAnswer(inv -> {
            ChatConversation c = inv.getArgument(0);
            if (c.getId() == null) {
                ReflectionTestUtils.setField(c, "id", 5L);
            }
            return c;
        });
        when(messages.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messages.findByConversationIdOrderByIdAsc(5L))
                .thenReturn(List.of(ChatMessage.user(5L, "How does Dijkstra work?")));

        ChatService.Prepared prepared =
                service.prepareTurn(7L, new ChatDtos.SendRequest(null, "How does Dijkstra work?"));

        assertThat(prepared.conversationId()).isEqualTo(5L);
        assertThat(prepared.turns()).singleElement().satisfies(turn -> {
            assertThat(turn.role()).isEqualTo("user");
            assertThat(turn.content()).isEqualTo("How does Dijkstra work?");
        });
    }

    @Test
    void prepareTurnOnAnExistingConversationChecksOwnership() {
        when(conversations.findByIdAndUserId(3L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.prepareTurn(7L, new ChatDtos.SendRequest(3L, "hi")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));

        verify(messages, never()).save(any());
    }
}
