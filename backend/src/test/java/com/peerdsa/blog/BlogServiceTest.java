package com.peerdsa.blog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class BlogServiceTest {

    private BlogPostRepository posts;
    private UserRepository users;
    private BlogService blogService;

    private User author;
    private BlogPost post;

    @BeforeEach
    void setUp() throws Exception {
        posts = mock(BlogPostRepository.class);
        users = mock(UserRepository.class);
        blogService = new BlogService(posts, users);

        author = new User();
        author.setUsername("aditya");
        author.setEmail("aditya@example.com");
        author.setDisplayName("Aditya Editorial");
        setId(author, 1L);

        post = new BlogPost(1L);
        post.setTitle("Java Concurrency");
        post.setSubject("Java Concurrency & Threads");
        post.setExcerpt("Learn threads and concurrency");
        post.setContent("Detailed content here");
        post.setTags("java,threads");
        post.setStatus(BlogPostStatus.PUBLISHED);
        post.setPublishedAt(Instant.now());
        setId(post, 100L);
    }

    private static void setId(Object entity, Long id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }

    @Test
    void published_returnsPublishedPostsWithAuthorInfo() {
        when(posts.findByStatusOrderByPublishedAtDesc(BlogPostStatus.PUBLISHED)).thenReturn(List.of(post));
        when(users.findAllById(Set.of(1L))).thenReturn(List.of(author));

        List<BlogService.BlogPostView> views = blogService.published(1L);

        assertThat(views).hasSize(1);
        BlogService.BlogPostView view = views.get(0);
        assertThat(view.title()).isEqualTo("Java Concurrency");
        assertThat(view.authorName()).isEqualTo("Aditya Editorial");
        assertThat(view.mine()).isTrue();
        assertThat(view.tags()).containsExactly("java", "threads");
    }

    @Test
    void published_viewerIsNotAuthor_mineIsFalse() {
        when(posts.findByStatusOrderByPublishedAtDesc(BlogPostStatus.PUBLISHED)).thenReturn(List.of(post));
        when(users.findAllById(Set.of(1L))).thenReturn(List.of(author));

        List<BlogService.BlogPostView> views = blogService.published(999L);

        assertThat(views).hasSize(1);
        assertThat(views.get(0).mine()).isFalse();
    }

    @Test
    void published_authorMissing_gracefullyFallsBack() {
        when(posts.findByStatusOrderByPublishedAtDesc(BlogPostStatus.PUBLISHED)).thenReturn(List.of(post));
        when(users.findAllById(Set.of(1L))).thenReturn(List.of());

        List<BlogService.BlogPostView> views = blogService.published(1L);

        assertThat(views).hasSize(1);
        assertThat(views.get(0).authorName()).isEqualTo("Community Member");
    }

    @Test
    void mine_returnsOnlyUserPosts() {
        when(posts.findByUserIdOrderByUpdatedAtDesc(1L)).thenReturn(List.of(post));
        when(users.findAllById(Set.of(1L))).thenReturn(List.of(author));

        List<BlogService.BlogPostView> views = blogService.mine(1L);

        assertThat(views).hasSize(1);
        assertThat(views.get(0).id()).isEqualTo(100L);
    }

    @Test
    void create_savesNewPostAndSetsPublishedAt() {
        BlogController.BlogPostRequest req = new BlogController.BlogPostRequest(
                "New Title", "Java", "Excerpt", "Content", List.of("tag1", "tag2"), BlogPostStatus.PUBLISHED);

        when(posts.save(any(BlogPost.class))).thenAnswer(inv -> {
            BlogPost saved = inv.getArgument(0);
            setId(saved, 101L);
            return saved;
        });
        when(users.findAllById(Set.of(1L))).thenReturn(List.of(author));

        BlogService.BlogPostView view = blogService.create(1L, req);

        assertThat(view.id()).isEqualTo(101L);
        assertThat(view.title()).isEqualTo("New Title");
        assertThat(view.status()).isEqualTo(BlogPostStatus.PUBLISHED);
        assertThat(view.publishedAt()).isNotNull();
    }

    @Test
    void update_notOwned_throwsNotFound() {
        when(posts.findByIdAndUserId(100L, 2L)).thenReturn(Optional.empty());

        BlogController.BlogPostRequest req = new BlogController.BlogPostRequest(
                "Updated", "Java", "Excerpt", "Content", List.of(), BlogPostStatus.PUBLISHED);

        assertThatThrownBy(() -> blogService.update(2L, 100L, req))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void delete_owned_deletesPost() {
        when(posts.findByIdAndUserId(100L, 1L)).thenReturn(Optional.of(post));

        blogService.delete(1L, 100L);

        verify(posts).delete(post);
    }
}
