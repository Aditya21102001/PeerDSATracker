package com.peerdsa.leaderboard;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints for the global and peers leaderboards, ranked off the denormalized user counters. */
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private static final int MAX_PAGE_SIZE = 100;

    private final LeaderboardRepository leaderboard;

    public LeaderboardController(LeaderboardRepository leaderboard) {
        this.leaderboard = leaderboard;
    }

    /** A page of ranked rows plus {@code totalUsers} so the client can size pagination. */
    public record LeaderboardResponse(List<LeaderboardRow> rows, int page, int size, long totalUsers) {}

    /** Ranked by XP, tie-broken by problems solved. */
    @GetMapping("/global")
    public LeaderboardResponse global(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {

        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int pageNo = Math.max(page, 0);

        return new LeaderboardResponse(
                leaderboard.global(pageSize, pageNo * pageSize), pageNo, pageSize, leaderboard.countUsers());
    }

    @GetMapping("/peers")
    public List<LeaderboardRow> peers(@AuthenticationPrincipal User user) {
        return leaderboard.peers(user.getId());
    }
}
