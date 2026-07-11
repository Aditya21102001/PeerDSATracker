package com.peerdsa.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire contracts for the chat API. */
public final class ChatDtos {

    private ChatDtos() {}

    /** A conversation as shown in the widget's thread list. */
    public record ConversationView(Long id, String title, Instant updatedAt) {
        static ConversationView from(ChatConversation c) {
            return new ConversationView(c.getId(), c.getTitle(), c.getUpdatedAt());
        }
    }

    /** One stored turn. */
    public record MessageView(Long id, String role, String content, Instant createdAt) {
        static MessageView from(ChatMessage m) {
            return new MessageView(m.getId(), m.getRole(), m.getContent(), m.getCreatedAt());
        }
    }

    /** A conversation together with its messages, returned when the widget opens a thread. */
    public record ConversationDetail(Long id, String title, List<MessageView> messages) {}

    /**
     * A user turn to send. {@code conversationId} is null to start a new thread. The content cap
     * bounds both the request payload and the tokens sent upstream.
     */
    public record SendRequest(
            Long conversationId,
            @NotBlank @Size(max = 8_000) String content) {}
}
