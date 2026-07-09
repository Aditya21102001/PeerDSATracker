package com.peerdsa.notes;

import com.peerdsa.user.User;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/notes")
public class NotesController {

    private static final int MAX_PAGE_SIZE = 100;

    private final NotesService notes;

    public NotesController(NotesService notes) {
        this.notes = notes;
    }

    public record NoteRequest(@Size(max = 20_000) String content) {}

    @GetMapping("/problems/{problemId}")
    public NotesService.NoteView get(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        return notes.get(user.getId(), problemId);
    }

    @PutMapping("/problems/{problemId}")
    public NotesService.NoteView save(
            @AuthenticationPrincipal User user,
            @PathVariable Long problemId,
            @Valid @RequestBody NoteRequest request) {
        return notes.save(user.getId(), problemId, request.content());
    }

    @DeleteMapping("/problems/{problemId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal User user, @PathVariable Long problemId) {
        notes.delete(user.getId(), problemId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public Page<NotesService.NoteSummary> list(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        return notes.list(user.getId(), PageRequest.of(Math.max(page, 0), pageSize));
    }
}
