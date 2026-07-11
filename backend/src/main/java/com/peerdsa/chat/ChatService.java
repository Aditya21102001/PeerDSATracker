package com.peerdsa.chat;

import com.peerdsa.chat.ChatDtos.ConversationDetail;
import com.peerdsa.chat.ChatDtos.ConversationView;
import com.peerdsa.chat.ChatDtos.MessageView;
import com.peerdsa.config.OpenRouterProperties;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Transactional persistence for chat. Kept apart from {@link ChatStreamer} on purpose: the streamer
 * calls {@link #prepareTurn} and {@link #appendAssistant} from a background thread, and only a
 * cross-bean call goes through the Spring proxy, so these {@code @Transactional} boundaries actually
 * apply. Every read and delete is scoped by {@code userId}, so one user can never touch another's
 * threads.
 */
@Service
public class ChatService {

    private final ChatConversationRepository conversations;
    private final ChatMessageRepository messages;
    private final OpenRouterProperties props;

    public ChatService(
            ChatConversationRepository conversations,
            ChatMessageRepository messages,
            OpenRouterProperties props) {
        this.conversations = conversations;
        this.messages = messages;
        this.props = props;
    }

    /** Everything the streamer needs after the user turn is persisted: the id, and the context. */
    public record Prepared(Long conversationId, List<OpenRouterClient.Turn> turns) {}

    @Transactional(readOnly = true)
    public List<ConversationView> listConversations(Long userId) {
        return conversations.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(ConversationView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ConversationDetail conversationDetail(Long userId, Long conversationId) {
        ChatConversation conversation = requireOwned(userId, conversationId);
        List<MessageView> view = messages.findByConversationIdOrderByIdAsc(conversationId).stream()
                .map(MessageView::from)
                .toList();
        return new ConversationDetail(conversation.getId(), conversation.getTitle(), view);
    }

    @Transactional
    public void deleteConversation(Long userId, Long conversationId) {
        ChatConversation conversation = requireOwned(userId, conversationId);
        // chat_messages cascades on the FK, so deleting the parent clears the thread.
        conversations.delete(conversation);
    }

    /**
     * Persists the user's turn (creating the conversation if needed) and returns the context to
     * send upstream: the system prompt is added later by the client, and history is capped to
     * {@code app.openrouter.max-history} most-recent messages to bound the token bill.
     */
    @Transactional
    public Prepared prepareTurn(Long userId, ChatDtos.SendRequest request) {
        ChatConversation conversation;
        boolean isNew = request.conversationId() == null;
        if (isNew) {
            conversation = conversations.save(new ChatConversation(userId));
        } else {
            conversation = requireOwned(userId, request.conversationId());
        }

        if (isNew) {
            conversation.setTitle(titleFrom(request.content()));
        }
        conversation.touch();
        conversations.save(conversation);

        messages.save(ChatMessage.user(conversation.getId(), request.content()));

        List<ChatMessage> history = messages.findByConversationIdOrderByIdAsc(conversation.getId());
        List<ChatMessage> recent = capToRecent(history);
        List<OpenRouterClient.Turn> turns = recent.stream()
                .map(m -> new OpenRouterClient.Turn(m.getRole(), m.getContent()))
                .toList();

        return new Prepared(conversation.getId(), turns);
    }

    /** Stores the assistant's completed reply and floats the conversation to the top of the list. */
    @Transactional
    public void appendAssistant(Long conversationId, String content) {
        messages.save(ChatMessage.assistant(conversationId, content));
        conversations.findById(conversationId).ifPresent(c -> {
            c.touch();
            conversations.save(c);
        });
    }

    private ChatConversation requireOwned(Long userId, Long conversationId) {
        return conversations.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
    }

    private List<ChatMessage> capToRecent(List<ChatMessage> history) {
        int max = props.maxHistory();
        if (max <= 0 || history.size() <= max) {
            return history;
        }
        return history.subList(history.size() - max, history.size());
    }

    private static String titleFrom(String content) {
        return content.replaceAll("\\s+", " ").strip();
    }
}
