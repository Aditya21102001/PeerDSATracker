package com.peerdsa.messaging;

import com.peerdsa.messaging.MessagingDtos.ConversationView;
import com.peerdsa.messaging.MessagingDtos.MessageView;
import com.peerdsa.messaging.MessagingDtos.OpenRequest;
import com.peerdsa.messaging.MessagingDtos.SendRequest;
import com.peerdsa.messaging.MessagingDtos.UnreadCount;
import com.peerdsa.user.User;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Peer-to-peer messaging.
 *
 * <p>Every endpoint takes its user from the authenticated session. Nothing here accepts a user id
 * in a body or a path, so there is no request shape that could ask to read somebody else's
 * conversation; {@link MessagingService} re-checks participation regardless.
 */
@RestController
@RequestMapping("/api/messages")
public class MessagingController {

    private final MessagingService messaging;
    private final MessageStream stream;
    private final long streamTimeoutMillis;

    public MessagingController(
            MessagingService messaging,
            MessageStream stream,
            @Value("${app.messaging.stream-timeout-millis:600000}") long streamTimeoutMillis) {
        this.messaging = messaging;
        this.stream = stream;
        this.streamTimeoutMillis = streamTimeoutMillis;
    }

    @GetMapping("/conversations")
    public List<ConversationView> conversations(@AuthenticationPrincipal User user) {
        return messaging.conversationsFor(user.getId());
    }

    /** Finds or creates the thread with a peer. 403 unless the two follow each other. */
    @PostMapping("/conversations")
    public ConversationView open(@AuthenticationPrincipal User user, @RequestBody OpenRequest request) {
        return messaging.openWith(user.getId(), request.peerId());
    }

    /** Opening the thread is also what marks it read; there is no separate call to forget. */
    @GetMapping("/conversations/{id}")
    public List<MessageView> messages(@AuthenticationPrincipal User user, @PathVariable Long id) {
        return messaging.messagesIn(user.getId(), id);
    }

    @PostMapping("/conversations/{id}")
    public MessageView send(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @Valid @RequestBody SendRequest request) {
        return messaging.send(user.getId(), id, request.body());
    }

    /** For when the thread is already open and a message arrives over the stream. */
    @PostMapping("/conversations/{id}/read")
    public ResponseEntity<Void> markRead(@AuthenticationPrincipal User user, @PathVariable Long id) {
        messaging.markRead(user.getId(), id);
        return ResponseEntity.noContent().build();
    }

    /** Drives the badge. Cheap enough to poll on a slow interval as the stream's safety net. */
    @GetMapping("/unread")
    public UnreadCount unread(@AuthenticationPrincipal User user) {
        return new UnreadCount(messaging.unreadTotal(user.getId()));
    }

    /**
     * The live stream.
     *
     * <p>Authenticated by the ordinary bearer token, which means the client cannot use
     * {@code EventSource} -- it has no way to set a header. The frontend uses {@code fetch} with
     * {@code Accept: text/event-stream} and parses the body itself, exactly as the AI assistant
     * already does. The alternative, a token in the query string, would write credentials into
     * every access log and proxy trace between here and the browser.
     *
     * <p>The timeout is deliberate rather than infinite: Render's free tier drops idle connections
     * anyway, and a bounded stream makes the client's reconnect path the normal case rather than an
     * error path that only runs in production.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@AuthenticationPrincipal User user) {
        return stream.subscribe(user.getId(), streamTimeoutMillis);
    }
}
