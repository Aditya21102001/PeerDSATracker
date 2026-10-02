import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { VideoTourService } from '../../core/services/video-tour.service';
import { VideoTourModal } from './video-tour-modal';

describe('VideoTourModal', () => {
  let fixture: ComponentFixture<VideoTourModal>;
  let component: VideoTourModal;
  let service: VideoTourService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoTourModal],
      providers: [VideoTourService, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoTourModal);
    component = fixture.componentInstance;
    service = TestBed.inject(VideoTourService);
    await fixture.whenStable();
  });

  it('renders nothing when tour is closed', () => {
    fixture.detectChanges();
    const modalEl = fixture.nativeElement.querySelector('.video-tour-overlay');
    expect(modalEl).toBeNull();
  });

  it('renders dialog and chapters when tour is opened', async () => {
    service.open();
    fixture.detectChanges();
    await fixture.whenStable();

    const modalEl = fixture.nativeElement.querySelector('.video-tour-overlay');
    expect(modalEl).not.toBeNull();
    expect(modalEl.getAttribute('role')).toBe('dialog');
    expect(modalEl.getAttribute('aria-modal')).toBe('true');

    const chapters = fixture.nativeElement.querySelectorAll('.chapter-item');
    expect(chapters.length).toBe(7);
  });

  it('formats time correctly', () => {
    expect(component.formatTime(0)).toBe('00:00');
    expect(component.formatTime(65)).toBe('01:05');
    expect(component.formatTime(175)).toBe('02:55');
  });

  it('closes on Escape key', () => {
    service.open();
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(service.isOpen()).toBe(false);
  });

  it('toggles playback on Space key', () => {
    service.open();
    expect(service.isPlaying()).toBe(true);

    const event = new KeyboardEvent('keydown', { key: ' ' });
    document.dispatchEvent(event);

    expect(service.isPlaying()).toBe(false);
  });

  it('skips on ArrowLeft and ArrowRight keys', () => {
    service.open();
    service.seek(30);

    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(left);
    expect(service.currentTime()).toBe(20);

    const right = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    document.dispatchEvent(right);
    expect(service.currentTime()).toBe(30);
  });
});
