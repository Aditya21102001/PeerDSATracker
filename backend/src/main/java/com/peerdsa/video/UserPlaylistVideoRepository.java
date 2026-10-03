package com.peerdsa.video;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPlaylistVideoRepository extends JpaRepository<UserPlaylistVideo, Long> {

    List<UserPlaylistVideo> findByPlaylistIdOrderByPositionAsc(Long playlistId);

    Optional<UserPlaylistVideo> findByPlaylistIdAndVideoId(Long playlistId, String videoId);

    void deleteByPlaylistIdAndVideoId(Long playlistId, String videoId);
}
