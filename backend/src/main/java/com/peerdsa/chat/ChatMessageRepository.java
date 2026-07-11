package com.peerdsa.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Messages within a conversation, read in insertion (id) order. */
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findByConversationIdOrderByIdAsc(Long conversationId);
}
