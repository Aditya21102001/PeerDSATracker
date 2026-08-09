package com.peerdsa.messaging;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** Request and response bodies for {@code /api/messages}. */
public final class MessagingDtos {

    private MessagingDtos() {}

    /**
     * A conversation in the list.
     *
     * @param canMessage false once the pair no longer follow each other. History stays readable;
     *     the composer is what disappears, so the UI can explain rather than silently fail a send.
     */
    public record ConversationView(
            Long id,
            Long peerId,
            String peerUsername,
            String peerDisplayName,
            String peerAvatarUrl,
            Instant lastMessageAt,
            long unread,
            boolean canMessage) {}

    /**
     * One message.
     *
     * @param mine computed per viewer, so the client never has to know its own user id to decide
     *     which side of the thread to draw a bubble on.
     */
    public record MessageView(
            Long id, Long conversationId, Long senderId, boolean mine, String body, Instant createdAt) {}

    /** Opening a thread. The peer is named by id; the server decides whether that is allowed. */
    public record OpenRequest(Long peerId) {}

    /**
     * Sending. The length cap is here rather than a database CHECK so an over-long message is a 400
     * with a message, not a 500 after the request was already accepted.
     */
    public record SendRequest(@NotBlank @Size(max = 2000) String body) {}

    /** Answer to the unread-count poll that drives the badge. */
    public record UnreadCount(long unread) {}
}
