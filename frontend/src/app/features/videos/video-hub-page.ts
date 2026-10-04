import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { VideoHubService } from '../../core/services/video-hub.service';
import { VideoStudyCoachService } from '../../core/services/video-study-coach.service';
import { Playlist, PlaylistItem, VideoSearchResult } from '../../core/models/video.models';
import { TopicQuizService } from '../../core/services/topic-quiz.service';
import { Spinner } from '../../shared/spinner';
import { TopicQuizModal } from '../../shared/topic-quiz-modal/topic-quiz-modal';

@Component({
  selector: 'app-video-hub-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Spinner, TopicQuizModal],
  template: `
    <main id="main-content" tabindex="-1" class="vh-page" [class.theater]="service.theaterMode()">
      <!-- Header Navigation -->
      <header class="vh-header">
        <div class="vh-header-text">
          <div class="vh-breadcrumb">
            <span class="badge">YouTube Engine</span>
            <span class="sep">•</span>
            <span class="sub-badge">Embedded Learning</span>
          </div>
          <h1>Video Hub &amp; Playlists</h1>
          <p class="vh-lead">
            Search any YouTube video, curate personalized study playlists, and watch embedded with real-time notes
            right inside PeerDSATracker.
          </p>
        </div>
        <nav class="vh-nav" id="vh-top-nav" aria-label="Video Hub Navigation">
          <button
            id="vh-nav-back-btn"
            type="button"
            class="vh-nav-back-pill"
            (click)="handleHeaderBack()"
            aria-label="Go back to previous page"
          >
            ← {{ viewMode() === 'watch' ? 'Back to Results' : ('Back to ' + nav.previousPageLabel('Dashboard')) }}
          </button>
          @if (auth.isAuthenticated()) {
            <a id="vh-nav-link-dashboard" routerLink="/dashboard">Dashboard</a>
            <a id="vh-nav-link-sheet" routerLink="/sheet">Sheet</a>
            <a id="vh-nav-link-study-guides" routerLink="/study-guides">Study Guides</a>
            <a id="vh-nav-link-hire" routerLink="/hire">Hire</a>
          } @else {
            <a id="vh-nav-link-home" routerLink="/">Home</a>
            <a id="vh-nav-link-study-guides" routerLink="/study-guides">Study Guides</a>
            <a id="vh-nav-link-guide" routerLink="/guide">Guide</a>
            <a id="vh-nav-link-signin" routerLink="/signin">Sign in</a>
          }
        </nav>
      </header>

      <!-- 1. PROMINENT TOP SEARCH & DISCOVERY BAR -->
      <section class="search-section" aria-label="Search YouTube Videos" id="search-section">
        <div class="search-bar-wrap card">
          <div class="search-header-row">
            <div class="search-title-group">
              <span class="yt-brand-icon" aria-hidden="true">▶</span>
              <span class="search-title-label">YouTube Video Search &amp; Embed</span>
            </div>
            <div class="search-meta-group">
              @if (viewMode() === 'watch') {
                <button
                  id="vh-nav-to-results-btn"
                  type="button"
                  class="btn btn-xs btn-ghost btn-switch-view"
                  (click)="backToResults()"
                  aria-label="Switch to search results view"
                >
                  🔍 View Search Results
                </button>
              }
              <span class="search-badge">Live YouTube API + Scraper</span>
            </div>
          </div>

          <form id="vh-search-form" class="search-form" (submit)="onSearchSubmit($event)">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input
              id="vh-search-input"
              type="text"
              class="search-input"
              placeholder="Search YouTube videos (e.g. Striver Two Sum, DP Grid, System Design, or paste YouTube link/video ID...)"
              [(ngModel)]="searchQuery"
              name="query"
              aria-label="Search YouTube videos"
              #searchInput
            />
            @if (searchQuery.trim()) {
              <button
                id="vh-search-clear-btn"
                type="button"
                class="btn-clear"
                (click)="clearSearch()"
                aria-label="Clear search"
              >
                ✕
              </button>
            }
            <button
              id="vh-search-submit-btn"
              type="submit"
              class="btn btn-primary btn-search"
              [disabled]="service.isSearching()"
              aria-label="Submit YouTube search"
            >
              @if (service.isSearching()) {
                <app-spinner inline [size]="16" label="Searching" />
              } @else {
                Search
              }
            </button>
          </form>

          <!-- Direct Link Recognition Banner -->
          @if (detectedDirectVideoId(); as directId) {
            <div id="vh-direct-link-banner" class="direct-link-banner">
              <span class="banner-icon">⚡</span>
              <span class="banner-text">Direct YouTube video recognized: <strong>{{ directId }}</strong></span>
              <button
                id="vh-direct-play-btn"
                type="button"
                class="btn btn-xs btn-accent"
                (click)="playDirectVideo(directId)"
                aria-label="Play recognized YouTube video"
              >
                ▶ Watch Video Now
              </button>
            </div>
          }

          <!-- Quick Topic Filter Pills -->
          <div class="filter-pills" role="group" aria-label="Quick topic filters" id="vh-filter-pills">
            <span class="pill-label">Suggested:</span>
            @for (chip of quickChips; track chip.label; let cIdx = $index) {
              <button
                id="vh-chip-btn-{{ cIdx }}"
                type="button"
                class="chip-btn"
                [class.active]="selectedChip() === chip.label"
                (click)="applyChip(chip)"
                [attr.aria-pressed]="selectedChip() === chip.label"
              >
                {{ chip.label }}
              </button>
            }
          </div>
        </div>
      </section>

      <!-- 2. WATCH MODE: YOUTUBE 2-COLUMN WATCH PAGE -->
      @if (viewMode() === 'watch' && service.currentVideo(); as video) {
        <section id="vh-watch-section" class="watch-section" aria-label="YouTube Video Watch Theater">
          <!-- Back to Results Navigation Ribbon -->
          <div class="watch-top-ribbon" id="vh-watch-top-ribbon">
            <button
              id="vh-btn-back-to-results"
              type="button"
              class="btn btn-sm btn-ghost back-btn"
              (click)="backToResults()"
              aria-label="Back to search results"
            >
              ← Back to {{ searchQuery.trim() ? 'Search Results' : 'Browse' }}
            </button>
            <span class="ribbon-now-playing" id="vh-ribbon-now-playing">
              ▶ <strong>Now Playing:</strong> {{ video.title }}
            </span>
          </div>

          <div class="watch-layout" [class.theater-layout]="service.theaterMode()" id="vh-watch-layout">
            <!-- Left / Primary Column: Embedded Player & Video Info & Notes -->
            <div class="watch-main-col">
              <div class="player-container card">
                <!-- 16:9 Responsive Embedded Video Player -->
                <div class="video-frame-wrapper" id="vh-video-frame-wrapper">
                  <iframe
                    #embeddedPlayerFrame
                    id="vh-embedded-player-frame"
                    [src]="sanitizedVideoUrl()"
                    [title]="'YouTube video player — ' + video.title"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen
                    class="video-iframe"
                    (load)="onIframeLoad()"
                  ></iframe>

                  <!-- Auto-Pause Away Overlay (When user switches tabs, blurs, or leaves screen) -->
                  @if (coach.isAway()) {
                    <div id="vh-away-overlay" class="away-overlay" role="alert" aria-live="assertive">
                      <div class="away-card card" id="vh-away-card">
                        <div class="away-icon-ring">
                          <span class="away-icon">⏸️</span>
                        </div>
                        <h3 id="vh-away-title">Video Auto-Paused: You Were Away</h3>
                        <p id="vh-away-desc" class="away-desc">
                          @if (coach.awayReason() === 'AWAY_PRESENCE_LOST') {
                            You stepped away from your desk. Video paused to preserve your study spot!
                          } @else {
                            You switched tabs or minimized the study window. Focus protected.
                          }
                        </p>
                        <div class="away-stats-row">
                          <span class="away-stat-pill">
                            ⏱️ Continuous Watch: <strong>{{ coach.formattedContinuousWatch() }}</strong>
                          </span>
                          <span class="away-stat-pill">
                            🌟 Retention Score: <strong>{{ coach.activeLearningIndex() }}/100</strong>
                          </span>
                        </div>
                        <div class="away-actions-row">
                          <button
                            id="vh-away-resume-btn"
                            type="button"
                            class="btn btn-primary btn-resume"
                            (click)="coach.resumeFromAway()"
                            aria-label="Resume video"
                          >
                            ▶ Resume Watching (Space)
                          </button>
                          <button
                            id="vh-away-notes-btn"
                            type="button"
                            class="btn btn-ghost"
                            (click)="openNotesFromAway()"
                            aria-label="Take note while paused"
                          >
                            📝 Note while Paused
                          </button>
                        </div>
                        <small class="away-hint">💡 Tip: Press <kbd>Space</kbd> anytime to resume playback.</small>
                      </div>
                    </div>
                  }
                </div>

                <!-- Live Study Habits & Focus HUD Bar -->
                <div class="study-hud-bar card" id="vh-study-hud-bar" role="region" aria-label="Live Study Habits Monitor">
                  <div class="hud-left">
                    <div class="hud-status-group">
                      <span
                        id="vh-hud-status-badge"
                        class="hud-status-badge"
                        [class]="coach.patternLabel().badgeClass"
                        [title]="coach.patternLabel().subtitle"
                      >
                        <span class="hud-icon">{{ coach.patternLabel().icon }}</span>
                        <span class="hud-badge-title">{{ coach.patternLabel().title }}</span>
                      </span>
                      @if (coach.isPlaying()) {
                        <span class="hud-live-pill" title="Playback is active">
                          <span class="live-dot"></span> LIVE STUDYING
                        </span>
                      } @else {
                        <span class="hud-paused-pill" title="Video is currently paused">
                          ⏸️ PAUSED ({{ coach.currentPauseDurationSeconds() }}s)
                        </span>
                      }
                    </div>

                    <!-- Live Habit Metrics -->
                    <div class="hud-metrics">
                      <span class="hud-metric-pill" title="Continuous watch streak without pause">
                        ⏱️ Continuous: <strong>{{ coach.formattedContinuousWatch() }}</strong>
                      </span>
                      <span class="hud-metric-pill" title="Total watch time in this session">
                        👁️ Total: <strong>{{ coach.formattedWatchTime() }}</strong>
                      </span>
                      <span class="hud-metric-pill" title="Total active pauses taken to digest concepts">
                        ⏸️ Pauses: <strong>{{ coach.pauseCount() }}</strong>
                        @if (coach.activePauseCount() > 0) {
                          <small class="notes-tag">({{ coach.activePauseCount() }} with notes)</small>
                        }
                      </span>
                      <span
                        class="hud-metric-pill score-pill"
                        [class.elite]="coach.activeLearningIndex() >= 80"
                        title="Active Learning Index calculated from watch continuity, pause pacing, and deliberate notes"
                      >
                        🌟 Retention Index: <strong>{{ coach.activeLearningIndex() }}/100</strong>
                      </span>
                    </div>
                  </div>

                  <div class="hud-right">
                    <!-- Away Guard Toggle -->
                    <button
                      id="vh-hud-away-guard-toggle"
                      type="button"
                      class="btn btn-xs hud-pill-btn"
                      [class.active]="coach.settings().autoPauseOnAway"
                      (click)="toggleAutoPauseAway()"
                      title="Toggle auto-pausing video when switching tabs or window blur"
                      [attr.aria-pressed]="coach.settings().autoPauseOnAway"
                    >
                      🛡️ Away Guard: {{ coach.settings().autoPauseOnAway ? 'ON' : 'OFF' }}
                    </button>

                    <!-- Camera Focus Guard Toggle -->
                    <button
                      id="vh-hud-camera-guard-toggle"
                      type="button"
                      class="btn btn-xs hud-pill-btn"
                      [class.active]="coach.cameraActive()"
                      (click)="coach.toggleCameraPresence()"
                      title="Toggle camera presence focus guard to pause if you step away from desk"
                      [attr.aria-pressed]="coach.cameraActive()"
                    >
                      {{ coach.cameraActive() ? '🟢 Camera Guard ON' : '📷 Camera Presence' }}
                    </button>

                    <!-- Quick Concept Quiz Checkpoint -->
                    <button
                      id="vh-hud-quiz-btn"
                      type="button"
                      class="btn btn-xs btn-hud-quiz"
                      (click)="openVideoQuiz()"
                      title="Take an optional 60-second quiz on this video's topic"
                      aria-label="Take quick concept quiz"
                    >
                      ⚡ Quick Quiz
                    </button>

                    <!-- Switch to Study Coach Tab -->
                    <button
                      id="vh-hud-coach-tab-btn"
                      type="button"
                      class="btn btn-xs btn-ghost btn-coach-link"
                      (click)="activeTab.set('coach')"
                      title="Open detailed study recommendations & habits feedback"
                    >
                      💡 Coaching Tips &amp; Feedback →
                    </button>
                  </div>
                </div>

                <!-- Alert Banner for Continuous Passive Watching or High Cognitive Load -->
                @if (coach.currentPattern() === 'PASSIVE_BINGE' || coach.currentPattern() === 'COGNITIVE_OVERLOAD') {
                  <div
                    class="coach-alert-banner"
                    [class.alert-warning]="coach.currentPattern() === 'PASSIVE_BINGE'"
                    [class.alert-info]="coach.currentPattern() === 'COGNITIVE_OVERLOAD'"
                    role="alert"
                    id="vh-coach-alert-banner"
                  >
                    <div class="banner-body">
                      <span class="banner-icon">{{ coach.patternLabel().icon }}</span>
                      <div class="banner-text">
                        <strong>{{ coach.coachingRecommendations()[0]?.title }}</strong>
                        <p>{{ coach.coachingRecommendations()[0]?.description }}</p>
                      </div>
                    </div>
                    <div class="banner-actions">
                      @if (coach.coachingRecommendations()[0]?.actionKey === 'take_pause') {
                        <button
                          id="vh-banner-pause-btn"
                          type="button"
                          class="btn btn-xs btn-accent"
                          (click)="coach.pauseVideo('USER_PAUSE')"
                        >
                          ⏸️ Take 60s Active Pause
                        </button>
                      } @else if (coach.coachingRecommendations()[0]?.actionKey === 'slow_speed') {
                        <button
                          id="vh-banner-speed-btn"
                          type="button"
                          class="btn btn-xs btn-primary"
                          (click)="coach.setPlaybackSpeed(0.75)"
                        >
                          🐢 0.75x Speed
                        </button>
                      }
                      <button
                        id="vh-banner-advice-btn"
                        type="button"
                        class="btn btn-xs btn-ghost"
                        (click)="activeTab.set('coach')"
                      >
                        View Study Advice →
                      </button>
                    </div>
                  </div>
                }

                <!-- Player Control Bar -->
                <div class="player-bar" id="vh-player-bar">
                  <div class="video-meta">
                    <h2 id="vh-current-video-title">{{ video.title }}</h2>
                    <div class="video-sub-meta">
                      <span class="channel-name">📺 {{ video.channelTitle || 'YouTube Creator' }}</span>
                      @if (video.duration) {
                        <span class="meta-pill">⏱️ {{ video.duration }}</span>
                      }
                      @if (video.viewCount) {
                        <span class="meta-pill">👁️ {{ video.viewCount }}</span>
                      }
                      @if (service.activePlaylist(); as pl) {
                        <span class="meta-pill playlist-tag">
                          📋 Playing from: <strong>{{ pl.name }}</strong> ({{ service.currentVideoIndexInPlaylist() + 1 }}/{{ pl.items.length }})
                        </span>
                      }
                    </div>
                  </div>

                  <div class="player-actions" id="vh-player-actions">
                    @if (service.activePlaylist()) {
                      <button
                        id="vh-player-prev-btn"
                        type="button"
                        class="btn btn-sm btn-ghost"
                        [disabled]="!service.hasPrevVideo()"
                        (click)="service.playPrevious()"
                        title="Play previous video in playlist"
                        aria-label="Previous video"
                      >
                        ⏮ Prev
                      </button>
                      <button
                        id="vh-player-next-btn"
                        type="button"
                        class="btn btn-sm btn-ghost"
                        [disabled]="!service.hasNextVideo()"
                        (click)="service.playNext()"
                        title="Play next video in playlist"
                        aria-label="Next video"
                      >
                        Next ⏭
                      </button>
                    }

                    <button
                      id="vh-player-autoplay-btn"
                      type="button"
                      class="btn btn-sm"
                      [class.btn-accent]="service.autoplayNext()"
                      [class.btn-ghost]="!service.autoplayNext()"
                      (click)="service.toggleAutoplayNext()"
                      title="Toggle automatic next video playback"
                      [attr.aria-pressed]="service.autoplayNext()"
                    >
                      Autoplay: {{ service.autoplayNext() ? 'ON' : 'OFF' }}
                    </button>

                    <button
                      id="vh-player-theater-btn"
                      type="button"
                      class="btn btn-sm btn-ghost"
                      (click)="service.toggleTheaterMode()"
                      title="Expand or collapse theater view"
                      [attr.aria-pressed]="service.theaterMode()"
                    >
                      {{ service.theaterMode() ? 'Exit Theater' : '⛶ Theater' }}
                    </button>

                    <button
                      id="vh-player-add-playlist-btn"
                      type="button"
                      class="btn btn-sm btn-primary"
                      (click)="openAddToPlaylistModal(video)"
                      aria-label="Add current video to playlist"
                    >
                      + Add to Playlist
                    </button>

                    <button
                      id="vh-player-search-another-btn"
                      type="button"
                      class="btn btn-sm btn-ghost"
                      (click)="backToResults()"
                      title="Search for another video"
                      aria-label="Search for another video"
                    >
                      🔍 Browse Results
                    </button>

                    <a
                      id="vh-player-youtube-ext-link"
                      [href]="'https://www.youtube.com/watch?v=' + video.videoId"
                      target="_blank"
                      rel="noopener"
                      class="btn btn-sm btn-ghost yt-external-btn"
                      title="Open video on YouTube"
                      aria-label="Open video on YouTube in new tab"
                    >
                      ↗ YouTube
                    </a>
                  </div>
                </div>

                <!-- Notes & Description Split Workspace -->
                <div class="workspace-tabs" id="vh-workspace-tabs">
                  <div class="tab-buttons" role="tablist" aria-label="Video Workspace Views">
                    <button
                      id="vh-tab-notes-btn"
                      type="button"
                      class="tab-btn"
                      [class.active]="activeTab() === 'notes'"
                      (click)="activeTab.set('notes')"
                      role="tab"
                      [attr.aria-selected]="activeTab() === 'notes'"
                      aria-controls="vh-notes-panel"
                    >
                      📝 Video Notes
                    </button>
                    <button
                      id="vh-tab-coach-btn"
                      type="button"
                      class="tab-btn"
                      [class.active]="activeTab() === 'coach'"
                      (click)="activeTab.set('coach')"
                      role="tab"
                      [attr.aria-selected]="activeTab() === 'coach'"
                      aria-controls="vh-coach-panel"
                    >
                      🧠 Study Habits &amp; Feedback
                      <span class="tab-score-chip" [class.high]="coach.activeLearningIndex() >= 80">
                        {{ coach.activeLearningIndex() }}%
                      </span>
                    </button>
                    @if (service.activePlaylist(); as pl) {
                      <button
                        id="vh-tab-queue-btn"
                        type="button"
                        class="tab-btn"
                        [class.active]="activeTab() === 'queue'"
                        (click)="activeTab.set('queue')"
                        role="tab"
                        [attr.aria-selected]="activeTab() === 'queue'"
                        aria-controls="vh-queue-panel"
                      >
                        📋 Playlist Queue ({{ pl.items.length }})
                      </button>
                    }
                  </div>

                  <!-- Notes Tab -->
                  @if (activeTab() === 'notes') {
                    <div id="vh-notes-panel" class="notes-panel" role="tabpanel" aria-labelledby="vh-tab-notes-btn">
                      <div class="notes-toolbar">
                        <span class="notes-hint">💡 Notes are auto-saved for this video</span>
                        <button
                          id="vh-btn-insert-timestamp"
                          type="button"
                          class="btn btn-xs btn-ghost"
                          (click)="insertTimestamp()"
                          aria-label="Insert current timestamp into notes"
                        >
                          ⏱️ Insert Timestamp
                        </button>
                      </div>
                      <textarea
                        id="vh-notes-textarea"
                        class="notes-textarea"
                        rows="4"
                        placeholder="Write key takeaways, algorithmic intuitions, edge cases, or code snippets here..."
                        [ngModel]="service.currentNotes()"
                        (ngModelChange)="onNotesChanged($event)"
                        aria-label="Personal notes for current video"
                      ></textarea>
                    </div>
                  }

                  <!-- Playlist Queue Tab (mobile or wide layout) -->
                  @if (activeTab() === 'queue' && service.activePlaylist(); as pl) {
                    <div id="vh-queue-panel" class="queue-panel" role="tabpanel" aria-labelledby="vh-tab-queue-btn">
                      <div class="queue-search-row">
                        <input
                          id="vh-queue-search-input"
                          type="text"
                          class="queue-search-input"
                          placeholder="Filter videos in this playlist..."
                          [(ngModel)]="queueFilterText"
                          aria-label="Filter videos in playlist queue"
                        />
                      </div>

                      <div class="queue-list" id="vh-queue-list">
                        @for (item of filteredQueue(); track item.videoId; let idx = $index) {
                          <div
                            id="vh-queue-row-{{ item.videoId }}"
                            class="queue-item"
                            [class.active]="item.videoId === video.videoId"
                            [class.watched]="item.watched"
                          >
                            <button
                              id="vh-queue-play-btn-{{ item.videoId }}"
                              type="button"
                              class="queue-play-btn"
                              (click)="selectAndWatchVideo(item, pl.id)"
                              aria-label="Play {{ item.title }}"
                            >
                              <span class="queue-idx">{{ idx + 1 }}</span>
                              <img [src]="item.thumbnailUrl" [alt]="item.title" class="queue-thumb" loading="lazy" />
                              <div class="queue-info">
                                <span class="queue-title">{{ item.title }}</span>
                                <span class="queue-sub">{{ item.channelTitle }} • {{ item.duration }}</span>
                              </div>
                            </button>

                            <div class="queue-actions">
                              <button
                                id="vh-queue-check-btn-{{ item.videoId }}"
                                type="button"
                                class="check-btn"
                                [class.checked]="item.watched"
                                (click)="service.toggleVideoWatched(pl.id, item.videoId)"
                                title="{{ item.watched ? 'Mark as unwatched' : 'Mark as watched' }}"
                                aria-label="{{ item.watched ? 'Mark unwatched' : 'Mark watched' }} {{ item.title }}"
                              >
                                {{ item.watched ? '✓' : '○' }}
                              </button>
                              <button
                                id="vh-queue-remove-btn-{{ item.videoId }}"
                                type="button"
                                class="remove-btn"
                                (click)="service.removeVideoFromPlaylist(pl.id, item.videoId)"
                                title="Remove from playlist"
                                aria-label="Remove {{ item.title }} from playlist"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        } @empty {
                          <p class="queue-empty">No videos match filter "{{ queueFilterText }}".</p>
                        }
                      </div>
                    </div>
                  }
                  <!-- Coach Tab Content -->
                  @if (activeTab() === 'coach') {
                    <div id="vh-coach-panel" class="coach-panel" role="tabpanel" aria-labelledby="vh-tab-coach-btn">
                      <!-- Header with Habit Overview -->
                      <div class="coach-panel-header">
                        <div class="coach-title-group">
                          <span class="coach-badge-large" [class]="coach.patternLabel().badgeClass">
                            {{ coach.patternLabel().icon }} {{ coach.patternLabel().title }}
                          </span>
                          <p class="coach-subtitle">{{ coach.patternLabel().subtitle }}</p>
                        </div>
                        <div class="coach-score-box">
                          <span class="score-label">Active Learning Index</span>
                          <span class="score-value">{{ coach.activeLearningIndex() }}<small>/100</small></span>
                        </div>
                      </div>

                      <!-- 4 Diagnostic Metric Cards -->
                      <div class="coach-metrics-grid">
                        <div class="coach-metric-card card">
                          <span class="m-icon">⏱️</span>
                          <div class="m-data">
                            <span class="m-val">{{ coach.formattedContinuousWatch() }}</span>
                            <span class="m-lbl">Continuous Streak</span>
                          </div>
                        </div>
                        <div class="coach-metric-card card">
                          <span class="m-icon">🏆</span>
                          <div class="m-data">
                            <span class="m-val">{{ formatSeconds(coach.maxContinuousStreakSeconds()) }}</span>
                            <span class="m-lbl">Longest Unbroken Streak</span>
                          </div>
                        </div>
                        <div class="coach-metric-card card">
                          <span class="m-icon">⏸️</span>
                          <div class="m-data">
                            <span class="m-val">{{ coach.pauseCount() }} <small>({{ coach.activePauseCount() }} with notes)</small></span>
                            <span class="m-lbl">Pauses Taken</span>
                          </div>
                        </div>
                        <div class="coach-metric-card card">
                          <span class="m-icon">👁️</span>
                          <div class="m-data">
                            <span class="m-val">{{ coach.formattedWatchTime() }} / {{ coach.formattedPauseTime() }}</span>
                            <span class="m-lbl">Watch vs Pause Time</span>
                          </div>
                        </div>
                      </div>

                      <!-- Active Pomodoro Rest Timer -->
                      <div class="pomodoro-card card" id="vh-pomodoro-card">
                        <div class="pomodoro-header">
                          <div>
                            <h4>⏱️ Focus Rest &amp; Eye Break Timer</h4>
                            <p class="pomodoro-desc">Structured breaks avoid mental fatigue and reinforce spaced cognitive consolidation.</p>
                          </div>
                          @if (coach.breakTimerActive()) {
                            <span class="break-active-badge">BREAK IN PROGRESS</span>
                          }
                        </div>

                        @if (coach.breakTimerActive()) {
                          <div class="pomodoro-active-view">
                            <div class="timer-countdown-display">{{ coach.formattedBreakTimer() }}</div>
                            <p class="break-tip">💡 Step away from the screen, blink, hydrate, and stretch.</p>
                            <button
                              id="vh-btn-cancel-pomodoro"
                              type="button"
                              class="btn btn-sm btn-ghost"
                              (click)="coach.cancelBreakTimer()"
                            >
                              Cancel Break &amp; Resume
                            </button>
                          </div>
                        } @else {
                          <div class="pomodoro-actions">
                            <button
                              id="vh-btn-start-pomodoro-5"
                              type="button"
                              class="btn btn-sm btn-ghost"
                              (click)="coach.startBreakTimer(300)"
                            >
                              ☕ 5-Min Screen Rest
                            </button>
                            <button
                              id="vh-btn-start-pomodoro-10"
                              type="button"
                              class="btn btn-sm btn-ghost"
                              (click)="coach.startBreakTimer(600)"
                            >
                              🚶 10-Min Walk Break
                            </button>
                          </div>
                        }
                      </div>

                      <!-- Personalized "How to Study to Improve" Recommendations Section -->
                      <div class="recommendations-section">
                        <div class="recs-header">
                          <h3>💡 How You Should Study This Topic to Improve</h3>
                          <p>Personalized pedagogy based on your continuous playback and pause behavior.</p>
                        </div>

                        <div class="recs-grid" id="vh-recs-grid">
                          @for (rec of coach.coachingRecommendations(); track rec.id) {
                            <div class="rec-card card" id="vh-rec-{{ rec.id }}">
                              <div class="rec-top-row">
                                <span class="rec-category-badge {{ rec.category }}">{{ rec.badge }}</span>
                                <span class="rec-pattern-tag">{{ coach.currentPattern() }}</span>
                              </div>
                              <h4 class="rec-title">{{ rec.title }}</h4>
                              <p class="rec-desc">{{ rec.description }}</p>

                              @if (rec.actionText && rec.actionKey) {
                                <div class="rec-footer">
                                  <button
                                    id="vh-rec-action-{{ rec.id }}"
                                    type="button"
                                    class="btn btn-xs btn-primary rec-action-btn"
                                    (click)="applyCoachAction(rec.actionKey)"
                                  >
                                    {{ rec.actionText }}
                                  </button>
                                </div>
                              }
                            </div>
                          }
                        </div>
                      </div>

                      <!-- Speed Adjustment Pacing Bar -->
                      <div class="speed-adjust-card card">
                        <div class="speed-header">
                          <h4>⚡ Playback Speed Pacing</h4>
                          <span>Current: <strong>{{ coach.currentPlaybackSpeed() }}x</strong></span>
                        </div>
                        <div class="speed-buttons-row">
                          @for (spd of [0.75, 1, 1.25, 1.5]; track spd) {
                            <button
                              type="button"
                              class="btn btn-xs"
                              [class.btn-accent]="coach.currentPlaybackSpeed() === spd"
                              [class.btn-ghost]="coach.currentPlaybackSpeed() !== spd"
                              (click)="coach.setPlaybackSpeed(spd)"
                            >
                              {{ spd }}x
                            </button>
                          }
                        </div>
                      </div>

                      <!-- Auto-Pause Away Guard & Privacy Settings -->
                      <div class="away-settings-card card" id="vh-away-settings-card">
                        <h4>🛡️ Auto-Pause &amp; Away Guard Settings</h4>
                        <p class="settings-sub">Customize when PeerDSA automatically pauses playback to protect your focus.</p>

                        <div class="settings-list">
                          <label class="setting-row">
                            <div class="setting-info">
                              <span class="setting-title">Auto-Pause on Tab Switch / Window Blur</span>
                              <small class="setting-hint">Automatically pauses video whenever you navigate away from this tab or minimize the browser.</small>
                            </div>
                            <input
                              id="vh-setting-tab-pause"
                              type="checkbox"
                              class="toggle-checkbox"
                              [checked]="coach.settings().autoPauseOnAway"
                              (change)="toggleAutoPauseAway()"
                            />
                          </label>

                          <label class="setting-row">
                            <div class="setting-info">
                              <span class="setting-title">Smart Camera Presence Focus Guard (Local AI)</span>
                              <small class="setting-hint">Pauses video if you step away from your desk. Analyzed 100% locally in browser memory — no video is sent to any server.</small>
                            </div>
                            <input
                              id="vh-setting-camera-presence"
                              type="checkbox"
                              class="toggle-checkbox"
                              [checked]="coach.settings().enableCameraPresence"
                              (change)="coach.toggleCameraPresence()"
                            />
                          </label>

                          <label class="setting-row">
                            <div class="setting-info">
                              <span class="setting-title">Audio Chime on Auto-Pause</span>
                              <small class="setting-hint">Plays a soft, subtle tone when the video is paused automatically.</small>
                            </div>
                            <input
                              id="vh-setting-sound-chime"
                              type="checkbox"
                              class="toggle-checkbox"
                              [checked]="coach.settings().soundAlertOnAutoPause"
                              (change)="toggleSoundChime()"
                            />
                          </label>

                          <label class="setting-row">
                            <div class="setting-info">
                              <span class="setting-title">Auto-Resume when Returning</span>
                              <small class="setting-hint">Automatically resume playback as soon as you refocus the window or return in front of the screen.</small>
                            </div>
                            <input
                              id="vh-setting-auto-resume"
                              type="checkbox"
                              class="toggle-checkbox"
                              [checked]="coach.settings().autoResumeOnReturn"
                              (change)="toggleAutoResume()"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Right / Secondary Column: Up Next or Playlist Queue (YouTube style) -->
            <aside class="watch-sidebar-col" id="vh-watch-sidebar" aria-label="Up Next and Queue">
              @if (service.activePlaylist(); as pl) {
                <!-- Active Playlist Sidebar -->
                <div class="sidebar-card card" id="vh-sidebar-playlist-card">
                  <div class="sidebar-header">
                    <div class="sidebar-title-row">
                      <span class="sidebar-tag">📋 Playlist Queue</span>
                      <span class="sidebar-badge">{{ service.currentVideoIndexInPlaylist() + 1 }} / {{ pl.items.length }}</span>
                    </div>
                    <h3 class="sidebar-pl-name">{{ pl.name }}</h3>
                  </div>

                  <div class="sidebar-scroll-list" id="vh-sidebar-queue-list">
                    @for (item of pl.items; track item.videoId; let sIdx = $index) {
                      <div
                        id="vh-sidebar-queue-item-{{ item.videoId }}"
                        class="sidebar-video-item"
                        [class.active]="item.videoId === video.videoId"
                        (click)="selectAndWatchVideo(item, pl.id)"
                        role="button"
                        tabindex="0"
                        (keydown.enter)="selectAndWatchVideo(item, pl.id)"
                      >
                        <div class="sidebar-thumb-wrap">
                          <img [src]="item.thumbnailUrl" [alt]="item.title" class="sidebar-thumb" loading="lazy" />
                          @if (item.duration) {
                            <span class="sidebar-duration">{{ item.duration }}</span>
                          }
                          @if (item.videoId === video.videoId) {
                            <div class="now-playing-badge">▶ Playing</div>
                          }
                        </div>
                        <div class="sidebar-info">
                          <h4 class="sidebar-video-title" title="{{ item.title }}">{{ item.title }}</h4>
                          <span class="sidebar-channel">{{ item.channelTitle }}</span>
                          @if (item.watched) {
                            <span class="sidebar-watched">✓ Watched</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <!-- Up Next from Search Results -->
                <div class="sidebar-card card" id="vh-sidebar-upnext-card">
                  <div class="sidebar-header">
                    <div class="sidebar-title-row">
                      <span class="sidebar-tag">📺 Up Next</span>
                      <span class="sidebar-badge">{{ upNextVideos().length }} videos</span>
                    </div>
                    <h3 class="sidebar-pl-name">Related from Search</h3>
                  </div>

                  <div class="sidebar-scroll-list" id="vh-sidebar-upnext-list">
                    @for (item of upNextVideos(); track item.videoId) {
                      <div
                        id="vh-sidebar-next-item-{{ item.videoId }}"
                        class="sidebar-video-item"
                        (click)="selectAndWatchVideo(item)"
                        role="button"
                        tabindex="0"
                        (keydown.enter)="selectAndWatchVideo(item)"
                        aria-label="Watch {{ item.title }}"
                      >
                        <div class="sidebar-thumb-wrap">
                          <img [src]="item.thumbnailUrl" [alt]="item.title" class="sidebar-thumb" loading="lazy" />
                          @if (item.duration) {
                            <span class="sidebar-duration">{{ item.duration }}</span>
                          }
                        </div>
                        <div class="sidebar-info">
                          <h4 class="sidebar-video-title" title="{{ item.title }}">{{ item.title }}</h4>
                          <span class="sidebar-channel">{{ item.channelTitle }}</span>
                          @if (item.viewCount) {
                            <span class="sidebar-views">{{ item.viewCount }}</span>
                          }
                        </div>
                      </div>
                    } @empty {
                      <p class="sidebar-empty">No additional related videos found.</p>
                    }
                  </div>
                </div>
              }
            </aside>
          </div>
        </section>
      }

      <!-- 3. SEARCH RESULTS & DISCOVERY VIEW (Clean YouTube Search Feed) -->
      @if (viewMode() === 'results') {
        <section id="vh-results-section" class="results-section" aria-label="Video Results">
          <div class="section-title-row">
            <div class="title-with-actions">
              <h2 id="vh-results-title">
                {{ searchTitle() }}
                @if (service.searchResults().length > 0) {
                  <span class="count-pill">({{ service.searchResults().length }})</span>
                }
              </h2>
              @if (searchQuery.trim() && service.searchResults().length > 0) {
                <button
                  id="vh-play-top-result-btn"
                  type="button"
                  class="btn btn-sm btn-accent play-top-btn"
                  (click)="playTopResult()"
                  title="Immediately watch the #1 top matching video"
                  aria-label="Play top matching search result"
                >
                  ▶ Play Top Result
                </button>
              }
            </div>

            <div class="section-actions">
              <!-- Layout Toggle: YouTube List vs Grid -->
              <div class="layout-toggle" role="group" aria-label="Search results layout" id="vh-layout-toggle-group">
                <button
                  id="vh-toggle-layout-list"
                  type="button"
                  class="toggle-btn"
                  [class.active]="resultsLayout() === 'list'"
                  (click)="resultsLayout.set('list')"
                  title="Horizontal YouTube List View"
                  aria-label="List view"
                >
                  ☰ List
                </button>
                <button
                  id="vh-toggle-layout-grid"
                  type="button"
                  class="toggle-btn"
                  [class.active]="resultsLayout() === 'grid'"
                  (click)="resultsLayout.set('grid')"
                  title="Grid View"
                  aria-label="Grid view"
                >
                  ⊞ Grid
                </button>
              </div>

              <button
                id="vh-results-new-playlist-btn"
                type="button"
                class="btn btn-sm btn-ghost"
                (click)="openCreatePlaylistModal()"
                aria-label="Create a new playlist"
              >
                + New Playlist
              </button>
            </div>
          </div>

          @if (service.isSearching()) {
            <div id="vh-loading-state" class="loading-state card">
              <app-spinner [size]="28" label="Searching YouTube" />
              <p>Searching YouTube for high-yield tutorials…</p>
            </div>
          } @else if (service.searchResults().length === 0) {
            <div id="vh-empty-state" class="empty-state card">
              <span class="empty-icon" aria-hidden="true">📺</span>
              <h3>No videos found</h3>
              <p>Try searching for specific DSA problems (e.g. "Two Sum Striver"), programming concepts, or paste a direct YouTube video link.</p>
              <button
                id="vh-empty-load-curated-btn"
                type="button"
                class="btn btn-sm btn-primary"
                (click)="service.loadCuratedVideos()"
                aria-label="Load curated recommendation videos"
              >
                Load Curated Recommendations
              </button>
            </div>
          } @else {
            <!-- YouTube Results Display (List or Grid) -->
            <div
              id="vh-video-results-container"
              [class.youtube-results-list]="resultsLayout() === 'list'"
              [class.video-grid]="resultsLayout() === 'grid'"
            >
              @for (item of service.searchResults(); track item.videoId; let rIdx = $index) {
                <article
                  id="vh-video-card-{{ item.videoId }}"
                  class="video-card card"
                  [class.list-card]="resultsLayout() === 'list'"
                  [class.playing]="service.currentVideo()?.videoId === item.videoId"
                >
                  <!-- Card Thumbnail (Click to Watch) -->
                  <div
                    id="vh-video-card-thumb-{{ item.videoId }}"
                    class="card-thumb-wrap"
                    (click)="selectAndWatchVideo(item)"
                    role="button"
                    tabindex="0"
                    (keydown.enter)="selectAndWatchVideo(item)"
                    (keydown.space)="selectAndWatchVideo(item)"
                    aria-label="Watch {{ item.title }}"
                  >
                    <img [src]="item.thumbnailUrl" [alt]="item.title" class="card-thumb" loading="lazy" />
                    @if (item.duration) {
                      <span class="duration-badge">{{ item.duration }}</span>
                    }
                    <div class="play-overlay">
                      <span class="play-icon" aria-hidden="true">▶</span>
                      <span class="play-text">Watch</span>
                    </div>
                  </div>

                  <!-- Card Body -->
                  <div class="card-body">
                    <h3
                      id="vh-video-card-title-{{ item.videoId }}"
                      class="card-title"
                      (click)="selectAndWatchVideo(item)"
                      title="{{ item.title }}"
                      role="button"
                      tabindex="0"
                      (keydown.enter)="selectAndWatchVideo(item)"
                      (keydown.space)="selectAndWatchVideo(item)"
                    >
                      {{ item.title }}
                    </h3>

                    <div class="card-meta">
                      <span class="card-channel">📺 {{ item.channelTitle }}</span>
                      @if (item.viewCount) {
                        <span class="card-views">• {{ item.viewCount }}</span>
                      }
                      @if (item.publishedTime) {
                        <span class="card-published">• {{ item.publishedTime }}</span>
                      }
                    </div>

                    @if (resultsLayout() === 'list') {
                      <p class="card-snippet">
                        High-yield tutorial on {{ item.title }}. Watch with synchronized DSA study notes or add to your personalized study queue.
                      </p>
                    }

                    <div class="card-footer">
                      <button
                        id="vh-video-card-play-btn-{{ item.videoId }}"
                        type="button"
                        class="btn btn-xs btn-primary btn-play"
                        (click)="selectAndWatchVideo(item)"
                        aria-label="Watch {{ item.title }}"
                      >
                        ▶ Watch Now
                      </button>
                      <button
                        id="vh-video-card-add-btn-{{ item.videoId }}"
                        type="button"
                        class="btn btn-xs btn-ghost btn-add"
                        (click)="openAddToPlaylistModal(item)"
                        aria-label="Add {{ item.title }} to playlist"
                      >
                        + Save to Playlist
                      </button>
                      <a
                        id="vh-video-card-ext-link-{{ item.videoId }}"
                        [href]="'https://www.youtube.com/watch?v=' + item.videoId"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-xs btn-ghost btn-yt-ext"
                        title="View on YouTube"
                        aria-label="Open on YouTube in new tab"
                      >
                        ↗ YouTube
                      </a>
                    </div>
                  </div>
                </article>
              }
            </div>
          }
        </section>

        <!-- 4. PLAYLISTS MANAGER SECTION -->
        <section id="vh-playlists-section" class="playlists-section" aria-label="My Video Playlists">
          <div class="section-title-row">
            <div>
              <h2 id="vh-playlists-title">My Curated Playlists</h2>
              <p class="section-sub">Organize your DSA journey into themed playlists.</p>
            </div>
            <div class="playlist-header-actions">
              <input
                id="vh-playlist-filter-input"
                type="text"
                class="playlist-filter-input"
                placeholder="Filter playlists..."
                [(ngModel)]="playlistFilterText"
                aria-label="Filter playlists by name or description"
              />
              <button
                id="vh-btn-create-playlist-header"
                type="button"
                class="btn btn-sm btn-primary"
                (click)="openCreatePlaylistModal()"
                aria-label="Create playlist"
              >
                + Create Playlist
              </button>
            </div>
          </div>

          <div class="playlists-grid" id="vh-playlists-grid">
            @for (pl of filteredPlaylists(); track pl.id) {
              <article id="vh-playlist-card-{{ pl.id }}" class="playlist-card card">
                <div class="pl-header">
                  <div class="pl-header-title">
                    <h3 id="vh-pl-name-{{ pl.id }}">{{ pl.name }}</h3>
                    @if (pl.description) {
                      <p class="pl-desc">{{ pl.description }}</p>
                    }
                  </div>
                  @if (service.playlists().length > 1) {
                    <button
                      id="vh-pl-delete-btn-{{ pl.id }}"
                      type="button"
                      class="btn-delete-pl"
                      (click)="confirmDeletePlaylist(pl)"
                      title="Delete playlist"
                      aria-label="Delete playlist {{ pl.name }}"
                    >
                      ✕
                    </button>
                  }
                </div>

                <div class="pl-preview-row">
                  @if (pl.items.length > 0) {
                    @for (thumbItem of pl.items.slice(0, 3); track thumbItem.videoId; let tIdx = $index) {
                      <div class="pl-thumb-mini" (click)="selectAndWatchVideo(thumbItem, pl.id)">
                        <img [src]="thumbItem.thumbnailUrl" [alt]="thumbItem.title" loading="lazy" />
                      </div>
                    }
                  } @else {
                    <span class="pl-empty-text">Empty playlist. Add videos from search above!</span>
                  }
                </div>

                <div class="pl-footer">
                  <span class="pl-count">{{ pl.items.length }} video{{ pl.items.length !== 1 ? 's' : '' }}</span>
                  <button
                    id="vh-pl-playall-btn-{{ pl.id }}"
                    type="button"
                    class="btn btn-xs btn-primary"
                    [disabled]="pl.items.length === 0"
                    (click)="playPlaylist(pl)"
                    aria-label="Play all videos in playlist {{ pl.name }}"
                  >
                    ▶ Play All
                  </button>
                </div>
              </article>
            } @empty {
              <div class="empty-state card">
                <p>No playlists found.</p>
              </div>
            }
          </div>
        </section>
      }

      <!-- 5. FLOATING YOUTUBE MINIPLAYER (When browsing search results while video is active) -->
      @if (viewMode() === 'results' && service.currentVideo(); as minivideo) {
        @if (!dismissMiniplayer()) {
          <aside id="vh-miniplayer" class="miniplayer-card" aria-label="YouTube Miniplayer">
            <div class="miniplayer-thumb" (click)="resumeWatching(minivideo)" role="button" tabindex="0" (keydown.enter)="resumeWatching(minivideo)">
              <img [src]="minivideo.thumbnailUrl" [alt]="minivideo.title" />
              <div class="miniplayer-play-overlay">▶</div>
            </div>
            <div class="miniplayer-info" (click)="resumeWatching(minivideo)" role="button" tabindex="0" (keydown.enter)="resumeWatching(minivideo)">
              <span class="miniplayer-title" title="{{ minivideo.title }}">{{ minivideo.title }}</span>
              <span class="miniplayer-channel">{{ minivideo.channelTitle }}</span>
            </div>
            <div class="miniplayer-actions">
              <button
                id="vh-miniplayer-expand-btn"
                type="button"
                class="btn-mini-action"
                (click)="resumeWatching(minivideo)"
                title="Expand to Watch Player"
                aria-label="Expand to Watch Player"
              >
                ⛶
              </button>
              <button
                id="vh-miniplayer-close-btn"
                type="button"
                class="btn-mini-action"
                (click)="dismissMiniplayer.set(true)"
                title="Dismiss miniplayer"
                aria-label="Dismiss miniplayer"
              >
                ✕
              </button>
            </div>
          </aside>
        }
      }

      <!-- Add To Playlist Modal Dialog -->
      @if (playlistModalVideo(); as v) {
        <div id="vh-modal-add-playlist-backdrop" class="modal-backdrop" (click)="closePlaylistModal()">
          <div
            id="vh-modal-add-playlist-card"
            class="modal-card card"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vh-modal-add-title"
          >
            <div class="modal-header">
              <h3 id="vh-modal-add-title">Add to Playlist</h3>
              <button
                id="vh-modal-add-close-btn"
                type="button"
                class="btn-close"
                (click)="closePlaylistModal()"
                aria-label="Close add to playlist dialog"
              >
                ✕
              </button>
            </div>

            <div class="modal-body">
              <div class="modal-video-preview">
                <img [src]="v.thumbnailUrl" [alt]="v.title" class="preview-thumb" />
                <div class="preview-text">
                  <strong>{{ v.title }}</strong>
                  <small>{{ v.channelTitle }}</small>
                </div>
              </div>

              <div class="playlists-selector">
                <label class="selector-label" for="vh-modal-selector-list">Choose playlist:</label>
                <div class="selector-list" id="vh-modal-selector-list">
                  @for (pl of service.playlists(); track pl.id) {
                    <div class="selector-item">
                      <div class="selector-item-text">
                        <span>{{ pl.name }}</span>
                        <small>({{ pl.items.length }} videos)</small>
                      </div>
                      @if (service.isVideoInPlaylist(pl.id, v.videoId)) {
                        <span class="already-added-badge">✓ Added</span>
                      } @else {
                        <button
                          id="vh-modal-add-target-btn-{{ pl.id }}"
                          type="button"
                          class="btn btn-xs btn-primary"
                          (click)="addVideoToTargetPlaylist(pl.id, v)"
                          aria-label="Add to {{ pl.name }}"
                        >
                          Add
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- Quick create new playlist right inside modal -->
              <div class="quick-create-row">
                <input
                  id="vh-modal-quick-name-input"
                  type="text"
                  placeholder="New playlist name..."
                  class="input-quick-pl"
                  [(ngModel)]="newPlaylistNameInModal"
                  aria-label="New playlist name"
                />
                <button
                  id="vh-modal-quick-create-btn"
                  type="button"
                  class="btn btn-sm btn-ghost"
                  [disabled]="!newPlaylistNameInModal.trim()"
                  (click)="quickCreateAndAdd(v)"
                  aria-label="Create playlist and add video"
                >
                  + Create &amp; Add
                </button>
              </div>
            </div>

            <div class="modal-footer">
              <button
                id="vh-modal-add-done-btn"
                type="button"
                class="btn btn-sm btn-ghost"
                (click)="closePlaylistModal()"
                aria-label="Done adding to playlist"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Create Playlist Modal Dialog -->
      @if (showCreatePlaylistModal()) {
        <div id="vh-modal-create-playlist-backdrop" class="modal-backdrop" (click)="showCreatePlaylistModal.set(false)">
          <div
            id="vh-modal-create-playlist-card"
            class="modal-card card"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vh-modal-create-title"
          >
            <div class="modal-header">
              <h3 id="vh-modal-create-title">Create New Playlist</h3>
              <button
                id="vh-modal-create-close-btn"
                type="button"
                class="btn-close"
                (click)="showCreatePlaylistModal.set(false)"
                aria-label="Close create playlist dialog"
              >
                ✕
              </button>
            </div>

            <div class="modal-body form-body">
              <label class="form-label" for="vh-modal-create-name-input">
                <span>Playlist Name *</span>
                <input
                  id="vh-modal-create-name-input"
                  type="text"
                  class="form-input"
                  placeholder="e.g. Dynamic Programming Masterclass"
                  [(ngModel)]="createPlaylistForm.name"
                  required
                  aria-required="true"
                />
              </label>

              <label class="form-label" for="vh-modal-create-desc-input">
                <span>Description (Optional)</span>
                <textarea
                  id="vh-modal-create-desc-input"
                  class="form-input"
                  rows="2"
                  placeholder="e.g. 2D grid DP, memoization patterns, and interval DP problems."
                  [(ngModel)]="createPlaylistForm.description"
                ></textarea>
              </label>
            </div>

            <div class="modal-footer">
              <button
                id="vh-modal-create-cancel-btn"
                type="button"
                class="btn btn-sm btn-ghost"
                (click)="showCreatePlaylistModal.set(false)"
                aria-label="Cancel playlist creation"
              >
                Cancel
              </button>
              <button
                id="vh-modal-create-submit-btn"
                type="button"
                class="btn btn-sm btn-primary"
                [disabled]="!createPlaylistForm.name.trim()"
                (click)="submitCreatePlaylist()"
                aria-label="Confirm create playlist"
              >
                Create Playlist
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Floating Coach Notification Toast -->
      @if (coach.activeToast(); as toast) {
        <aside id="vh-coach-toast" class="coach-toast {{ toast.type }}" role="status">
          <span class="toast-icon">{{ toast.icon }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <button type="button" class="toast-dismiss" (click)="coach.dismissToast()" aria-label="Dismiss notification">✕</button>
        </aside>
      }

      <!-- Optional Topic Concept Quiz Modal & Prompt -->
      <app-topic-quiz-modal (saveTakeaway)="handleQuizTakeaway($event)"></app-topic-quiz-modal>
    </main>
  `,
  styleUrl: './video-hub-page.scss',
})
export class VideoHubPage implements AfterViewInit, OnDestroy {
  protected readonly service = inject(VideoHubService);
  protected readonly auth = inject(AuthStore);
  protected readonly nav = inject(NavigationHistoryService);
  protected readonly coach = inject(VideoStudyCoachService);
  protected readonly quiz = inject(TopicQuizService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('embeddedPlayerFrame') private embeddedPlayerRef?: ElementRef<HTMLIFrameElement>;

  // View state: 'results' (Search / Browse feed) vs 'watch' (YouTube theater player)
  protected viewMode = signal<'results' | 'watch'>('results');
  protected resultsLayout = signal<'list' | 'grid'>('list');
  protected dismissMiniplayer = signal<boolean>(false);

  protected searchQuery = '';
  protected queueFilterText = '';
  protected playlistFilterText = '';
  protected activeTab = signal<'notes' | 'queue' | 'coach'>('notes');
  protected selectedChip = signal<string>('All');
  protected playlistModalVideo = signal<VideoSearchResult | PlaylistItem | null>(null);
  protected showCreatePlaylistModal = signal<boolean>(false);
  protected newPlaylistNameInModal = '';
  protected createPlaylistForm = { name: '', description: '' };

  protected readonly detectedDirectVideoId = computed<string | null>(() => {
    return this.service.extractYouTubeId(this.searchQuery);
  });

  protected readonly upNextVideos = computed(() => {
    const cur = this.service.currentVideo();
    const results = this.service.searchResults();
    if (!cur) return results;
    return results.filter((v) => v.videoId !== cur.videoId);
  });

  protected readonly filteredQueue = computed(() => {
    const queue = this.service.playlistQueue();
    const filter = this.queueFilterText.trim().toLowerCase();
    if (!filter) return queue;
    return queue.filter(
      (item) =>
        item.title.toLowerCase().includes(filter) ||
        item.channelTitle.toLowerCase().includes(filter) ||
        (item.notes && item.notes.toLowerCase().includes(filter)),
    );
  });

  protected readonly filteredPlaylists = computed(() => {
    const list = this.service.playlists();
    const filter = this.playlistFilterText.trim().toLowerCase();
    if (!filter) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(filter) ||
        (p.description && p.description.toLowerCase().includes(filter)),
    );
  });

