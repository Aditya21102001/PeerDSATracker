-- User Video Playlists and Playlist Items for Embedded YouTube Player

CREATE TABLE IF NOT EXISTS user_video_playlists (
    id                  bigserial PRIMARY KEY,
    user_id             bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name                varchar(150) NOT NULL,
    description         text DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_video_playlists_user ON user_video_playlists (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_playlist_videos (
    id                  bigserial PRIMARY KEY,
    playlist_id         bigint NOT NULL REFERENCES user_video_playlists (id) ON DELETE CASCADE,
    video_id            varchar(64) NOT NULL,
    title               text NOT NULL,
    channel_title       text NOT NULL DEFAULT '',
    thumbnail_url       text NOT NULL DEFAULT '',
    duration            varchar(30) NOT NULL DEFAULT '',
    notes               text NOT NULL DEFAULT '',
    watched             boolean NOT NULL DEFAULT false,
    position            integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_playlist_videos_playlist ON user_playlist_videos (playlist_id, position ASC);
