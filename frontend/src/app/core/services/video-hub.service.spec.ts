import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { VideoHubService } from './video-hub.service';
import { VideoSearchResult } from '../models/video.models';

describe('VideoHubService', () => {
  let service: VideoHubService;
  let httpTesting: HttpTestingController;

  const mockVideo: VideoSearchResult = {
    videoId: 'test1234567',
    title: 'Dynamic Programming Masterclass',
    thumbnailUrl: 'https://i.ytimg.com/vi/test1234567/hqdefault.jpg',
    channelTitle: 'DSA Mentor',
    duration: '25:10',
    viewCount: '150K views',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [VideoHubService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VideoHubService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('initializes with pre-seeded study playlists', () => {
    expect(service.playlists().length).toBeGreaterThan(0);
    expect(service.currentVideo()).toBeTruthy();
    expect(service.theaterMode()).toBe(false);
    expect(service.autoplayNext()).toBe(true);
  });

  it('selects a video and updates currentVideo signal', () => {
    service.selectVideo(mockVideo);
    expect(service.currentVideo()?.videoId).toBe('test1234567');
    expect(service.currentVideo()?.title).toBe('Dynamic Programming Masterclass');
  });

  it('creates a new playlist, adds video to it, and updates local state', () => {
    const pl = service.createPlaylist('Greedy Algorithms', 'Interval scheduling and Huffman');
    expect(pl.name).toBe('Greedy Algorithms');
    expect(service.playlists().some((p) => p.name === 'Greedy Algorithms')).toBe(true);

    const added = service.addVideoToPlaylist(pl.id, mockVideo);
    expect(added).toBe(true);

    const targetPl = service.playlists().find((p) => p.id === pl.id);
    expect(targetPl?.items.length).toBe(1);
    expect(targetPl?.items[0].videoId).toBe('test1234567');
    expect(service.isVideoInPlaylist(pl.id, 'test1234567')).toBe(true);
  });

  it('toggles watched status on playlist item', () => {
    const pl = service.createPlaylist('Graphs', 'BFS and DFS');
    service.addVideoToPlaylist(pl.id, mockVideo);

    service.toggleVideoWatched(pl.id, mockVideo.videoId);
    const item = service.playlists().find((p) => p.id === pl.id)?.items[0];
    expect(item?.watched).toBe(true);

    service.toggleVideoWatched(pl.id, mockVideo.videoId);
    const itemUnwatched = service.playlists().find((p) => p.id === pl.id)?.items[0];
    expect(itemUnwatched?.watched).toBe(false);
  });

  it('removes video from playlist', () => {
    const pl = service.createPlaylist('Trees', 'Binary Search Tree');
    service.addVideoToPlaylist(pl.id, mockVideo);
    expect(service.isVideoInPlaylist(pl.id, mockVideo.videoId)).toBe(true);

    service.removeVideoFromPlaylist(pl.id, mockVideo.videoId);
    expect(service.isVideoInPlaylist(pl.id, mockVideo.videoId)).toBe(false);
  });

  it('deletes playlist by ID', () => {
    const pl = service.createPlaylist('To Delete', 'Test');
    expect(service.playlists().some((p) => p.id === pl.id)).toBe(true);

    service.deletePlaylist(pl.id);
    expect(service.playlists().some((p) => p.id === pl.id)).toBe(false);
  });

  it('navigates next and previous videos in active playlist', () => {
    const pl = service.createPlaylist('Queue Test', 'Queue test');
    const v1 = { ...mockVideo, videoId: 'v1' };
    const v2 = { ...mockVideo, videoId: 'v2' };
    service.addVideoToPlaylist(pl.id, v1);
    service.addVideoToPlaylist(pl.id, v2);

    service.playEntirePlaylist(service.playlists().find((p) => p.id === pl.id)!);
    expect(service.currentVideo()?.videoId).toBe('v1');
    expect(service.hasNextVideo()).toBe(true);
    expect(service.hasPrevVideo()).toBe(false);

    service.playNext();
    expect(service.currentVideo()?.videoId).toBe('v2');
    expect(service.hasNextVideo()).toBe(false);
    expect(service.hasPrevVideo()).toBe(true);

    service.playPrevious();
    expect(service.currentVideo()?.videoId).toBe('v1');
  });

  it('saves and restores video notes in localStorage', () => {
    service.selectVideo(mockVideo);
    service.updateCurrentVideoNotes('O(N*W) memoization table approach with boundary checks.');
    expect(service.currentNotes()).toContain('O(N*W)');

    // Select another video, then re-select mockVideo
    service.selectVideo({ ...mockVideo, videoId: 'otherVideo' });
    expect(service.currentNotes()).toBe('');

    service.selectVideo(mockVideo);
    expect(service.currentNotes()).toContain('O(N*W)');
  });

  it('toggles theater mode and autoplay', () => {
    expect(service.theaterMode()).toBe(false);
    service.toggleTheaterMode();
    expect(service.theaterMode()).toBe(true);

    expect(service.autoplayNext()).toBe(true);
    service.toggleAutoplayNext();
    expect(service.autoplayNext()).toBe(false);
  });

  it('correctly extracts 11-char YouTube ID from links and raw IDs', () => {
    expect(service.extractYouTubeId('UXDSeD9mN-k')).toBe('UXDSeD9mN-k');
    expect(service.extractYouTubeId('https://www.youtube.com/watch?v=UXDSeD9mN-k')).toBe('UXDSeD9mN-k');
    expect(service.extractYouTubeId('https://youtu.be/UXDSeD9mN-k?t=10')).toBe('UXDSeD9mN-k');
    expect(service.extractYouTubeId('https://www.youtube.com/embed/UXDSeD9mN-k')).toBe('UXDSeD9mN-k');
    expect(service.extractYouTubeId('https://www.youtube.com/shorts/UXDSeD9mN-k')).toBe('UXDSeD9mN-k');
    expect(service.extractYouTubeId('striver dynamic programming')).toBeNull();
  });

  it('selects video by ID and fetches oEmbed metadata fallback', () => {
    service.selectVideoById('dQw4w9WgXcQ');
    expect(service.currentVideo()?.videoId).toBe('dQw4w9WgXcQ');

    const req = httpTesting.expectOne('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json');
    req.flush({
      title: 'Never Gonna Give You Up',
      author_name: 'Rick Astley',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });

    expect(service.currentVideo()?.title).toBe('Never Gonna Give You Up');
    expect(service.currentVideo()?.channelTitle).toBe('Rick Astley');
  });
});
