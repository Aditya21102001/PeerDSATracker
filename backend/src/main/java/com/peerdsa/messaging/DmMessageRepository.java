package com.peerdsa.messaging;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for direct messages. */
public interface DmMessageRepository extends JpaRepository<DmMessage, Long> {

    /** Newest first; the UI reverses for display. Paged so a long thread is not loaded whole. */
    List<DmMessage> findByConversationIdOrderByCreatedAtDesc(Long conversationId, Pageable page);

    /**
     * How many messages the other person has sent since this user last opened the thread. Derived
     * rather than stored, so an unread badge can never drift from the messages.
     *
     * <p>{@code since} must never be null. It used to be, guarded by {@code (:since is null or ...)},
     * and that made a null binding load-bearing: a parameter that appears in {@code is null} carries
     * no type of its own, so whether it works at all depends on Hibernate inferring the type from the
     * other comparison and rendering it in a form PostgreSQL will accept. "Never opened this thread"
     * is the ordinary case for a conversation that has just been created, so that fragility sat
     * directly on the path taken every single time somebody opened a new thread.
     *
     * <p>Callers pass {@link java.time.Instant#EPOCH} instead, which means the same thing -- count
     * everything -- with a type the driver never has to guess at.
     */
    @Query("""
            select count(m) from DmMessage m
            where m.conversationId = :conversationId
              and m.senderId <> :userId
              and m.createdAt > :since
            """)
    long countUnread(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId,
            @Param("since") Instant since);

    /** Per-sender rate limiting. Counts what this user has sent recently, anywhere. */
    long countBySenderIdAndCreatedAtAfter(Long senderId, Instant after);
}
