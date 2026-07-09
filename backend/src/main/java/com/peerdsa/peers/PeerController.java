package com.peerdsa.peers;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST surface for the social graph: follow / unfollow, the following and followers lists, and
 * user search. Every endpoint is authenticated; search in particular must not be public.
 */
@RestController
@RequestMapping("/api/peers")
public class PeerController {

    private final PeerService peers;

    public PeerController(PeerService peers) {
        this.peers = peers;
    }

    @PostMapping("/follow/{userId}")
    public ResponseEntity<Void> follow(@AuthenticationPrincipal User user, @PathVariable Long userId) {
        peers.follow(user.getId(), userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/follow/{userId}")
    public ResponseEntity<Void> unfollow(@AuthenticationPrincipal User user, @PathVariable Long userId) {
        peers.unfollow(user.getId(), userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/following")
    public List<PeerService.PeerView> following(@AuthenticationPrincipal User user) {
        return peers.following(user.getId());
    }

    @GetMapping("/followers")
    public List<PeerService.PeerView> followers(@AuthenticationPrincipal User user) {
        return peers.followers(user.getId());
    }

    /** Authenticated on purpose: an open endpoint would enumerate every username. */
    @GetMapping("/search")
    public List<PeerService.PeerView> search(@AuthenticationPrincipal User user, @RequestParam String q) {
        return peers.search(user.getId(), q);
    }
}
