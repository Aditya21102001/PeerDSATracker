package com.peerdsa.video;

import com.peerdsa.user.User;
import com.peerdsa.video.VideoDtos.AddVideoToPlaylistRequest;
import com.peerdsa.video.VideoDtos.CreatePlaylistRequest;
import com.peerdsa.video.VideoDtos.PlaylistDto;
import com.peerdsa.video.VideoDtos.PlaylistItemDto;
import com.peerdsa.video.VideoDtos.UpdateVideoNotesRequest;
import com.peerdsa.video.VideoDtos.VideoSearchResult;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class VideoController {

    private final VideoSearchService searchService;
    private final VideoPlaylistService playlistService;

    public VideoController(VideoSearchService searchService, VideoPlaylistService playlistService) {
        this.searchService = searchService;
        this.playlistService = playlistService;
    }

    // --- Public Video Search & Details ---------------------------------------

    @GetMapping("/videos/search")
    public List<VideoSearchResult> searchVideos(@RequestParam(name = "q", defaultValue = "") String query) {
        return searchService.search(query);
    }

    @GetMapping("/videos/details/{videoId}")
    public ResponseEntity<VideoSearchResult> getVideoDetails(@PathVariable String videoId) {
        VideoSearchResult result = searchService.resolveSingleVideo(videoId);
        return result != null ? ResponseEntity.ok(result) : ResponseEntity.notFound().build();
    }

    @GetMapping("/videos/curated")
    public List<VideoSearchResult> getCuratedVideos() {
        return searchService.getCuratedRecommendations();
    }

    // --- Authenticated User Playlists ----------------------------------------

    @GetMapping("/playlists")
    public List<PlaylistDto> getPlaylists(@AuthenticationPrincipal User user) {
        return playlistService.getUserPlaylists(user.getId());
    }

    @PostMapping("/playlists")
    public PlaylistDto createPlaylist(
            @AuthenticationPrincipal User user,
            @RequestBody CreatePlaylistRequest req) {
        return playlistService.createPlaylist(user.getId(), req);
    }

    @PutMapping("/playlists/{playlistId}")
    public PlaylistDto updatePlaylist(
            @AuthenticationPrincipal User user,
            @PathVariable Long playlistId,
            @RequestBody CreatePlaylistRequest req) {
        return playlistService.updatePlaylist(user.getId(), playlistId, req);
    }

    @DeleteMapping("/playlists/{playlistId}")
    public ResponseEntity<Void> deletePlaylist(
            @AuthenticationPrincipal User user,
            @PathVariable Long playlistId) {
        playlistService.deletePlaylist(user.getId(), playlistId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/playlists/{playlistId}/videos")
    public PlaylistItemDto addVideoToPlaylist(
            @AuthenticationPrincipal User user,
            @PathVariable Long playlistId,
            @RequestBody AddVideoToPlaylistRequest req) {
        return playlistService.addVideoToPlaylist(user.getId(), playlistId, req);
    }

    @DeleteMapping("/playlists/{playlistId}/videos/{videoId}")
    public ResponseEntity<Void> removeVideoFromPlaylist(
            @AuthenticationPrincipal User user,
            @PathVariable Long playlistId,
            @PathVariable String videoId) {
        playlistService.removeVideoFromPlaylist(user.getId(), playlistId, videoId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/playlists/{playlistId}/videos/{videoId}")
    public PlaylistItemDto updateVideo(
            @AuthenticationPrincipal User user,
            @PathVariable Long playlistId,
            @PathVariable String videoId,
            @RequestBody UpdateVideoNotesRequest req) {
        return playlistService.updateVideo(user.getId(), playlistId, videoId, req);
    }
}
