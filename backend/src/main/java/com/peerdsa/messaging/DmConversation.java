package com.peerdsa.messaging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A conversation between two peers.
 *
 * <p>The pair is stored in canonical order -- lower user id in {@code userLoId} -- and the database
 * enforces both the ordering and the uniqueness of the pair. That is what makes "exactly one
 * conversation between two people" true rather than merely intended: without it, two people opening
 * a thread simultaneously each create one, and each then sees only their own half of the exchange.
 *
 * <p>Everything here is written through {@link MessagingService}, which checks participation on
 * every read and every write. Nothing in this class enforces access on its own.
 */
@Entity
@Table(name = "dm_conversations")
public class DmConversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_lo_id", nullable = false, updatable = false)
    private Long userLoId;

    @Column(name = "user_hi_id", nullable = false, updatable = false)
    private Long userHiId;

    @Column(name = "lo_last_read_at")
    private Instant loLastReadAt;

    @Column(name = "hi_last_read_at")
    private Instant hiLastReadAt;

    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    protected DmConversation() {}

    /** Orders the pair so the caller never has to. Rejects a conversation with oneself. */
    public static DmConversation between(Long a, Long b) {
        if (a == null || b == null || a.equals(b)) {
            throw new IllegalArgumentException("a conversation needs two distinct users");
        }
        DmConversation c = new DmConversation();
        c.userLoId = Math.min(a, b);
        c.userHiId = Math.max(a, b);
        return c;
    }

    public Long getId() {
        return id;
    }

    public Long getUserLoId() {
        return userLoId;
    }

    public Long getUserHiId() {
        return userHiId;
    }

    public Instant getLastMessageAt() {
        return lastMessageAt;
    }

    /** True only for the two people in it. Every read and write is gated on this. */
    public boolean includes(Long userId) {
        return userLoId.equals(userId) || userHiId.equals(userId);
    }

    /** The other person, from {@code userId}'s point of view. */
    public Long otherThan(Long userId) {
        return userLoId.equals(userId) ? userHiId : userLoId;
    }

    /** When this user last opened the thread; null if they never have. */
    public Instant lastReadBy(Long userId) {
        return userLoId.equals(userId) ? loLastReadAt : hiLastReadAt;
    }

    public void markRead(Long userId, Instant at) {
        if (userLoId.equals(userId)) {
            loLastReadAt = at;
        } else {
            hiLastReadAt = at;
        }
    }

    public void recordMessageAt(Instant at) {
        this.lastMessageAt = at;
    }
}
