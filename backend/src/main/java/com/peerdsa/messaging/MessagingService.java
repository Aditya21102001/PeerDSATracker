package com.peerdsa.messaging;

import com.peerdsa.messaging.MessagingDtos.ConversationView;
import com.peerdsa.messaging.MessagingDtos.MessageView;
import com.peerdsa.peers.FollowRepository;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Direct messages between peers.
 *
 * <p><b>Mutual follow is the permission model.</b> A conversation can only be opened, and a message
 * only sent, between two people who follow each other. That is a deliberate structural choice
 * rather than a policy to be moderated after the fact: this application lets anyone sign up with an
 * email address, and open messaging between strangers is a harassment and spam vector that needs a
 * block list, a report path and an abuse team to run responsibly. Requiring mutual follow makes
 * unwanted contact impossible to initiate, and makes unfollowing the block.
 *
 * <p>Reading history survives an unfollow, but sending does not. Silently deleting a conversation
 * when someone unfollows would destroy both people's copy of an exchange; refusing new messages
 * stops the contact, which is the part that matters.
 *
 * <p>Every read and every write re-checks participation from the session's user id. There is no
 * endpoint anywhere that takes a user id from the request body.
 */
@Service
public class MessagingService {

    private static final Logger log = LoggerFactory.getLogger(MessagingService.class);

    /** Per sender, across all conversations. Generous for a person, ruinous for a script. */
    private static final int MAX_MESSAGES_PER_MINUTE = 20;
    private static final Duration RATE_WINDOW = Duration.ofMinutes(1);

    /** One screenful. A thread scrolls back by asking for more. */
    private static final int PAGE_SIZE = 50;

    private final DmConversationRepository conversations;
    private final DmMessageRepository messages;
    private final FollowRepository follows;
    private final UserRepository users;
    private final MessageStream stream;

    public MessagingService(
            DmConversationRepository conversations,
            DmMessageRepository messages,
            FollowRepository follows,
            UserRepository users,
            MessageStream stream) {
        this.conversations = conversations;
        this.messages = messages;
        this.follows = follows;
        this.users = users;
        this.stream = stream;
    }

    /** True only when each follows the other. The single gate for opening and sending. */
    @Transactional(readOnly = true)
    public boolean canMessage(Long a, Long b) {
        return !a.equals(b)
                && follows.existsByFollowerIdAndFolloweeId(a, b)
                && follows.existsByFollowerIdAndFolloweeId(b, a);
    }

    /** This user's conversations, most recent first, each with its peer and unread count. */
    @Transactional(readOnly = true)
    public List<ConversationView> conversationsFor(Long userId) {
        List<DmConversation> rows = conversations.findForUser(userId);
        if (rows.isEmpty()) {
            return List.of();
        }

        // One query for every peer rather than one per row.
        Map<Long, User> peers = users
                .findAllById(rows.stream().map(c -> c.otherThan(userId)).toList())
                .stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        List<ConversationView> views = new ArrayList<>(rows.size());
        for (DmConversation c : rows) {
            User peer = peers.get(c.otherThan(userId));
            if (peer == null) {
                continue; // the account was deleted; the cascade will remove the row
            }
            views.add(new ConversationView(
                    c.getId(),
                    peer.getId(),
                    peer.getUsername(),
                    peer.getDisplayName(),
                    peer.getAvatarUrl(),
                    c.getLastMessageAt(),
                    messages.countUnread(c.getId(), userId, readMarkFor(c, userId)),
                    canMessage(userId, peer.getId())));
        }
        return views;
    }

