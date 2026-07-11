package com.peerdsa.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Conversations, always scoped by owner so one user can never read another's threads. */
public interface ChatConversationRepository extends JpaRepository<ChatConversation, Long> {

    List<ChatConversation> findByUserIdOrderByUpdatedAtDesc(Long userId);

    /** Ownership-checked lookup: returns empty when the id belongs to someone else. */
    Optional<ChatConversation> findByIdAndUserId(Long id, Long userId);
}
