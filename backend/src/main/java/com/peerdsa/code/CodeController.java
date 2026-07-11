package com.peerdsa.code;

import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.user.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

/**
 * REST surface for the in-app code editor: the language catalogue, per-problem draft save/load, and
 * a stateless run. Every route requires authentication (the default in {@code SecurityConfig}).
 */
@RestController
@RequestMapping("/api/code")
public class CodeController {

    private final CodeService code;

    public CodeController(CodeService code) {
        this.code = code;
    }

    /** Body of a draft save; the source cap bounds both the row and the request payload. */
    public record SaveRequest(@NotBlank String language, @Size(max = 100_000) String source) {}

    /** Body of a run: the source to execute plus optional stdin fed to the program. */
    public record RunRequest(
            @NotBlank String language,
            @Size(max = 100_000) String source,
            @Size(max = 50_000) String stdin) {}

    /** The fixed catalogue of runnable languages, so the editor never offers one Piston lacks. */
    @GetMapping("/languages")
    public List<CodeService.LanguageOption> languages() {
        return CodeService.LANGUAGES;
    }

    @GetMapping("/problems/{problemId}")
    public List<CodeService.CodeDraft> drafts(
            @AuthenticationPrincipal User user, @PathVariable Long problemId) {
        return code.drafts(user.getId(), problemId);
    }

    @PutMapping("/problems/{problemId}")
    public CodeService.CodeDraft save(
            @AuthenticationPrincipal User user,
            @PathVariable Long problemId,
            @Valid @RequestBody SaveRequest request) {
        return code.save(user.getId(), problemId, request.language(), request.source());
    }

    @PostMapping("/run")
    public ExecuteResult run(@AuthenticationPrincipal User user, @Valid @RequestBody RunRequest request) {
        return code.run(request.language(), request.source(), request.stdin());
    }
}
