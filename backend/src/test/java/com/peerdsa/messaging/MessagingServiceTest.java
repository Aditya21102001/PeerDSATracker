package com.peerdsa.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.peers.FollowRepository;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may message whom, and who may read what.
 *
 * <p>This is the whole reason the feature has tests. Everything else about direct messages is
 * plumbing; the rules below are the difference between a chat feature and an unmoderated channel
 * for contacting strangers. Each one fails closed.
 */
class MessagingServiceTest {

    private static final long ME = 1L;
    private static final long PEER = 2L;
    private static final long STRANGER = 3L;

    private DmConversationRepository conversations;
    private DmMessageRepository messages;
    private FollowRepository follows;
    private UserRepository users;
    private MessageStream stream;
    private MessagingService service;

    @BeforeEach
    void setUp() {
        conversations = mock(DmConversationRepository.class);
        messages = mock(DmMessageRepository.class);
        follows = mock(FollowRepository.class);
        users = mock(UserRepository.class);
        stream = mock(MessageStream.class);
        service = new MessagingService(conversations, messages, follows, users, stream);

        when(conversations.save(any())).thenAnswer((Answer<DmConversation>) i -> {
            DmConversation c = i.getArgument(0);
            ReflectionTestUtils.setField(c, "id", 99L);
            return c;
        });
        when(messages.save(any())).thenAnswer((Answer<DmMessage>) i -> i.getArgument(0));
        when(users.findById(PEER)).thenReturn(Optional.of(user(PEER, "priya")));
        when(users.findById(STRANGER)).thenReturn(Optional.of(user(STRANGER, "stranger")));
        when(messages.countBySenderIdAndCreatedAtAfter(anyLong(), any())).thenReturn(0L);
    }

    // ------------------------------------------------------------- mutual follow is the gate

    @Test
    void twoPeopleWhoFollowEachOtherCanMessage() {
        mutual(ME, PEER);

        assertThat(service.canMessage(ME, PEER)).isTrue();
    }

    /**
     * The case the whole model exists for. Following somebody must not entitle you to message
     * them -- otherwise anyone can open a conversation with anyone by clicking follow.
     */
    @Test
    void followingSomebodyWhoDoesNotFollowBackIsNotEnough() {
        when(follows.existsByFollowerIdAndFolloweeId(ME, STRANGER)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(STRANGER, ME)).thenReturn(false);

        assertThat(service.canMessage(ME, STRANGER)).isFalse();
    }

    @Test
    void beingFollowedIsNotEnoughEither() {
        when(follows.existsByFollowerIdAndFolloweeId(ME, STRANGER)).thenReturn(false);
        when(follows.existsByFollowerIdAndFolloweeId(STRANGER, ME)).thenReturn(true);

        assertThat(service.canMessage(ME, STRANGER)).isFalse();
    }

    @Test
    void nobodyCanMessageThemselves() {
        when(follows.existsByFollowerIdAndFolloweeId(ME, ME)).thenReturn(true);

        assertThat(service.canMessage(ME, ME)).isFalse();
    }