  protected readonly searchTitle = computed(() => {
    if (this.selectedChip() !== 'All') {
      return this.selectedChip();
    }
    return this.searchQuery.trim() ? `Search Results for "${this.searchQuery.trim()}"` : 'Recommended Video Tutorials';
  });

  protected readonly sanitizedVideoUrl = computed<SafeResourceUrl>(() => {
    const v = this.service.currentVideo();
    if (!v || !v.videoId) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
    }
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}` : '';
    const embedUrl = `https://www.youtube.com/embed/${v.videoId}?autoplay=1&enablejsapi=1&rel=0${originParam}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  });

  protected readonly quickChips = [
    { label: 'All', query: '' },
    { label: '🔥 Striver A2Z', query: 'striver dsa' },
    { label: '🧮 Two Pointer & Sliding Window', query: 'sliding window two pointer dsa' },
    { label: '🌲 Binary Trees & Graphs', query: 'striver binary tree graph algorithm' },
    { label: '⚡ Dynamic Programming', query: 'striver dynamic programming dp' },
    { label: '🏗️ System Design', query: 'system design interview bytebytego' },
    { label: '☕ Java & Spring', query: 'java spring boot microservices course' },
    { label: '🐍 NeetCode 150', query: 'neetcode 150 dsa' },
  ];

