package com.peerdsa.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One turn in a conversation. {@code role} is 'user' or 'assistant' -- the system prompt is never
 * stored (see V8__chat.sql). Held by {@code conversationId} rather than a JPA relation so a long
 * history can be streamed and persisted without dragging the parent graph into every read.
 */
@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    public static final String ROLE_USER = "user";
    public static final String ROLE_ASSISTANT = "assistant";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected ChatMessage() {}

    public ChatMessage(Long conversationId, String role, String content) {
        this.conversationId = conversationId;
        this.role = role;
        this.content = content;
    }

    public static ChatMessage user(Long conversationId, String content) {
        return new ChatMessage(conversationId, ROLE_USER, content);
    }

    public static ChatMessage assistant(Long conversationId, String content) {
        return new ChatMessage(conversationId, ROLE_ASSISTANT, content);
    }

    public Long getId() {
        return id;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
