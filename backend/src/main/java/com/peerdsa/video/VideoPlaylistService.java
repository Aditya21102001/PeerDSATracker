package com.peerdsa.video;

import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import com.peerdsa.video.VideoDtos.AddVideoToPlaylistRequest;
import com.peerdsa.video.VideoDtos.CreatePlaylistRequest;
import com.peerdsa.video.VideoDtos.PlaylistDto;
import com.peerdsa.video.VideoDtos.PlaylistItemDto;
import com.peerdsa.video.VideoDtos.UpdateVideoNotesRequest;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class VideoPlaylistService {

    private final UserVideoPlaylistRepository playlistRepository;
    private final UserPlaylistVideoRepository videoRepository;
    private final UserRepository userRepository;

    public VideoPlaylistService(
            UserVideoPlaylistRepository playlistRepository,
            UserPlaylistVideoRepository videoRepository,
            UserRepository userRepository) {
        this.playlistRepository = playlistRepository;
        this.videoRepository = videoRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<PlaylistDto> getUserPlaylists(Long userId) {
        List<UserVideoPlaylist> playlists = playlistRepository.findAllByUserIdWithVideos(userId);
        return playlists.stream().map(this::toPlaylistDto).toList();
    }

    public PlaylistDto createPlaylist(Long userId, CreatePlaylistRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        String name = req.name() != null && !req.name().isBlank() ? req.name().trim() : "My Playlist";
        UserVideoPlaylist playlist = new UserVideoPlaylist(user, name, req.description());
        UserVideoPlaylist saved = playlistRepository.save(playlist);
        return toPlaylistDto(saved);
    }

    public PlaylistDto updatePlaylist(Long userId, Long playlistId, CreatePlaylistRequest req) {
        UserVideoPlaylist playlist = playlistRepository.findByIdAndUserId(playlistId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        if (req.name() != null && !req.name().isBlank()) {
            playlist.setName(req.name().trim());
        }
        if (req.description() != null) {
            playlist.setDescription(req.description());
        }
        playlist.setUpdatedAt(Instant.now());
        return toPlaylistDto(playlistRepository.save(playlist));
    }

    public void deletePlaylist(Long userId, Long playlistId) {
        UserVideoPlaylist playlist = playlistRepository.findByIdAndUserId(playlistId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));
        playlistRepository.delete(playlist);
    }

    public PlaylistItemDto addVideoToPlaylist(Long userId, Long playlistId, AddVideoToPlaylistRequest req) {
        UserVideoPlaylist playlist = playlistRepository.findByIdAndUserId(playlistId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        if (req.videoId() == null || req.videoId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "videoId is required");
        }

        // If video already in playlist, update notes or return existing
        return videoRepository.findByPlaylistIdAndVideoId(playlistId, req.videoId().trim())
                .map(existing -> {
                    if (req.notes() != null && !req.notes().isBlank()) {
                        existing.setNotes(req.notes());
                    }
                    return toPlaylistItemDto(videoRepository.save(existing));
                })
                .orElseGet(() -> {
                    int nextPos = playlist.getVideos().size();
                    UserPlaylistVideo item = new UserPlaylistVideo(
                            playlist,
                            req.videoId().trim(),
                            req.title() != null ? req.title().trim() : "YouTube Video",
                            req.channelTitle(),
                            req.thumbnailUrl(),
                            req.duration(),
                            nextPos);
                    if (req.notes() != null) {
                        item.setNotes(req.notes());
                    }
                    playlist.addVideo(item);
                    UserPlaylistVideo saved = videoRepository.save(item);
                    return toPlaylistItemDto(saved);
                });
    }

    public void removeVideoFromPlaylist(Long userId, Long playlistId, String videoId) {
        UserVideoPlaylist playlist = playlistRepository.findByIdAndUserId(playlistId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        videoRepository.findByPlaylistIdAndVideoId(playlistId, videoId).ifPresent(item -> {
            playlist.removeVideo(item);
            videoRepository.delete(item);
        });
    }

    public PlaylistItemDto updateVideo(Long userId, Long playlistId, String videoId, UpdateVideoNotesRequest req) {
        playlistRepository.findByIdAndUserId(playlistId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        UserPlaylistVideo item = videoRepository.findByPlaylistIdAndVideoId(playlistId, videoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Video not found in playlist"));

        if (req.notes() != null) {
            item.setNotes(req.notes());
        }
        if (req.watched() != null) {
            item.setWatched(req.watched());
        }
        return toPlaylistItemDto(videoRepository.save(item));
    }

    private PlaylistDto toPlaylistDto(UserVideoPlaylist p) {
        List<PlaylistItemDto> items = p.getVideos() != null
                ? p.getVideos().stream().map(this::toPlaylistItemDto).toList()
                : List.of();

        return new PlaylistDto(
                p.getId(),
                p.getName(),
                p.getDescription(),
                items.size(),
                p.getCreatedAt(),
                p.getUpdatedAt(),
                items);
    }

    private PlaylistItemDto toPlaylistItemDto(UserPlaylistVideo v) {
        return new PlaylistItemDto(
                v.getId(),
                v.getVideoId(),
                v.getTitle(),
                v.getChannelTitle(),
                v.getThumbnailUrl(),
                v.getDuration(),
                v.getNotes(),
                v.isWatched(),
                v.getPosition(),
                v.getCreatedAt());
    }
}
