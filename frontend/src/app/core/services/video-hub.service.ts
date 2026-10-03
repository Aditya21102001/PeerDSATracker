import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of, tap, timeout } from 'rxjs';
import {
  AddVideoToPlaylistRequest,
  CreatePlaylistRequest,
  Playlist,
  PlaylistItem,
  VideoSearchResult,
} from '../models/video.models';
import { AuthStore } from './auth.store';

const STORAGE_KEY = 'peerdsa_user_playlists_v1';
const LAST_WATCHED_KEY = 'peerdsa_last_watched_video_v1';

@Injectable({ providedIn: 'root' })
export class VideoHubService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  // --- State Signals ---------------------------------------------------------
  private readonly playlistsSignal = signal<Playlist[]>(this.loadPlaylistsFromStorage());
  private readonly searchResultsSignal = signal<VideoSearchResult[]>([]);
  private readonly isSearchingSignal = signal<boolean>(false);
  private readonly currentVideoSignal = signal<PlaylistItem | VideoSearchResult | null>(this.loadInitialVideo());
  private readonly activePlaylistIdSignal = signal<number | string | null>(null);
  private readonly theaterModeSignal = signal<boolean>(false);
  private readonly autoplayNextSignal = signal<boolean>(true);
  private readonly currentNotesSignal = signal<string>('');

  // Public readonly views
  readonly playlists = this.playlistsSignal.asReadonly();
  readonly searchResults = this.searchResultsSignal.asReadonly();
  readonly isSearching = this.isSearchingSignal.asReadonly();
  readonly currentVideo = this.currentVideoSignal.asReadonly();
  readonly activePlaylistId = this.activePlaylistIdSignal.asReadonly();
  readonly theaterMode = this.theaterModeSignal.asReadonly();
  readonly autoplayNext = this.autoplayNextSignal.asReadonly();
  readonly currentNotes = this.currentNotesSignal.asReadonly();

  readonly activePlaylist = computed(() => {
    const id = this.activePlaylistIdSignal();
    if (!id) return null;
    return this.playlistsSignal().find((p) => String(p.id) === String(id)) ?? null;
  });

  readonly playlistQueue = computed(() => {
    const active = this.activePlaylist();
    return active ? active.items : [];
  });

  readonly currentVideoIndexInPlaylist = computed(() => {
    const video = this.currentVideoSignal();
    const queue = this.playlistQueue();
    if (!video || queue.length === 0) return -1;
    return queue.findIndex((v) => v.videoId === video.videoId);
  });

  readonly hasNextVideo = computed(() => {
    const idx = this.currentVideoIndexInPlaylist();
    const queue = this.playlistQueue();
    return idx >= 0 && idx < queue.length - 1;
  });

  readonly hasPrevVideo = computed(() => {
    const idx = this.currentVideoIndexInPlaylist();
    return idx > 0;
  });

  constructor() {
    // If user is logged in, optionally sync playlists from server
    if (this.auth.isAuthenticated()) {
      this.fetchBackendPlaylists();
    }
  }

  // --- Utility: YouTube ID Extraction ----------------------------------------

  extractYouTubeId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts)\/))([a-zA-Z0-9_-]{11})/,
    );
    return match ? match[1] : null;
  }

  // --- Video Search ----------------------------------------------------------

  searchVideos(query: string, autoSelectFirst: boolean = false) {
    const q = (query || '').trim();
    if (!q) {
      this.loadCuratedVideos();
      return;
    }

    // Direct YouTube link or video ID detection
    const directId = this.extractYouTubeId(q);
    if (directId) {
      this.isSearchingSignal.set(true);
      const directVideo: VideoSearchResult = {
        videoId: directId,
        title: `YouTube Video (${directId})`,
        channelTitle: 'YouTube',
        thumbnailUrl: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
        source: 'direct_url',
      };
      this.searchResultsSignal.set([directVideo]);
      this.selectVideo(directVideo);
      this.isSearchingSignal.set(false);

      // Enrich metadata in the background via YouTube's public oEmbed API
      this.http
        .get<{ title?: string; author_name?: string; thumbnail_url?: string }>(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`,
        )
        .pipe(catchError(() => of(null)))
        .subscribe((meta) => {
          if (meta?.title) {
            const enriched: VideoSearchResult = {
              videoId: directId,
              title: meta.title,
              channelTitle: meta.author_name || 'YouTube Creator',
              thumbnailUrl: meta.thumbnail_url || directVideo.thumbnailUrl,
              source: 'oembed',
            };
            this.searchResultsSignal.set([enriched]);
            this.currentVideoSignal.set(enriched);
          }
        });
      return;
    }

    this.isSearchingSignal.set(true);

    this.http
      .get<VideoSearchResult[]>(`/api/videos/search?q=${encodeURIComponent(q)}`)
      .pipe(
        timeout(6000),
        catchError(() => of(this.searchClientCurated(q))),
        tap((results) => {
          const list = results && results.length > 0 ? results : this.searchClientCurated(q);
          this.searchResultsSignal.set(list);
          this.isSearchingSignal.set(false);
          if (autoSelectFirst && list.length > 0) {
            this.selectVideo(list[0]);
          }
        }),
      )
      .subscribe();
  }

  playTopSearchResult(): VideoSearchResult | null {
    const list = this.searchResultsSignal();
    if (list && list.length > 0) {
      this.selectVideo(list[0]);
      return list[0];
    }
    return null;
  }

  loadCuratedVideos() {
    this.isSearchingSignal.set(true);
    this.http
      .get<VideoSearchResult[]>('/api/videos/curated')
      .pipe(
        timeout(5000),
        catchError(() => of(CLIENT_CURATED_VIDEOS)),
        tap((results) => {
          this.searchResultsSignal.set(results && results.length > 0 ? results : CLIENT_CURATED_VIDEOS);
          this.isSearchingSignal.set(false);
        }),
      )
      .subscribe();
  }

  selectVideoById(videoId: string) {
    if (!videoId) return;
    const existing =
      this.searchResultsSignal().find((v) => v.videoId === videoId) ||
      this.playlistsSignal()
        .flatMap((p) => p.items)
        .find((it) => it.videoId === videoId) ||
      CLIENT_CURATED_VIDEOS.find((v) => v.videoId === videoId);

    if (existing) {
      this.selectVideo(existing);
      return;
    }

    const fallback: VideoSearchResult = {
      videoId,
      title: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      source: 'direct_id',
    };
    this.selectVideo(fallback);

    this.http
      .get<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      )
      .pipe(catchError(() => of(null)))
      .subscribe((meta) => {
        if (meta?.title) {
          const enriched: VideoSearchResult = {
            videoId,
            title: meta.title,
            channelTitle: meta.author_name || 'YouTube Creator',
            thumbnailUrl: meta.thumbnail_url || fallback.thumbnailUrl,
            source: 'oembed',
          };
          this.currentVideoSignal.set(enriched);
        }
      });
  }

  // --- Playback Controls -----------------------------------------------------

  selectVideo(video: VideoSearchResult | PlaylistItem, playlistId: number | string | null = null) {
    this.currentVideoSignal.set(video);
    if (playlistId !== null) {
      this.activePlaylistIdSignal.set(playlistId);
    }

    // Save to localStorage for quick restore on reload
    try {
      localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(video));
    } catch {
      /* ignore */
    }

    // Load existing notes for this video
    const note = this.findNoteForVideo(video.videoId);
    this.currentNotesSignal.set(note);
  }

  playNext(): boolean {
    const idx = this.currentVideoIndexInPlaylist();
    const queue = this.playlistQueue();
    if (idx >= 0 && idx < queue.length - 1) {
      this.selectVideo(queue[idx + 1], this.activePlaylistIdSignal());
      return true;
    }
    return false;
  }

  playPrevious(): boolean {
    const idx = this.currentVideoIndexInPlaylist();
    const queue = this.playlistQueue();
    if (idx > 0) {
      this.selectVideo(queue[idx - 1], this.activePlaylistIdSignal());
      return true;
    }
    return false;
  }

  playEntirePlaylist(playlist: Playlist) {
    if (playlist.items && playlist.items.length > 0) {
      this.selectVideo(playlist.items[0], playlist.id);
    }
  }

  toggleTheaterMode() {
    this.theaterModeSignal.update((m) => !m);
  }

  toggleAutoplayNext() {
    this.autoplayNextSignal.update((a) => !a);
  }

  updateCurrentVideoNotes(notes: string) {
    this.currentNotesSignal.set(notes);
    const video = this.currentVideoSignal();
    if (!video) return;

    // Save note in all playlists that contain this video
    this.playlistsSignal.update((playlists) =>
      playlists.map((p) => ({
        ...p,
        items: p.items.map((it) => (it.videoId === video.videoId ? { ...it, notes } : it)),
      })),
    );
    this.persistPlaylistsLocally();

    // Also persist video notes standalone
    try {
      localStorage.setItem(`peerdsa_notes_${video.videoId}`, notes);
    } catch {
      /* ignore */
    }

    // If authenticated and in an active playlist, sync to backend
    const activeId = this.activePlaylistIdSignal();
    if (this.auth.isAuthenticated() && activeId) {
      this.http
        .patch(`/api/playlists/${activeId}/videos/${video.videoId}`, { notes, watched: null })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
  }

  // --- Playlist Operations ---------------------------------------------------

  createPlaylist(name: string, description: string = ''): Playlist {
    const trimmed = name.trim() || 'My Playlist';
    const newPlaylist: Playlist = {
      id: 'local_' + Date.now(),
      name: trimmed,
      description: description.trim(),
      videoCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
    };

    this.playlistsSignal.update((current) => [newPlaylist, ...current]);
    this.persistPlaylistsLocally();

    // Sync to backend if authenticated
    if (this.auth.isAuthenticated()) {
      this.http
        .post<Playlist>('/api/playlists', { name: trimmed, description })
        .pipe(
          catchError(() => of(null)),
          tap((saved) => {
            if (saved) {
              this.playlistsSignal.update((list) =>
                list.map((p) => (p.id === newPlaylist.id ? { ...saved, items: [] } : p)),
              );
              this.persistPlaylistsLocally();
            }
          }),
        )
        .subscribe();
    }

    return newPlaylist;
  }

  deletePlaylist(playlistId: number | string) {
    this.playlistsSignal.update((current) => current.filter((p) => String(p.id) !== String(playlistId)));
    if (String(this.activePlaylistIdSignal()) === String(playlistId)) {
      this.activePlaylistIdSignal.set(null);
    }
    this.persistPlaylistsLocally();

    if (this.auth.isAuthenticated() && typeof playlistId === 'number') {
      this.http
        .delete(`/api/playlists/${playlistId}`)
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
  }

  addVideoToPlaylist(
    playlistId: number | string,
    video: VideoSearchResult | PlaylistItem,
    notes: string = '',
  ): boolean {
    const playlists = this.playlistsSignal();
    const target = playlists.find((p) => String(p.id) === String(playlistId));
    if (!target) return false;

    // Check if video already exists in playlist
    if (target.items.some((it) => it.videoId === video.videoId)) {
      return false; // already present
    }

    const newItem: PlaylistItem = {
      id: 'item_' + Date.now(),
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration || '',
      viewCount: video.viewCount || '',
      publishedTime: video.publishedTime || '',
      notes: notes || '',
      watched: false,
      position: target.items.length,
      createdAt: new Date().toISOString(),
    };

    this.playlistsSignal.update((current) =>
      current.map((p) => {
        if (String(p.id) === String(playlistId)) {
          const items = [...p.items, newItem];
          return {
            ...p,
            items,
            videoCount: items.length,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      }),
    );
    this.persistPlaylistsLocally();

    // Sync to backend if authenticated and playlist is on server
    if (this.auth.isAuthenticated() && typeof playlistId === 'number') {
      const payload: AddVideoToPlaylistRequest = {
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration || '',
        notes,
      };
      this.http
        .post(`/api/playlists/${playlistId}/videos`, payload)
        .pipe(catchError(() => of(null)))
        .subscribe();
    }

    return true;
  }

  removeVideoFromPlaylist(playlistId: number | string, videoId: string) {
    this.playlistsSignal.update((current) =>
      current.map((p) => {
        if (String(p.id) === String(playlistId)) {
          const filtered = p.items.filter((it) => it.videoId !== videoId);
          return {
            ...p,
            items: filtered,
            videoCount: filtered.length,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      }),
    );
    this.persistPlaylistsLocally();

    if (this.auth.isAuthenticated() && typeof playlistId === 'number') {
      this.http
        .delete(`/api/playlists/${playlistId}/videos/${videoId}`)
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
  }

  toggleVideoWatched(playlistId: number | string, videoId: string) {
    let newWatched = false;
    this.playlistsSignal.update((current) =>
      current.map((p) => {
        if (String(p.id) === String(playlistId)) {
          const updated = p.items.map((it) => {
            if (it.videoId === videoId) {
              newWatched = !it.watched;
              return { ...it, watched: newWatched };
            }
            return it;
          });
          return { ...p, items: updated };
        }
        return p;
      }),
    );
    this.persistPlaylistsLocally();

    if (this.auth.isAuthenticated() && typeof playlistId === 'number') {
      this.http
        .patch(`/api/playlists/${playlistId}/videos/${videoId}`, { notes: null, watched: newWatched })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
  }

  isVideoInPlaylist(playlistId: number | string, videoId: string): boolean {
    const p = this.playlistsSignal().find((pl) => String(pl.id) === String(playlistId));
    return p ? p.items.some((it) => it.videoId === videoId) : false;
  }

  // --- Persistence & Helpers -------------------------------------------------

  private findNoteForVideo(videoId: string): string {
    try {
      const saved = localStorage.getItem(`peerdsa_notes_${videoId}`);
      if (saved) return saved;
    } catch {
      /* ignore */
    }

    for (const p of this.playlistsSignal()) {
      const match = p.items.find((it) => it.videoId === videoId);
      if (match?.notes) return match.notes;
    }
    return '';
  }

  private persistPlaylistsLocally() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.playlistsSignal()));
    } catch {
      /* ignore */
    }
  }

  private loadPlaylistsFromStorage(): Playlist[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as Playlist[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_PLAYLISTS;
  }

  private loadInitialVideo(): VideoSearchResult {
    try {
      const last = localStorage.getItem(LAST_WATCHED_KEY);
      if (last) {
        const parsed = JSON.parse(last) as VideoSearchResult;
        if (parsed?.videoId) return parsed;
      }
    } catch {
      /* ignore */
    }
    return CLIENT_CURATED_VIDEOS[0];
  }

  private fetchBackendPlaylists() {
    this.http
      .get<Playlist[]>('/api/playlists')
      .pipe(
        catchError(() => of([])),
        tap((serverPlaylists) => {
          if (serverPlaylists && serverPlaylists.length > 0) {
            const local = this.playlistsSignal();
            const merged = [...serverPlaylists];
            for (const loc of local) {
              if (typeof loc.id === 'string' && loc.id.startsWith('local_')) {
                merged.push(loc);
              }
            }
            this.playlistsSignal.set(merged);
            this.persistPlaylistsLocally();
          }
        }),
      )
      .subscribe();
  }

  private searchClientCurated(query: string): VideoSearchResult[] {
    const q = query.toLowerCase().trim();
    if (!q) return CLIENT_CURATED_VIDEOS;
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = CLIENT_CURATED_VIDEOS.filter((v) => {
      const text = `${v.title} ${v.channelTitle} ${v.publishedTime || ''}`.toLowerCase();
      return tokens.some((tok) => text.includes(tok));
    });
    return matches.length > 0 ? matches : [];
  }
}

// --- Curated Data for 0-Latency & Offline -------------------------------------

export const CLIENT_CURATED_VIDEOS: VideoSearchResult[] = [
  {
    videoId: 'UXDSeD9mN-k',
    title: '2 Sum Problem | 2 Types of the Same Problem for Interviews | Brute-Better-Optimal',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/UXDSeD9mN-k/hqdefault.jpg',
    duration: '24:18',
    viewCount: '640K views',
    publishedTime: 'Striver A2Z Arrays',
    source: 'curated',
  },
  {
    videoId: 'sdE0A2Oxofw',
    title: 'DP 8. Grid Unique Paths | Learn Everything about DP on Grids | ALL TECHNIQUES 🔥',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/sdE0A2Oxofw/hqdefault.jpg',
    duration: '22:45',
    viewCount: '520K views',
    publishedTime: 'Striver DP Dynamic Programming',
    source: 'curated',
  },
  {
    videoId: 'KLlXCFG5TnA',
    title: 'Two Sum - Leetcode 1 - HashMap Approach in Python/Java',
    channelTitle: 'NeetCode',
    thumbnailUrl: 'https://i.ytimg.com/vi/KLlXCFG5TnA/hqdefault.jpg',
    duration: '09:12',
    viewCount: '1.8M views',
    publishedTime: 'NeetCode 150 Arrays',
    source: 'curated',
  },
  {
    videoId: 'AHZpyQDEAlk',
    title: "Kadane's Algorithm | Maximum Subarray Sum | Complete Intuition & Code",
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/AHZpyQDEAlk/hqdefault.jpg',
    duration: '19:30',
    viewCount: '480K views',
    publishedTime: 'Striver Arrays Subarray',
    source: 'curated',
  },
  {
    videoId: 'V8qIqJxCioo',
    title: "Kosaraju's Algorithm for Strongly Connected Components (SCC) | Graph Series",
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/V8qIqJxCioo/hqdefault.jpg',
    duration: '26:10',
    viewCount: '310K views',
    publishedTime: 'Striver Graph SCC',
    source: 'curated',
  },
  {
    videoId: 'aBxjDBC4M1U',
    title: 'Disjoint Set | Union by Rank | Path Compression | Complete Graph Masterclass',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/aBxjDBC4M1U/hqdefault.jpg',
    duration: '28:50',
    viewCount: '420K views',
    publishedTime: 'Striver Graph DSU',
    source: 'curated',
  },
  {
    videoId: 'mLfjzJsN8us',
    title: 'Climbing Stairs | 1D Dynamic Programming | Memoization & Tabulation',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/mLfjzJsN8us/hqdefault.jpg',
    duration: '16:40',
    viewCount: '390K views',
    publishedTime: 'Striver DP Recursion',
    source: 'curated',
  },
  {
    videoId: 'xBC--Sdt-dI',
    title: 'System Design Interview: How to Design a Rate Limiter',
    channelTitle: 'ByteByteGo',
    thumbnailUrl: 'https://i.ytimg.com/vi/xBC--Sdt-dI/hqdefault.jpg',
    duration: '14:20',
    viewCount: '890K views',
    publishedTime: 'System Design Architecture',
    source: 'curated',
  },
  {
    videoId: 'bBC-nXj3Ng4',
    title: 'Java Concurrency & Multithreading Crash Course',
    channelTitle: 'FreeCodeCamp',
    thumbnailUrl: 'https://i.ytimg.com/vi/bBC-nXj3Ng4/hqdefault.jpg',
    duration: '1:12:30',
    viewCount: '750K views',
    publishedTime: 'Java Threads Concurrency',
    source: 'curated',
  },
  {
    videoId: 'G4J6126n_xM',
    title: 'Spring Boot Full Course - Learn Microservices with Spring Boot 3',
    channelTitle: 'Amigoscode',
    thumbnailUrl: 'https://i.ytimg.com/vi/G4J6126n_xM/hqdefault.jpg',
    duration: '2:45:10',
    viewCount: '1.2M views',
    publishedTime: 'Spring Boot Microservices',
    source: 'curated',
  },
  {
    videoId: 'o-nCM6v6h0g',
    title: 'Angular 19 Full Course | Signals, Standalone Components & SSR',
    channelTitle: 'Academind',
    thumbnailUrl: 'https://i.ytimg.com/vi/o-nCM6v6h0g/hqdefault.jpg',
    duration: '1:40:20',
    viewCount: '310K views',
    publishedTime: 'Angular Signals Web',
    source: 'curated',
  },
  {
    videoId: 'mJcZjjKzeqk',
    title: "Prim's Algorithm - Minimum Spanning Tree | Graph Theory",
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/mJcZjjKzeqk/hqdefault.jpg',
    duration: '23:15',
    viewCount: '290K views',
    publishedTime: 'Striver Graph MST',
    source: 'curated',
  },
  {
    videoId: 'jY83Psqb5z4',
    title: 'Binary Search Algorithm | Theory & Intuition | Striver A2Z DSA Course',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/jY83Psqb5z4/hqdefault.jpg',
    duration: '18:40',
    viewCount: '580K views',
    publishedTime: 'Striver Binary Search',
    source: 'curated',
  },
  {
    videoId: 'W6L4zJ8Xpvg',
    title: 'Sliding Window Maximum | Monotonic Deque | LeetCode 239',
    channelTitle: 'NeetCode',
    thumbnailUrl: 'https://i.ytimg.com/vi/W6L4zJ8Xpvg/hqdefault.jpg',
    duration: '16:22',
    viewCount: '410K views',
    publishedTime: 'NeetCode Sliding Window Deque',
    source: 'curated',
  },
  {
    videoId: 'fAAZixBzIAI',
    title: 'Lowest Common Ancestor in Binary Tree | Striver Tree Series',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/fAAZixBzIAI/hqdefault.jpg',
    duration: '15:10',
    viewCount: '370K views',
    publishedTime: 'Striver Binary Tree LCA',
    source: 'curated',
  },
  {
    videoId: 'oyK52j_S7fI',
    title: 'Topological Sort using Kahn Algorithm (BFS) | Graph Series',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/oyK52j_S7fI/hqdefault.jpg',
    duration: '21:05',
    viewCount: '440K views',
    publishedTime: 'Striver Graph Topo Sort Kahn',
    source: 'curated',
  },
  {
    videoId: 'G0vxee8XnkA',
    title: '0/1 Knapsack Problem | Dynamic Programming | Recursion to Space Optimization',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/G0vxee8XnkA/hqdefault.jpg',
    duration: '27:12',
    viewCount: '620K views',
    publishedTime: 'Striver DP Knapsack',
    source: 'curated',
  },
  {
    videoId: 'fhyZc0r6X_4',
    title: 'System Design: How URL Shortener (TinyURL) Works Under the Hood',
    channelTitle: 'ByteByteGo',
    thumbnailUrl: 'https://i.ytimg.com/vi/fhyZc0r6X_4/hqdefault.jpg',
    duration: '12:50',
    viewCount: '950K views',
    publishedTime: 'System Design TinyURL Base62',
    source: 'curated',
  },
  {
    videoId: 'hnpzNAPiC0E',
    title: 'LRU Cache Implementation | Design Data Structure | LeetCode 146',
    channelTitle: 'take U forward',
    thumbnailUrl: 'https://i.ytimg.com/vi/hnpzNAPiC0E/hqdefault.jpg',
    duration: '29:45',
    viewCount: '480K views',
    publishedTime: 'Striver Linked List LRU Cache',
    source: 'curated',
  },
];

export const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'default_striver',
    name: '🔥 Striver A2Z Core Masterclass',
    description: 'Essential problem explanations from Striver covering Arrays, DP, and Graphs.',
    videoCount: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: 'def_1',
        videoId: 'UXDSeD9mN-k',
        title: '2 Sum Problem | 2 Types of the Same Problem for Interviews | Brute-Better-Optimal',
        channelTitle: 'take U forward',
        thumbnailUrl: 'https://i.ytimg.com/vi/UXDSeD9mN-k/hqdefault.jpg',
        duration: '24:18',
        notes: 'Two pointer approach requires sorting first. Hash map approach O(N) time and O(N) space.',
        watched: false,
        position: 0,
      },
      {
        id: 'def_2',
        videoId: 'AHZpyQDEAlk',
        title: "Kadane's Algorithm | Maximum Subarray Sum | Complete Intuition & Code",
        channelTitle: 'take U forward',
        thumbnailUrl: 'https://i.ytimg.com/vi/AHZpyQDEAlk/hqdefault.jpg',
        duration: '19:30',
        notes: 'Sum accumulates; if negative, reset sum to 0. Update max whenever current sum > max.',
        watched: false,
        position: 1,
      },
      {
        id: 'def_3',
        videoId: 'sdE0A2Oxofw',
        title: 'DP 8. Grid Unique Paths | Learn Everything about DP on Grids | ALL TECHNIQUES 🔥',
        channelTitle: 'take U forward',
        thumbnailUrl: 'https://i.ytimg.com/vi/sdE0A2Oxofw/hqdefault.jpg',
        duration: '22:45',
        notes: 'dp[i][j] = dp[i-1][j] + dp[i][j-1]. Can be space-optimized to single row O(M).',
        watched: false,
        position: 2,
      },
      {
        id: 'def_4',
        videoId: 'aBxjDBC4M1U',
        title: 'Disjoint Set | Union by Rank | Path Compression | Complete Graph Masterclass',
        channelTitle: 'take U forward',
        thumbnailUrl: 'https://i.ytimg.com/vi/aBxjDBC4M1U/hqdefault.jpg',
        duration: '28:50',
        notes: 'O(4*alpha) almost constant time. Crucial for Kruskal MST and dynamic connectivity.',
        watched: false,
        position: 3,
      },
      {
        id: 'def_5',
        videoId: 'V8qIqJxCioo',
        title: "Kosaraju's Algorithm for Strongly Connected Components (SCC) | Graph Series",
        channelTitle: 'take U forward',
        thumbnailUrl: 'https://i.ytimg.com/vi/V8qIqJxCioo/hqdefault.jpg',
        duration: '26:10',
        notes: 'Step 1: sort by finishing time (DFS). Step 2: reverse edges. Step 3: DFS in order.',
        watched: false,
        position: 4,
      },
    ],
  },
  {
    id: 'default_sysdesign',
    name: '🏗️ System Design & Backend Architecture',
    description: 'High-availability architecture, rate limiters, caching, and Spring Boot microservices.',
    videoCount: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: 'sd_1',
        videoId: 'xBC--Sdt-dI',
        title: 'System Design Interview: How to Design a Rate Limiter',
        channelTitle: 'ByteByteGo',
        thumbnailUrl: 'https://i.ytimg.com/vi/xBC--Sdt-dI/hqdefault.jpg',
        duration: '14:20',
        notes: 'Token Bucket vs Leaky Bucket vs Sliding Window Counter in Redis.',
        watched: false,
        position: 0,
      },
      {
        id: 'sd_2',
        videoId: 'fhyZc0r6X_4',
        title: 'System Design: How URL Shortener (TinyURL) Works Under the Hood',
        channelTitle: 'ByteByteGo',
        thumbnailUrl: 'https://i.ytimg.com/vi/fhyZc0r6X_4/hqdefault.jpg',
        duration: '12:50',
        notes: 'Base62 encoding of unique auto-incrementing ID with distributed ID generator (Snowflake).',
        watched: false,
        position: 1,
      },
      {
        id: 'sd_3',
        videoId: 'bBC-nXj3Ng4',
        title: 'Java Concurrency & Multithreading Crash Course',
        channelTitle: 'FreeCodeCamp',
        thumbnailUrl: 'https://i.ytimg.com/vi/bBC-nXj3Ng4/hqdefault.jpg',
        duration: '1:12:30',
        notes: 'Synchronized, Locks, ConcurrentHashMap, ThreadPoolExecutor, and Java 21 Virtual Threads.',
        watched: false,
        position: 2,
      },
      {
        id: 'sd_4',
        videoId: 'G4J6126n_xM',
        title: 'Spring Boot Full Course - Learn Microservices with Spring Boot 3',
        channelTitle: 'Amigoscode',
        thumbnailUrl: 'https://i.ytimg.com/vi/G4J6126n_xM/hqdefault.jpg',
        duration: '2:45:10',
        notes: 'Eureka Service Discovery, API Gateway, Resilience4j Circuit Breaker, Distributed Tracing.',
        watched: false,
        position: 3,
      },
    ],
  },
];
