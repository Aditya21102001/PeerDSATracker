package com.peerdsa.gamification;

import com.peerdsa.user.User;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/gamification")
public class GamificationController {

    private final GamificationService gamification;

    public GamificationController(GamificationService gamification) {
        this.gamification = gamification;
    }

    @GetMapping("/badges")
    public List<GamificationService.BadgeView> badges(@AuthenticationPrincipal User user) {
        return gamification.badgesFor(user);
    }

    @GetMapping("/xp")
    public GamificationService.XpView xp(@AuthenticationPrincipal User user) {
        return gamification.xpFor(user);
    }
}
