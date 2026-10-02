import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  TOTAL_TOUR_DURATION,
  VIDEO_TOUR_CHAPTERS,
  VideoTourChapter,
  VideoTourService,
} from '../../core/services/video-tour.service';

@Component({
  selector: 'app-video-tour-modal',
  templateUrl: './video-tour-modal.html',
  styleUrls: ['./video-tour-modal.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTourModal {
  readonly tour = inject(VideoTourService);

  @ViewChild('playerStage') playerStageRef?: ElementRef<HTMLElement>;

  readonly rates = [0.75, 1, 1.25, 1.5, 2];

  /** Format seconds as mm:ss */
  formatTime(totalSec: number): string {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  currentTimeFormatted = computed(() => this.formatTime(this.tour.currentTime()));
  totalDurationFormatted = computed(() => this.formatTime(this.tour.totalDuration));

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.tour.isOpen()) return;

    // Ignore key shortcuts if user is typing in an input
    const target = event.target as HTMLElement;
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.tour.close();
        break;
      case ' ':
        event.preventDefault();
        this.tour.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.tour.skip(-10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.tour.skip(10);
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.tour.toggleMute();
        break;
      case 'c':
      case 'C':
        event.preventDefault();
        this.tour.toggleCaptions();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFullscreen();
        break;
    }
  }

  onScrubberClick(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    this.tour.seek(ratio * this.tour.totalDuration);
  }

  toggleFullscreen(): void {
    const stage = this.playerStageRef?.nativeElement;
    if (!stage) return;

    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  getChapterProgress(chapter: VideoTourChapter): number {
    const curr = this.tour.currentTime();
    if (curr < chapter.startTime) return 0;
    if (curr >= chapter.startTime + chapter.duration) return 100;
    return ((curr - chapter.startTime) / chapter.duration) * 100;
  }
}
