package com.peerdsa.peers;

import com.peerdsa.streak.StreakService;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Social-graph logic over the {@link Follow} edge table. Follows are idempotent and self-follows
 * are rejected; peer views report {@link StreakService#effectiveCurrentStreak} rather than the
 * stored streak column, which goes stale on an idle day.
 */
@Service
public class PeerService {

    private static final int SEARCH_LIMIT = 20;

    private final FollowRepository follows;
    private final UserRepository users;
    private final StreakService streaks;

    public PeerService(FollowRepository follows, UserRepository users, StreakService streaks) {
        this.follows = follows;
        this.users = users;
        this.streaks = streaks;
    }

    /** Idempotent: following someone twice is a no-op, not an error. */
    @Transactional
    public void follow(Long me, Long targetId) {
        if (me.equals(targetId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot follow yourself");
        }
        if (!users.existsById(targetId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown user");
        }
        if (!follows.existsByFollowerIdAndFolloweeId(me, targetId)) {
            follows.save(new Follow(me, targetId));
        }
    }

    @Transactional
    public void unfollow(Long me, Long targetId) {
        follows.deleteByFollowerIdAndFolloweeId(me, targetId);
    }

    @Transactional(readOnly = true)
    public List<PeerView> following(Long me) {
        List<Long> ids = follows.findByFollowerId(me).stream().map(Follow::getFolloweeId).toList();
        return toViews(users.findAllById(ids), Set.copyOf(ids), followerIds(me));
    }

    @Transactional(readOnly = true)
    public List<PeerView> followers(Long me) {
        List<Long> ids = follows.findByFolloweeId(me).stream().map(Follow::getFollowerId).toList();
        // A follower is not necessarily someone I follow back.
        return toViews(users.findAllById(ids), followedIds(me), Set.copyOf(ids));
    }

    @Transactional(readOnly = true)
    public List<PeerView> search(Long me, String q) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        List<User> found = users.searchByUsername(q.trim(), me, PageRequest.of(0, SEARCH_LIMIT));
        return toViews(found, followedIds(me), followerIds(me));
    }

    private Set<Long> followedIds(Long me) {
        return follows.findByFollowerId(me).stream().map(Follow::getFolloweeId).collect(Collectors.toSet());
    }

    private List<PeerView> toViews(List<User> found, Set<Long> followed, Set<Long> followers) {
        return found.stream()
                .map(u -> new PeerView(
                        u.getId(),
                        u.getUsername(),
                        u.getDisplayName(),
                        u.getAvatarUrl(),
                        u.getXp(),
                        u.getTotalSolved(),
                        streaks.effectiveCurrentStreak(u),
                        followed.contains(u.getId()),
                        followers.contains(u.getId())))
                .toList();
    }

    private Set<Long> followerIds(Long me) {
        return follows.findByFolloweeId(me).stream().map(Follow::getFollowerId).collect(Collectors.toSet());
    }

    /**
     * Read model for a peer row, with both follow directions flagged relative to the viewer.
     *
     * <p>{@code followsYou} exists so the UI can tell whether messaging is possible. Direct
     * messages require a mutual follow, and without this the peers list would have to offer a
     * "Message" button on every row and let a third of them fail with a 403 -- which teaches
     * people the button is broken rather than that the rule exists.
     */
    public record PeerView(
            Long id,
            String username,
            String displayName,
            String avatarUrl,
            int xp,
            int totalSolved,
            int currentStreak,
            boolean following,
            boolean followsYou) {}
}
