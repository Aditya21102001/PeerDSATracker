package com.peerdsa.blog;

import com.peerdsa.user.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Authenticated blog surface. Public feeds deliberately exclude drafts. */
@RestController
@RequestMapping("/api/blogs")
public class BlogController {

    private final BlogService blogs;

    public BlogController(BlogService blogs) {
        this.blogs = blogs;
    }

    public record BlogPostRequest(
            @NotBlank @Size(max = 180) String title,
            @NotBlank @Size(max = 80) String subject,
            @Size(max = 500) String excerpt,
            @NotBlank @Size(max = 30_000) String content,
            @Size(max = 8) List<@Size(max = 32) String> tags,
            BlogPostStatus status) {}

    @GetMapping
    public List<BlogService.BlogPostView> published(@AuthenticationPrincipal User user) {
        return blogs.published(user.getId());
    }

    @GetMapping("/mine")
    public List<BlogService.BlogPostView> mine(@AuthenticationPrincipal User user) {
        return blogs.mine(user.getId());
    }

    @PostMapping
    public ResponseEntity<BlogService.BlogPostView> create(
            @AuthenticationPrincipal User user, @Valid @RequestBody BlogPostRequest request) {
        return ResponseEntity.ok(blogs.create(user.getId(), request));
    }

    @PutMapping("/{postId}")
    public BlogService.BlogPostView update(
            @AuthenticationPrincipal User user,
            @PathVariable Long postId,
            @Valid @RequestBody BlogPostRequest request) {
        return blogs.update(user.getId(), postId, request);
    }

    @DeleteMapping("/{postId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal User user, @PathVariable Long postId) {
        blogs.delete(user.getId(), postId);
        return ResponseEntity.noContent().build();
    }
}
