package com.peerdsa.chat;

import com.peerdsa.config.OpenRouterProperties;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs a chat completion on a background thread and streams it to the browser as Server-Sent
 * Events. Three event types cross the wire: {@code token} (a reply fragment, JSON-encoded so
 * newlines survive), {@code done} (final metadata, carrying the conversation id a new thread was
 * assigned), and {@code error} (a caller-safe message). The user's turn is persisted synchronously
 * before streaming begins; the assistant's is persisted once the stream completes cleanly.
 *
 * <p>Concurrency is bounded by a small fixed pool: on a 0.1-CPU free instance, holding an unbounded
 * number of streaming threads open would be the fastest way to fall over.
 */
@Component
public class ChatStreamer {

    private static final Logger log = LoggerFactory.getLogger(ChatStreamer.class);

    private final ChatService chatService;
    private final OpenRouterClient openRouter;
    private final ObjectMapper mapper;
    private final long emitterTimeoutMillis;
    private final ExecutorService executor;

    public ChatStreamer(ChatService chatService, OpenRouterClient openRouter, ObjectMapper mapper,
            OpenRouterProperties props) {
        this.chatService = chatService;
        this.openRouter = openRouter;
        this.mapper = mapper;
        // Outlast the upstream read budget so the client is never cut off before OpenRouter is.
        this.emitterTimeoutMillis = props.readTimeout().toMillis() + 30_000;
        this.executor = Executors.newFixedThreadPool(4, daemonThreads());
    }

    /**
     * Persists the user turn, then returns an emitter that will stream the assistant's reply.
     * Persistence happens on the caller thread so a bad request (e.g. someone else's conversation)
     * fails as a plain 404 before any emitter is opened.
     */
    public SseEmitter stream(Long userId, ChatDtos.SendRequest request) {
        ChatService.Prepared prepared = chatService.prepareTurn(userId, request);

        SseEmitter emitter = new SseEmitter(emitterTimeoutMillis);
        // If the browser goes away mid-stream, stop caring quietly.
        emitter.onError(e -> log.debug("Chat SSE errored for conversation {}", prepared.conversationId(), e));
        emitter.onTimeout(emitter::complete);

        executor.submit(() -> runStream(emitter, prepared));
        return emitter;
    }

    private void runStream(SseEmitter emitter, ChatService.Prepared prepared) {
        try {
            String reply = openRouter.streamReply(
                    openRouter.withSystemPrompt(prepared.turns()),
                    token -> send(emitter, "token", mapper.writeValueAsString(token)));

            if (!reply.isBlank()) {
                chatService.appendAssistant(prepared.conversationId(), reply);
            }
            send(emitter, "done", "{\"conversationId\":" + prepared.conversationId() + "}");
            emitter.complete();
        } catch (ResponseStatusException e) {
            failGracefully(emitter, e.getReason() != null ? e.getReason() : "The assistant is unavailable right now.");
        } catch (RuntimeException e) {
            // The commonest cause here is the client disconnecting, which makes send() throw.
            log.debug("Chat stream ended early for conversation {}", prepared.conversationId(), e);
            emitter.complete();
        }
    }

    /** Sends one SSE event; a failure means the client is gone, so let it bubble to end the stream. */
    private void send(SseEmitter emitter, String event, String jsonData) {
        try {
            emitter.send(SseEmitter.event().name(event).data(jsonData));
        } catch (java.io.IOException e) {
            throw new ClientGoneException(e);
        }
    }

    private void failGracefully(SseEmitter emitter, String message) {
        try {
            send(emitter, "error", "{\"message\":" + mapper.writeValueAsString(message) + "}");
        } catch (RuntimeException ignored) {
            // Client already gone; nothing to report to.
        }
        emitter.complete();
    }

    private static ThreadFactory daemonThreads() {
        AtomicInteger n = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, "chat-stream-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    /** Marks a send failure caused by the client having disconnected. */
    private static final class ClientGoneException extends RuntimeException {
        ClientGoneException(Throwable cause) {
            super(cause);
        }
    }
}