  constructor() {
    this.route.queryParams.subscribe((params) => {
      const v = params['v'];
      const q = params['q'];
      if (v) {
        this.service.selectVideoById(v);
        this.viewMode.set('watch');
        this.dismissMiniplayer.set(false);
      } else {
        if (this.viewMode() === 'watch') {
          this.viewMode.set('results');
        }
        if (q) {
          this.searchQuery = q;
          this.service.searchVideos(q);
        } else if (this.service.searchResults().length === 0) {
          this.service.loadCuratedVideos();
        }
      }
    });
  }

  protected handleHeaderBack(): void {
    if (this.viewMode() === 'watch') {
      this.backToResults();
    } else {
      this.nav.back('/dashboard');
    }
  }

  protected onSearchSubmit(e: Event) {
    e.preventDefault();
    if (!this.searchQuery.trim()) return;
    this.selectedChip.set('All');
    this.viewMode.set('results');
    this.service.searchVideos(this.searchQuery);
  }

  protected clearSearch() {
    this.searchQuery = '';
    this.selectedChip.set('All');
    this.viewMode.set('results');
    this.service.loadCuratedVideos();
  }

  protected applyChip(chip: { label: string; query: string }) {
    this.selectedChip.set(chip.label);
    this.viewMode.set('results');
    if (!chip.query) {
      this.searchQuery = '';
      this.service.loadCuratedVideos();
    } else {
      this.searchQuery = chip.query;
      this.service.searchVideos(chip.query);
    }
  }

