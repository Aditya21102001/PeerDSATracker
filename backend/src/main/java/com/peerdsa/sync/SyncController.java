package com.peerdsa.sync;

import com.peerdsa.sync.SyncRun.TriggerSource;
import com.peerdsa.user.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST surface for linking platform accounts and triggering or reviewing syncs. All writes
 * flow through {@link SyncService}, the single database writer.
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    /** Body for linking a platform account or re-pointing an existing one at a new handle. */
    public record LinkRequest(@NotNull Platform platform, @NotBlank String handle) {}

    /** A linked account as rendered on /profile, cached external stats included. */
    public record AccountView(
            Platform platform,
            String handle,
            boolean verified,
            Instant lastSyncedAt,
            Map<String, Object> externalStats) {

        static AccountView from(PlatformAccount a) {
            return new AccountView(
                    a.getPlatform(), a.getHandle(), a.isVerified(), a.getLastSyncedAt(), a.getExternalStats());
        }
    }

    /** One sync attempt as shown in the /profile run history. */
    public record RunView(
            Long id,
            Platform platform,
            SyncRun.Status status,
            TriggerSource triggerSource,
            Instant startedAt,
            Instant finishedAt,
            int itemsProcessed,
            String errorMessage) {

        static RunView from(SyncRun r) {
            return new RunView(
                    r.getId(),
                    r.getPlatform(),
                    r.getStatus(),
                    r.getTriggerSource(),
                    r.getStartedAt(),
                    r.getFinishedAt(),
                    r.getItemsProcessed(),
                    r.getErrorMessage());
        }
    }

    @PostMapping("/accounts")
    public AccountView link(@AuthenticationPrincipal User user, @Valid @RequestBody LinkRequest request) {
        return AccountView.from(sync.linkAccount(user.getId(), request.platform(), request.handle()));
    }

    @GetMapping("/accounts")
    public List<AccountView> accounts(@AuthenticationPrincipal User user) {
        return sync.accountsFor(user.getId()).stream().map(AccountView::from).toList();
    }

    @DeleteMapping("/accounts/{platform}")
    public ResponseEntity<Void> unlink(@AuthenticationPrincipal User user, @PathVariable Platform platform) {
        sync.unlink(user.getId(), platform);
        return ResponseEntity.noContent().build();
    }

    /** Synchronous on purpose: one or two HTTP calls, and the UI wants the result. */
    @PostMapping("/run")
    public List<RunView> run(@AuthenticationPrincipal User user) {
        return sync.syncUser(user.getId(), TriggerSource.MANUAL).stream().map(RunView::from).toList();
    }

    @GetMapping("/runs")
    public List<RunView> runs(@AuthenticationPrincipal User user) {
        return sync.recentRuns(user.getId()).stream().map(RunView::from).toList();
    }
}