    @Test
    void openingAThreadWithSomebodyWhoDoesNotFollowBackIs403AndCreatesNothing() {
        when(follows.existsByFollowerIdAndFolloweeId(anyLong(), anyLong())).thenReturn(false);

        assertThatThrownBy(() -> service.openWith(ME, STRANGER))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));

        verify(conversations, never()).save(any());
    }

    // ------------------------------------------------------- unfollowing takes effect at once

    /**
     * Unfollowing is how somebody stops unwanted contact, so permission is re-checked on every
     * send rather than only when the conversation was opened. Checked once at open, a conversation
     * would be a permanent channel that no later action could close.
     */
    @Test
    void sendingIsRefusedOnceTheyNoLongerFollowEachOther() {
        DmConversation existing = conversation(ME, PEER);
        when(conversations.findById(7L)).thenReturn(Optional.of(existing));
        when(follows.existsByFollowerIdAndFolloweeId(anyLong(), anyLong())).thenReturn(false);

        assertThatThrownBy(() -> service.send(ME, 7L, "hello?"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));

        verify(messages, never()).save(any());
    }

    /** But the history stays readable. Deleting it would destroy both people's copy. */
    @Test
    void historyRemainsReadableAfterAnUnfollow() {
        DmConversation existing = conversation(ME, PEER);
        when(conversations.findById(7L)).thenReturn(Optional.of(existing));
        when(follows.existsByFollowerIdAndFolloweeId(anyLong(), anyLong())).thenReturn(false);
        when(messages.findByConversationIdOrderByCreatedAtDesc(anyLong(), any()))
                .thenReturn(List.of(new DmMessage(7L, PEER, "earlier message")));

        assertThat(service.messagesIn(ME, 7L)).hasSize(1);
    }

    // ------------------------------------------------------------------ participation is checked

    /**
     * 404 rather than 403 for a conversation the caller is not in. A 403 would confirm the id
     * exists, which lets anyone count how many conversations the application holds by walking ids.
     */
    @Test
    void readingSomebodyElsesConversationIs404NotForbidden() {
        DmConversation theirs = conversation(PEER, STRANGER);
        when(conversations.findById(7L)).thenReturn(Optional.of(theirs));

        assertThatThrownBy(() -> service.messagesIn(ME, 7L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void sendingIntoSomebodyElsesConversationIsRefused() {
        DmConversation theirs = conversation(PEER, STRANGER);
        when(conversations.findById(7L)).thenReturn(Optional.of(theirs));

        assertThatThrownBy(() -> service.send(ME, 7L, "hello"))
                .isInstanceOf(ResponseStatusException.class);

        verify(messages, never()).save(any());
    }

    // ------------------------------------------------------------------------- the happy path

    @Test
    void aMessageIsSavedAndPushedToBothSides() {
        DmConversation existing = conversation(ME, PEER);
        when(conversations.findById(7L)).thenReturn(Optional.of(existing));
        mutual(ME, PEER);

        var view = service.send(ME, 7L, "  hello there  ");

        // Trimmed, attributed, and marked as the sender's own.
        assertThat(view.body()).isEqualTo("hello there");
        assertThat(view.mine()).isTrue();

        // Both sides: the recipient sees it arrive, the sender's other tabs stay in step.
        verify(stream).publish(org.mockito.ArgumentMatchers.eq(PEER), any(), any());
        verify(stream).publish(org.mockito.ArgumentMatchers.eq(ME), any(), any());
    }

    /** A pair has exactly one conversation however many times either side opens it. */
    @Test
    void openingAnExistingThreadReusesItRatherThanCreatingASecond() {
        mutual(ME, PEER);
        when(conversations.findByUserLoIdAndUserHiId(ME, PEER))
                .thenReturn(Optional.of(conversation(ME, PEER)));

        service.openWith(ME, PEER);

        // insertIfAbsent, not save: creation moved to an upsert so a simultaneous open cannot break
        // the unique constraint. Asserting on save() here would still pass and test nothing.
        verify(conversations, never()).insertIfAbsent(any(), any());
    }

    /** The pair is stored canonically, so who opens it cannot change which row is found. */
    @Test
    void theSamePairResolvesToTheSameRowFromEitherSide() {
        mutual(ME, PEER);
        when(users.findById(ME)).thenReturn(Optional.of(user(ME, "aditya")));
        // Absent, then present: what an upsert looks like from the caller's side.
        when(conversations.findByUserLoIdAndUserHiId(ME, PEER))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(conversation(ME, PEER)));

        service.openWith(PEER, ME);

        // Looked up AND inserted low-id-first, regardless of who asked. The insert argument order
        // is what chk_dm_pair_ordered enforces in the database.
        verify(conversations, atLeastOnce()).findByUserLoIdAndUserHiId(ME, PEER);
        verify(conversations).insertIfAbsent(ME, PEER);
    }

    /**
     * Both participants tapping the same peer at the same moment.
     *
     * <p>The loser of that race finds nothing, inserts nothing (the row is already there), and must
     * still come back with the winner's row. Before the upsert this was a unique-constraint
     * violation, which reached the client as a 500 -- and it could not be repaired by catching the
     * violation, because a failed flush leaves the surrounding transaction unusable.
     */
    @Test
    void aSimultaneousOpenByBothSidesResolvesToTheOneRow() {
        mutual(ME, PEER);
        when(users.findById(PEER)).thenReturn(Optional.of(user(PEER, "priya")));
        DmConversation theirs = conversation(ME, PEER);
        when(conversations.findByUserLoIdAndUserHiId(ME, PEER))
                .thenReturn(Optional.empty())
                // The other participant's insert landed in between.
                .thenReturn(Optional.of(theirs));

        var view = service.openWith(ME, PEER);

        assertThat(view.id()).isEqualTo(theirs.getId());
        verify(conversations).insertIfAbsent(ME, PEER);
    }

    // ---------------------------------------------------------------------------- rate limiting

    @Test
    void aSenderOverTheirBudgetIsRefusedWith429() {
        DmConversation existing = conversation(ME, PEER);
        when(conversations.findById(7L)).thenReturn(Optional.of(existing));
        mutual(ME, PEER);
        when(messages.countBySenderIdAndCreatedAtAfter(anyLong(), any())).thenReturn(20L);

        assertThatThrownBy(() -> service.send(ME, 7L, "spam"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        verify(messages, never()).save(any());
    }

    // ---------------------------------------------------------------------------- helpers

    private void mutual(long a, long b) {
        when(follows.existsByFollowerIdAndFolloweeId(a, b)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(b, a)).thenReturn(true);
    }

    private static DmConversation conversation(long a, long b) {
        DmConversation c = DmConversation.between(a, b);
        ReflectionTestUtils.setField(c, "id", 7L);
        return c;
    }

    private static User user(long id, String username) {
        User u = new User();
        ReflectionTestUtils.setField(u, "id", id);
        u.setUsername(username);
        u.setEmail(username + "@example.com");
        return u;
    }

    /** Guards the assumption the canonical ordering rests on. */
    @Test
    void aConversationWithOneselfIsImpossibleToConstruct() {
        assertThatThrownBy(() -> DmConversation.between(ME, ME))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void unreadIsCountedPerConversationForTheViewer() {
        DmConversation c = conversation(ME, PEER);
        c.markRead(ME, Instant.now().minusSeconds(60));
        when(conversations.findForUser(ME)).thenReturn(List.of(c));
        when(messages.countUnread(any(), any(), any())).thenReturn(3L);

        assertThat(service.unreadTotal(ME)).isEqualTo(3);
    }
}
