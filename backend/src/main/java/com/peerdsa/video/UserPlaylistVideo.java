package com.peerdsa.video;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "user_playlist_videos")
public class UserPlaylistVideo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id", nullable = false)
    private UserVideoPlaylist playlist;

    @Column(name = "video_id", nullable = false, length = 64)
    private String videoId;

    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(name = "channel_title", nullable = false, length = 200)
    private String channelTitle = "";

    @Column(name = "thumbnail_url", nullable = false, length = 500)
    private String thumbnailUrl = "";

    @Column(nullable = false, length = 30)
    private String duration = "";

    @Column(nullable = false, columnDefinition = "text")
    private String notes = "";

    @Column(nullable = false)
    private boolean watched = false;

    @Column(nullable = false)
    private int position = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UserPlaylistVideo() {}

    public UserPlaylistVideo(
            UserVideoPlaylist playlist,
            String videoId,
            String title,
            String channelTitle,
            String thumbnailUrl,
            String duration,
            int position) {
        this.playlist = playlist;
        this.videoId = videoId;
        this.title = title;
        this.channelTitle = channelTitle != null ? channelTitle : "";
        this.thumbnailUrl = thumbnailUrl != null ? thumbnailUrl : "";
        this.duration = duration != null ? duration : "";
        this.position = position;
    }

    public Long getId() {
        return id;
    }

    public UserVideoPlaylist getPlaylist() {
        return playlist;
    }

    public void setPlaylist(UserVideoPlaylist playlist) {
        this.playlist = playlist;
    }

    public String getVideoId() {
        return videoId;
    }

    public void setVideoId(String videoId) {
        this.videoId = videoId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getChannelTitle() {
        return channelTitle;
    }

    public void setChannelTitle(String channelTitle) {
        this.channelTitle = channelTitle != null ? channelTitle : "";
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl != null ? thumbnailUrl : "";
    }

    public String getDuration() {
        return duration;
    }

    public void setDuration(String duration) {
        this.duration = duration != null ? duration : "";
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes != null ? notes : "";
    }

    public boolean isWatched() {
        return watched;
    }

    public void setWatched(boolean watched) {
        this.watched = watched;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