  protected playDirectVideo(directId: string) {
    this.service.selectVideoById(directId);
    this.viewMode.set('watch');
    this.dismissMiniplayer.set(false);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: directId },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected selectAndWatchVideo(video: VideoSearchResult | PlaylistItem, playlistId: number | string | null = null) {
    this.service.selectVideo(video, playlistId);
    this.coach.setVideoMetadata(video.videoId, video.title, (video as any).category || 'DSA');
    this.viewMode.set('watch');
    this.dismissMiniplayer.set(false);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: video.videoId },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected playTopResult() {
    const top = this.service.playTopSearchResult();
    if (top) {
      this.viewMode.set('watch');
      this.dismissMiniplayer.set(false);
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { v: top.videoId },
        queryParamsHandling: 'merge',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected backToResults() {
    this.viewMode.set('results');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: null },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected resumeWatching(video: VideoSearchResult | PlaylistItem) {
    this.service.selectVideo(video);
    this.viewMode.set('watch');
    this.dismissMiniplayer.set(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected playPlaylist(pl: Playlist) {
    this.service.playEntirePlaylist(pl);
    this.viewMode.set('watch');
    this.activeTab.set('queue');
    this.dismissMiniplayer.set(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected focusSearchInput() {
    const el = this.searchInputRef?.nativeElement;
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  protected insertTimestamp() {
    const existing = this.service.currentNotes();
    const timestampTag = `\n⏱️ [Note at ${new Date().toLocaleTimeString()}]: `;
    this.service.updateCurrentVideoNotes(existing ? existing + timestampTag : timestampTag.trim());
  }

  protected openAddToPlaylistModal(video: VideoSearchResult | PlaylistItem) {
    this.playlistModalVideo.set(video);
    this.newPlaylistNameInModal = '';
  }

  protected closePlaylistModal() {
    this.playlistModalVideo.set(null);
  }

  protected addVideoToTargetPlaylist(playlistId: number | string, video: VideoSearchResult | PlaylistItem) {
    this.service.addVideoToPlaylist(playlistId, video);
  }

  protected quickCreateAndAdd(video: VideoSearchResult | PlaylistItem) {
    if (!this.newPlaylistNameInModal.trim()) return;
    const pl = this.service.createPlaylist(this.newPlaylistNameInModal.trim());
    this.service.addVideoToPlaylist(pl.id, video);
    this.newPlaylistNameInModal = '';
  }

  protected openCreatePlaylistModal() {
    this.createPlaylistForm = { name: '', description: '' };
    this.showCreatePlaylistModal.set(true);
  }

  protected submitCreatePlaylist() {
    if (!this.createPlaylistForm.name.trim()) return;
    this.service.createPlaylist(this.createPlaylistForm.name.trim(), this.createPlaylistForm.description.trim());
    this.showCreatePlaylistModal.set(false);
  }

  ngAfterViewInit(): void {
    this.attachPlayerToCoach();
  }

  ngOnDestroy(): void {
    this.coach.detachPlayer();
  }

  protected onIframeLoad(): void {
    this.attachPlayerToCoach();
  }

  private attachPlayerToCoach(): void {
    if (this.embeddedPlayerRef?.nativeElement) {
      const v = this.service.currentVideo();
      this.coach.attachPlayer(
        this.embeddedPlayerRef.nativeElement,
        v?.videoId || '',
        v?.title || '',
        (v as any)?.category || 'DSA'
      );
    }
  }

  protected openVideoQuiz(): void {
    const current = this.service.currentVideo();
    const title = current ? current.title : 'Data Structures & Algorithms';
    const category = (current as any)?.category || 'DSA';
    this.coach.pauseVideo('USER_PAUSE');
    this.quiz.openManualQuiz(category, title, 'video');
  }

  protected handleQuizTakeaway(takeaway: string): void {
    const current = this.service.currentNotes();
    const updated = current ? current + takeaway : takeaway.trim();
    this.service.updateCurrentVideoNotes(updated);
    this.coach.showToast('Quiz checkpoint takeaway saved to video notes!', 'success', '📝');
  }

  @HostListener('document:keydown', ['$event'])
  protected handleGlobalKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

    if (e.code === 'Space' && this.coach.isAway()) {
      e.preventDefault();
      this.coach.resumeFromAway();
    }
  }

  protected onNotesChanged(val: string): void {
    this.service.updateCurrentVideoNotes(val);
    this.coach.notifyNoteRecorded();
  }

  protected openNotesFromAway(): void {
    this.activeTab.set('notes');
  }

  protected toggleAutoPauseAway(): void {
    this.coach.updateSettings({
      autoPauseOnAway: !this.coach.settings().autoPauseOnAway,
    });
  }

  protected toggleSoundChime(): void {
    this.coach.updateSettings({
      soundAlertOnAutoPause: !this.coach.settings().soundAlertOnAutoPause,
    });
  }

  protected toggleAutoResume(): void {
    this.coach.updateSettings({
      autoResumeOnReturn: !this.coach.settings().autoResumeOnReturn,
    });
  }

  protected formatSeconds(sec: number): string {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  protected applyCoachAction(actionKey: string): void {
    switch (actionKey) {
      case 'take_pause':
        this.coach.pauseVideo('USER_PAUSE');
        break;
      case 'slow_speed':
        this.coach.setPlaybackSpeed(0.75);
        break;
      case 'insert_feynman': {
        const cur = this.service.currentNotes();
        const template = `\n💡 [Feynman Technique Active Recall]:\n- Invariant / Why this approach works: \n- Why brute force failed: \n- Time & Space complexity: \n`;
        this.service.updateCurrentVideoNotes(cur ? cur + template : template.trim());
        this.activeTab.set('notes');
        this.coach.notifyNoteRecorded();
        break;
      }
      case 'insert_edge_cases': {
        const cur = this.service.currentNotes();
        const checklist = `\n✅ [Edge Cases Audit]:\n- [ ] Empty input / null\n- [ ] Single element\n- [ ] Duplicates / collisions\n- [ ] Negative integers / bounds\n- [ ] Odd vs even length\n`;
        this.service.updateCurrentVideoNotes(cur ? cur + checklist : checklist.trim());
        this.activeTab.set('notes');
        this.coach.notifyNoteRecorded();
        break;
      }
      case 'start_pomodoro':
        this.coach.startBreakTimer(300);
        break;
      case 'open_notes':
        this.activeTab.set('notes');
        break;
    }
  }

  protected confirmDeletePlaylist(pl: Playlist) {
    if (confirm(`Are you sure you want to delete playlist "${pl.name}"?`)) {
      this.service.deletePlaylist(pl.id);
    }
  }
}

