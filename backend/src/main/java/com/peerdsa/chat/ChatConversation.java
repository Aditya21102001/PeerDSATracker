package com.peerdsa.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

/** One chat thread belonging to a user. Its messages are loaded separately, ordered by id. */
@Entity
@Table(name = "chat_conversations")
public class ChatConversation {

    /** Titles are derived from the first user message; keep them short enough to fit the widget. */
    static final int MAX_TITLE_LENGTH = 80;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String title = "New chat";

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected ChatConversation() {}

    public ChatConversation(Long userId) {
        this.userId = userId;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /** Bumps updatedAt so the conversation floats to the top of the list after a reply. */
    public void touch() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        if (title == null || title.isBlank()) {
            return;
        }
        String trimmed = title.strip();
        this.title = trimmed.length() > MAX_TITLE_LENGTH ? trimmed.substring(0, MAX_TITLE_LENGTH) : trimmed;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
