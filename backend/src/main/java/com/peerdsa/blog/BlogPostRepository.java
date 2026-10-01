package com.peerdsa.blog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BlogPostRepository extends JpaRepository<BlogPost, Long> {
    List<BlogPost> findByStatusOrderByPublishedAtDesc(BlogPostStatus status);
    List<BlogPost> findByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<BlogPost> findByIdAndUserId(Long id, Long userId);
}
