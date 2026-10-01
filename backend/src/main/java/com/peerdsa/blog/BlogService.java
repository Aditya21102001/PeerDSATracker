package com.peerdsa.blog;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Read and write rules for shared articles and private drafts. */
@Service
public class BlogService {

    private static final int MAX_TAGS = 8;

    private final BlogPostRepository posts;
    private final UserRepository users;

    public BlogService(BlogPostRepository posts, UserRepository users) {
        this.posts = posts;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<BlogPostView> published(Long viewerId) {
        return posts.findByStatusOrderByPublishedAtDesc(BlogPostStatus.PUBLISHED).stream()
                .map(post -> toView(post, viewerId))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BlogPostView> mine(Long userId) {
        return posts.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(post -> toView(post, userId))
                .toList();
    }

    @Transactional
    public BlogPostView create(Long userId, BlogController.BlogPostRequest request) {
        BlogPost post = new BlogPost(userId);
        apply(post, request);
        return toView(posts.save(post), userId);
    }

    @Transactional
    public BlogPostView update(Long userId, Long postId, BlogController.BlogPostRequest request) {
        BlogPost post = owned(postId, userId);
        apply(post, request);
        return toView(posts.save(post), userId);
    }

    @Transactional
    public void delete(Long userId, Long postId) {
        posts.delete(owned(postId, userId));
    }

    private BlogPost owned(Long postId, Long userId) {
        return posts.findByIdAndUserId(postId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Article not found"));
    }

    private void apply(BlogPost post, BlogController.BlogPostRequest request) {
        post.setTitle(request.title().trim());
        post.setSubject(request.subject().trim());
        post.setExcerpt(request.excerpt() == null ? "" : request.excerpt().trim());
        post.setContent(request.content().trim());
        post.setTags(normalizeTags(request.tags()));

        BlogPostStatus previous = post.getStatus();
        BlogPostStatus next = request.status() == null ? BlogPostStatus.PUBLISHED : request.status();
        post.setStatus(next);
        if (next == BlogPostStatus.PUBLISHED && (previous != BlogPostStatus.PUBLISHED || post.getPublishedAt() == null)) {
            post.setPublishedAt(Instant.now());
        } else if (next == BlogPostStatus.DRAFT) {
            post.setPublishedAt(null);
        }
    }

    private String normalizeTags(List<String> tags) {
        if (tags == null) return "";
        return tags.stream()
                .filter(tag -> tag != null && !tag.isBlank())
                .map(tag -> tag.trim().replace(",", ""))
                .filter(tag -> !tag.isBlank())
                .distinct()
                .limit(MAX_TAGS)
                .reduce((first, second) -> first + "," + second)
                .orElse("");
    }

    private BlogPostView toView(BlogPost post, Long viewerId) {
        User author = users.findById(post.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Article author not found"));
        String authorName = author.getDisplayName() == null || author.getDisplayName().isBlank()
                ? author.getUsername()
                : author.getDisplayName();
        List<String> tags = post.getTags().isBlank() ? List.of() : Arrays.asList(post.getTags().split(","));
        return new BlogPostView(
                post.getId(), post.getUserId(), post.getTitle(), post.getSubject(), post.getExcerpt(),
                post.getContent(), tags, post.getStatus(), authorName, post.getCreatedAt(),
                post.getUpdatedAt(), post.getPublishedAt(), post.getUserId().equals(viewerId));
    }

    public record BlogPostView(
            Long id, Long authorId, String title, String subject, String excerpt, String content,
            List<String> tags, BlogPostStatus status, String authorName, Instant createdAt,
            Instant updatedAt, Instant publishedAt, boolean mine) {}
}
