package com.peerdsa.messaging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** One message in a {@link DmConversation}. Immutable once sent: there is no edit path. */
@Entity
@Table(name = "dm_messages")
public class DmMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false, updatable = false)
    private Long conversationId;

    @Column(name = "sender_id", nullable = false, updatable = false)
    private Long senderId;

    @Column(nullable = false, updatable = false)
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected DmMessage() {}

    public DmMessage(Long conversationId, Long senderId, String body) {
        this.conversationId = conversationId;
        this.senderId = senderId;
        this.body = body;
    }

    public Long getId() {
        return id;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public Long getSenderId() {
        return senderId;
    }

    public String getBody() {
        return body;
    }

    /** Written by the database default, so it is null until the row has been read back. */
    public Instant getCreatedAt() {
        return createdAt;
    }
}
