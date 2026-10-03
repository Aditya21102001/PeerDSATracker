package com.peerdsa.video;

import java.time.Instant;
import java.util.List;

public class VideoDtos {

    public record VideoSearchResult(
            String videoId,
            String title,
            String channelTitle,
            String thumbnailUrl,
            String duration,
            String viewCount,
            String publishedTime,
            String source) {}

    public record PlaylistItemDto(
            Long id,
            String videoId,
            String title,
            String channelTitle,
            String thumbnailUrl,
            String duration,
            String notes,
            boolean watched,
            int position,
            Instant createdAt) {}

    public record PlaylistDto(
            Long id,
            String name,
            String description,
            int videoCount,
            Instant createdAt,
            Instant updatedAt,
            List<PlaylistItemDto> items) {}

    public record CreatePlaylistRequest(String name, String description) {}

    public record AddVideoToPlaylistRequest(
            String videoId,
            String title,
            String channelTitle,
            String thumbnailUrl,
            String duration,
            String notes) {}

    public record UpdateVideoNotesRequest(String notes, Boolean watched) {}
}
