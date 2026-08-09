package com.peerdsa.messaging;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for direct messages. Two small repositories, kept together for readability. */
public final class DmRepositories {

    private DmRepositories() {}

    public interface Conversations extends JpaRepository<DmConversation, Long> {

        /** The pair is stored canonically, so the caller must pass (min, max). */
        Optional<DmConversation> findByUserLoIdAndUserHiId(Long lo, Long hi);

        /**
         * Every conversation this user is in, most recently active first. A participant can be on
         * either side of the pair, hence the OR -- and both branches are indexed.
         */
        @Query("""
                select c from DmConversation c
                where c.userLoId = :userId or c.userHiId = :userId
                order by c.lastMessageAt desc nulls last, c.id desc
                """)
        List<DmConversation> findForUser(@Param("userId") Long userId);
    }

    public interface Messages extends JpaRepository<DmMessage, Long> {

        /** Newest first; the UI reverses for display. Paged so a long thread is not loaded whole. */
        List<DmMessage> findByConversationIdOrderByCreatedAtDesc(Long conversationId, Pageable page);

        /**
         * How many messages the other person has sent since this user last opened the thread.
         * Derived rather than stored, so an unread badge can never drift from the messages.
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
}
