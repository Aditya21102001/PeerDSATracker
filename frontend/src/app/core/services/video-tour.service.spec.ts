import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  TOTAL_TOUR_DURATION,
  VIDEO_TOUR_CHAPTERS,
  VideoTourService,
} from './video-tour.service';

describe('VideoTourService', () => {
  let service: VideoTourService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VideoTourService, provideRouter([])],
    });
    service = TestBed.inject(VideoTourService);
  });

  it('starts closed and paused', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.isPlaying()).toBe(false);
    expect(service.currentTime()).toBe(0);
    expect(service.playbackRate()).toBe(1);
    expect(service.isMuted()).toBe(false);
    expect(service.captionsEnabled()).toBe(true);
  });

  it('opens at chapter 0 by default and begins playback', () => {
    service.open();
    expect(service.isOpen()).toBe(true);
    expect(service.isPlaying()).toBe(true);
    expect(service.currentChapterIndex()).toBe(0);
    expect(service.currentChapter().id).toBe('welcome');
  });

  it('opens at a specific chapter when requested', () => {
    service.open(2); // Code runner chapter
    expect(service.isOpen()).toBe(true);
    expect(service.currentChapterIndex()).toBe(2);
    expect(service.currentChapter().id).toBe('code');
    expect(service.currentTime()).toBe(VIDEO_TOUR_CHAPTERS[2].startTime);
  });

  it('seeks to valid chapter start time', () => {
    service.open();
    service.seekToChapter(4); // Articles chapter
    expect(service.currentChapterIndex()).toBe(4);
    expect(service.currentChapter().id).toBe('articles');
  });

  it('computes captions dynamically based on chapter and timestamp', () => {
    service.open(0);
    expect(service.currentCaption()).toBeTruthy();
  });

  it('clamps seeking within bounds (0 to totalDuration)', () => {
    service.open();
    service.seek(-50);
    expect(service.currentTime()).toBe(0);

    service.seek(TOTAL_TOUR_DURATION + 100);
    expect(service.currentTime()).toBe(TOTAL_TOUR_DURATION);
  });

  it('skips forward and backward by delta seconds', () => {
    service.open();
    service.seek(20);
    service.skip(10);
    expect(service.currentTime()).toBe(30);

    service.skip(-15);
    expect(service.currentTime()).toBe(15);
  });

  it('toggles play/pause, mute, and captions', () => {
    service.open();
    expect(service.isPlaying()).toBe(true);

    service.togglePlay();
    expect(service.isPlaying()).toBe(false);

    service.togglePlay();
    expect(service.isPlaying()).toBe(true);

    expect(service.isMuted()).toBe(false);
    service.toggleMute();
    expect(service.isMuted()).toBe(true);

    expect(service.captionsEnabled()).toBe(true);
    service.toggleCaptions();
    expect(service.captionsEnabled()).toBe(false);
  });

  it('updates playback rate within supported values', () => {
    service.setRate(1.5);
    expect(service.playbackRate()).toBe(1.5);

    service.setRate(2);
    expect(service.playbackRate()).toBe(2);
  });

  it('closes cleanly and pauses playback', () => {
    service.open();
    expect(service.isOpen()).toBe(true);
    service.close();
    expect(service.isOpen()).toBe(false);
    expect(service.isPlaying()).toBe(false);
  });
});
