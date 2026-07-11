package com.peerdsa.chat;

import com.peerdsa.chat.ChatDtos.ConversationDetail;
import com.peerdsa.chat.ChatDtos.ConversationView;
import com.peerdsa.chat.ChatDtos.SendRequest;
import com.peerdsa.user.User;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The AI assistant. Every endpoint is authenticated and scoped to the caller: conversations belong
 * to a user and are never shared. The reply is streamed as Server-Sent Events by {@link ChatStreamer};
 * the CRUD endpoints are ordinary JSON.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chat;
    private final ChatStreamer streamer;

    public ChatController(ChatService chat, ChatStreamer streamer) {
        this.chat = chat;
        this.streamer = streamer;
    }

    @GetMapping("/conversations")
    public List<ConversationView> conversations(@AuthenticationPrincipal User user) {
        return chat.listConversations(user.getId());
    }

    @GetMapping("/conversations/{id}")
    public ConversationDetail conversation(@AuthenticationPrincipal User user, @PathVariable Long id) {
        return chat.conversationDetail(user.getId(), id);
    }

    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal User user, @PathVariable Long id) {
        chat.deleteConversation(user.getId(), id);
        return ResponseEntity.noContent().build();
    }

    /** Sends a user turn and streams the assistant's reply token-by-token. */
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@AuthenticationPrincipal User user, @Valid @RequestBody SendRequest request) {
        return streamer.stream(user.getId(), request);
    }
}
