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
     */
    @Query("""
            select count(m) from DmMessage m
            where m.conversationId = :conversationId
              and m.senderId <> :userId
              and (:since is null or m.createdAt > :since)
            """)
    long countUnread(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId,
            @Param("since") Instant since);

    /** Per-sender rate limiting. Counts what this user has sent recently, anywhere. */
    long countBySenderIdAndCreatedAtAfter(Long senderId, Instant after);
}
