package com.peerdsa.streak;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only endpoints backing the streak widget and activity heatmap. Activity is only ever
 * written on the solve path in {@link StreakService}, never through this controller.
 */
@RestController
@RequestMapping("/api/activity")
public class ActivityController {

    private final StreakService streaks;

    public ActivityController(StreakService streaks) {
        this.streaks = streaks;
    }

    /** Omit `year` for a rolling 371-day window, which is what the calendar renders. */
    @GetMapping("/heatmap")
    public List<StreakService.HeatmapDay> heatmap(
            @AuthenticationPrincipal User user, @RequestParam(required = false) Integer year) {
        return streaks.heatmap(user.getId(), year);
    }

    @GetMapping("/streak")
    public StreakService.StreakSummary streak(@AuthenticationPrincipal User user) {
        return streaks.summary(user);
    }
}
