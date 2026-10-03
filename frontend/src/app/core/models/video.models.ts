export interface VideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration?: string;
  viewCount?: string;
  publishedTime?: string;
  source?: string;
}

export interface PlaylistItem {
  id?: number | string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration?: string;
  notes?: string;
  watched?: boolean;
  position?: number;
  createdAt?: string;
}

export interface Playlist {
  id: number | string;
  name: string;
  description?: string;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
}

export interface AddVideoToPlaylistRequest {
  videoId: string;
  title: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  duration?: string;
  notes?: string;
}
