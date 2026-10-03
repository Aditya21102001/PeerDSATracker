package com.peerdsa.video;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserVideoPlaylistRepository extends JpaRepository<UserVideoPlaylist, Long> {

    @Query("SELECT p FROM UserVideoPlaylist p LEFT JOIN FETCH p.videos WHERE p.user.id = :userId ORDER BY p.updatedAt DESC")
    List<UserVideoPlaylist> findAllByUserIdWithVideos(@Param("userId") Long userId);

    Optional<UserVideoPlaylist> findByIdAndUserId(Long id, Long userId);
}