    /**
     * Finds or creates the conversation with {@code peerId}.
     *
     * @throws ResponseStatusException 403 unless the two follow each other.
     */
    @Transactional
    public ConversationView openWith(Long userId, Long peerId) {
        if (!canMessage(userId, peerId)) {
            // Deliberately the same answer whether the peer does not exist, does not follow back,
            // or is the caller: none of that is any of the caller's business.
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You can only message peers who follow you back.");
        }

        DmConversation conversation = findPair(userId, peerId).orElseGet(() -> openPair(userId, peerId));

        User peer = users.findById(peerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such peer"));

        return new ConversationView(
                conversation.getId(),
                peer.getId(),
                peer.getUsername(),
                peer.getDisplayName(),
                peer.getAvatarUrl(),
                conversation.getLastMessageAt(),
                messages.countUnread(conversation.getId(), userId, readMarkFor(conversation, userId)),
                true);
    }

    /** Newest {@value #PAGE_SIZE} messages, oldest first for display. Participants only. */
    @Transactional
    public List<MessageView> messagesIn(Long userId, Long conversationId) {
        DmConversation conversation = requireParticipant(userId, conversationId);

        List<MessageView> page = messages
                .findByConversationIdOrderByCreatedAtDesc(conversationId, PageRequest.of(0, PAGE_SIZE))
                .stream()
                .map(m -> toView(m, userId))
                .collect(Collectors.toCollection(ArrayList::new));
        java.util.Collections.reverse(page);

        // Opening the thread is what marks it read; there is no separate "mark read" call to forget.
        conversation.markRead(userId, Instant.now());
        return page;
    }

    /**
     * Sends a message, and pushes it to whichever participants are currently listening.
     *
     * @throws ResponseStatusException 403 if they no longer follow each other, 429 if the sender is
     *     over the rate limit.
     */
    @Transactional
    public MessageView send(Long userId, Long conversationId, String body) {
        DmConversation conversation = requireParticipant(userId, conversationId);
        Long peerId = conversation.otherThan(userId);

        // Re-checked on every send, not just when the conversation was opened: unfollowing is how
        // somebody stops unwanted contact, and it has to take effect immediately.
        if (!canMessage(userId, peerId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You can only message peers who follow you back.");
        }
        if (messages.countBySenderIdAndCreatedAtAfter(userId, Instant.now().minus(RATE_WINDOW))
                >= MAX_MESSAGES_PER_MINUTE) {
            log.warn("Message rate limit hit by user {}", userId);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Slow down a moment.");
        }

        DmMessage saved = messages.save(new DmMessage(conversationId, userId, body.trim()));
        conversation.recordMessageAt(Instant.now());
        // The sender has by definition read their own message.
        conversation.markRead(userId, Instant.now());

        // Push to both sides: the recipient sees it arrive, and the sender's other tabs stay in
        // step. Delivery is best-effort by design -- a dropped stream must never fail the send,
        // because the message is already committed and the client will see it on its next fetch.
        MessageView view = toView(saved, userId);
        stream.publish(peerId, conversationId, toView(saved, peerId));
        stream.publish(userId, conversationId, view);

        return view;
    }

    /** Explicit read marking, for when the thread is already open and a message arrives. */
    @Transactional
    public void markRead(Long userId, Long conversationId) {
        requireParticipant(userId, conversationId).markRead(userId, Instant.now());
    }

    /** Total unread across every conversation, for the badge. */
    @Transactional(readOnly = true)
    public long unreadTotal(Long userId) {
        return conversations.findForUser(userId).stream()
                .mapToLong(c -> messages.countUnread(c.getId(), userId, readMarkFor(c, userId)))
                .sum();
    }

    /**
     * The one place participation is checked.
     *
     * <p>Answers 404, not 403, for a conversation the caller is not in. A 403 would confirm that
     * the id exists, which lets anyone enumerate how many conversations the application holds.
     */
    private DmConversation requireParticipant(Long userId, Long conversationId) {
        return conversations.findById(conversationId)
                .filter(c -> c.includes(userId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such conversation"));
    }

    /**
     * Creates the conversation for a pair that does not have one yet, tolerating a simultaneous
     * attempt by the other participant.
     *
     * <p>{@link DmConversation#between} is still what decides the canonical ordering, so the
     * {@code chk_dm_pair_ordered} CHECK and the argument validation stay in one place rather than
     * being restated in SQL. The insert itself goes through
     * {@link DmConversationRepository#insertIfAbsent}, which cannot fail on the unique constraint --
     * see there for why catching the violation instead does not work.
     *
     * <p>The row is guaranteed to exist by the time the re-read runs, whether this call created it
     * or the other participant did, so an empty result would mean the constraint or the canonical
     * ordering had changed underneath this method -- worth failing loudly rather than papering over.
     */
    private DmConversation openPair(Long userId, Long peerId) {
        DmConversation canonical = DmConversation.between(userId, peerId);
        conversations.insertIfAbsent(canonical.getUserLoId(), canonical.getUserHiId());

        return findPair(userId, peerId)
                .orElseThrow(() -> new IllegalStateException(
                        "dm_conversations row absent immediately after an upsert for the pair ("
                                + canonical.getUserLoId() + ", " + canonical.getUserHiId() + ")"));
    }

    /**
     * When this user last read the thread, as something the query can always bind.
     *
     * <p>{@link DmConversation#lastReadBy} answers null for "never opened it", which is the normal
     * state of a conversation the moment it is created. EPOCH says the same thing to a count of
     * messages "since" a point in time, without putting a null into the query -- see
     * {@link DmMessageRepository#countUnread}.
     */
    private static Instant readMarkFor(DmConversation conversation, Long userId) {
        Instant lastRead = conversation.lastReadBy(userId);
        return lastRead != null ? lastRead : Instant.EPOCH;
    }

    /**
     * {@code Math.min} takes primitives, so a null id here would unbox and throw NPE rather than
     * simply not match -- and an NPE out of a controller is a 500 for what is really a bad request.
     * Callers reach this past {@link #canMessage}, which rejects a null peer, so this is defence in
     * depth rather than a live path; the explicit empty keeps it that way if a caller is ever added.
     */
    private Optional<DmConversation> findPair(Long a, Long b) {
        if (a == null || b == null) {
            return Optional.empty();
        }
        return conversations.findByUserLoIdAndUserHiId(Math.min(a, b), Math.max(a, b));
    }

    private static MessageView toView(DmMessage m, Long viewerId) {
        return new MessageView(
                m.getId(),
                m.getConversationId(),
                m.getSenderId(),
                m.getSenderId().equals(viewerId),
                m.getBody(),
                m.getCreatedAt() == null ? Instant.now() : m.getCreatedAt());
    }
}
