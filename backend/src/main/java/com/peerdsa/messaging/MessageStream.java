package com.peerdsa.messaging;

import com.peerdsa.messaging.MessagingDtos.MessageView;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live delivery of new messages, over Server-Sent Events.
 *
 * <p><b>In-memory, and therefore single-instance.</b> Emitters live in this process, so a message
 * sent on one instance is only pushed to listeners connected to that same instance. That is correct
 * today -- the deployment is one Render instance -- and it is the first thing that breaks on
 * scaling out. The fix at that point is a shared broker (Redis pub/sub, Postgres LISTEN/NOTIFY),
 * not more emitters. It is written down here because the failure is silent: messages still save and
 * still appear on the next fetch, so nobody notices until someone asks why chat feels slow.
 *
 * <p>Delivery is deliberately best-effort. A send must never fail because a listener's connection
 * died -- the message is already committed, and the client will pick it up on its next load. Every
 * failure here is a dead connection to forget, not an error to propagate.
 */
@Component
public class MessageStream {

    private static final Logger log = LoggerFactory.getLogger(MessageStream.class);

    /**
     * One user can have several: two tabs, a phone and a laptop. All of them get every message, so
     * a conversation open in one place does not go stale in another.
     */
    private final Map<Long, Set<SseEmitter>> listeners = new ConcurrentHashMap<>();

    /** Registers a listener for this user. The caller returns the emitter to Spring. */
    public SseEmitter subscribe(Long userId, long timeoutMillis) {
        SseEmitter emitter = new SseEmitter(timeoutMillis);

        listeners.computeIfAbsent(userId, id -> ConcurrentHashMap.newKeySet()).add(emitter);

        // All three paths must deregister, or a reconnecting client leaks an emitter per attempt
        // and the map grows without bound.
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(e -> remove(userId, emitter));

        try {
            // An immediate event, so the client knows the stream is live rather than merely opened.
            emitter.send(SseEmitter.event().name("ready").data("{}"));
        } catch (IOException e) {
            remove(userId, emitter);
        }
        return emitter;
    }

    /** Pushes a message to every connection this user currently holds. */
    public void publish(Long userId, Long conversationId, MessageView message) {
        Set<SseEmitter> forUser = listeners.get(userId);
        if (forUser == null || forUser.isEmpty()) {
            return; // nobody listening; the message is saved and will arrive on the next fetch
        }
        for (SseEmitter emitter : forUser) {
            try {
                emitter.send(SseEmitter.event().name("message").data(message));
            } catch (Exception e) {
                // Almost always just a closed tab.
                remove(userId, emitter);
            }
        }
    }

    /** Keeps proxies from closing an idle stream, and lets a client notice a dead one. */
    public void heartbeat() {
        listeners.forEach((userId, set) -> {
            for (SseEmitter emitter : set) {
                try {
                    emitter.send(SseEmitter.event().comment("keep-alive"));
                } catch (Exception e) {
                    remove(userId, emitter);
                }
            }
        });
    }

    /** How many connections are open. Exposed for logging and tests, not for callers to act on. */
    public int connectionCount() {
        return listeners.values().stream().mapToInt(Set::size).sum();
    }

    private void remove(Long userId, SseEmitter emitter) {
        Set<SseEmitter> forUser = listeners.get(userId);
        if (forUser == null) {
            return;
        }
        forUser.remove(emitter);
        // Drop the empty set too, so the map does not accumulate an entry per user who ever
        // connected.
        if (forUser.isEmpty()) {
            listeners.remove(userId, forUser);
        }
        log.debug("Message stream closed for user {}; {} connection(s) remain", userId, connectionCount());
    }
}
