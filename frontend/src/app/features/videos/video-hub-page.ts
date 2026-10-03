import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { VideoHubService } from '../../core/services/video-hub.service';
import { Playlist, PlaylistItem, VideoSearchResult } from '../../core/models/video.models';
import { Spinner } from '../../shared/spinner';

@Component({
  selector: 'app-video-hub-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Spinner],
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
            <span class="search-title-label">🔍 YouTube Video Search &amp; Embed</span>
            <span class="search-badge">Live YouTube API + oEmbed</span>
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
                ▶ Play Video Now
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

      <!-- 2. ACTIVE EMBEDDED PLAYER & INTERACTIVE NOTES -->
      @if (service.currentVideo(); as video) {
        <section id="vh-player-section" class="player-section card" aria-label="Embedded Video Player">
          <div class="player-container">
            <!-- 16:9 Responsive Embedded Video Player -->
            <div class="video-frame-wrapper" id="vh-video-frame-wrapper">
              <iframe
                id="vh-embedded-player-frame"
                [src]="sanitizedVideoUrl()"
                title="YouTube video player — {{ video.title }}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerpolicy="strict-origin-when-cross-origin"
                allowfullscreen
                class="video-iframe"
              ></iframe>
            </div>

            <!-- Player Control Bar -->
            <div class="player-bar" id="vh-player-bar">
              <div class="video-meta">
                <h2 id="vh-current-video-title">{{ video.title }}</h2>
                <div class="video-sub-meta">
                  <span class="channel-name">📺 {{ video.channelTitle || 'YouTube Creator' }}</span>
                  @if (video.duration) {
                    <span class="meta-pill">⏱️ {{ video.duration }}</span>
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
                  (click)="focusSearchInput()"
                  title="Search for another video"
                  aria-label="Search for another video"
                >
                  🔍 Search Another
                </button>

                <a
                  id="vh-player-youtube-ext-link"
                  [href]="'https://www.youtube.com/watch?v=' + video.videoId"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-sm btn-ghost"
                  title="Open video on YouTube"
                  aria-label="Open video on YouTube in new tab"
                >
                  ↗ YouTube
                </a>
              </div>
            </div>

            <!-- Notes & Playlist Queue Split Workspace -->
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
                    (ngModelChange)="service.updateCurrentVideoNotes($event)"
                    aria-label="Personal notes for current video"
                  ></textarea>
                </div>
              }

              <!-- Playlist Queue Tab -->
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
                          (click)="service.selectVideo(item, pl.id)"
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
            </div>
          </div>
        </section>
      }

      <!-- 3. SEARCH RESULTS GRID -->
      <section id="vh-results-section" class="results-section" aria-label="Video Results">
        <div class="section-title-row">
          <h2 id="vh-results-title">
            {{ searchTitle() }}
            @if (service.searchResults().length > 0) {
              <span class="count-pill">({{ service.searchResults().length }})</span>
            }
          </h2>
          <div class="section-actions">
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
          <div id="vh-video-grid" class="video-grid">
            @for (item of service.searchResults(); track item.videoId) {
              <article
                id="vh-video-card-{{ item.videoId }}"
                class="video-card card"
                [class.playing]="service.currentVideo()?.videoId === item.videoId"
              >
                <div
                  id="vh-video-card-thumb-{{ item.videoId }}"
                  class="card-thumb-wrap"
                  (click)="playVideo(item)"
                  role="button"
                  tabindex="0"
                  (keydown.enter)="playVideo(item)"
                  (keydown.space)="playVideo(item)"
                  aria-label="Play {{ item.title }}"
                >
                  <img [src]="item.thumbnailUrl" [alt]="item.title" class="card-thumb" loading="lazy" />
                  @if (item.duration) {
                    <span class="duration-badge">{{ item.duration }}</span>
                  }
                  <div class="play-overlay">
                    <span class="play-icon" aria-hidden="true">▶</span>
                  </div>
                </div>

                <div class="card-body">
                  <h3
                    id="vh-video-card-title-{{ item.videoId }}"
                    class="card-title"
                    (click)="playVideo(item)"
                    title="{{ item.title }}"
                    role="button"
                    tabindex="0"
                    (keydown.enter)="playVideo(item)"
                    (keydown.space)="playVideo(item)"
                  >
                    {{ item.title }}
                  </h3>
                  <div class="card-meta">
                    <span class="card-channel">{{ item.channelTitle }}</span>
                    @if (item.viewCount) {
                      <span class="card-views">{{ item.viewCount }}</span>
                    }
                  </div>
                </div>

                <div class="card-footer">
                  <button
                    id="vh-video-card-play-btn-{{ item.videoId }}"
                    type="button"
                    class="btn btn-xs btn-primary btn-play"
                    (click)="playVideo(item)"
                    aria-label="Play {{ item.title }}"
                  >
                    ▶ Play
                  </button>
                  <button
                    id="vh-video-card-add-btn-{{ item.videoId }}"
                    type="button"
                    class="btn btn-xs btn-ghost btn-add"
                    (click)="openAddToPlaylistModal(item)"
                    title="Add to a playlist"
                    aria-label="Add {{ item.title }} to a playlist"
                  >
                    + Playlist
                  </button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <!-- 4. MY PLAYLISTS MANAGEMENT SECTION -->
      <section id="vh-playlists-section" class="playlists-section" aria-label="My Curated Playlists">
        <div class="section-title-row">
          <div>
            <h2 id="vh-my-playlists-title">My Playlists</h2>
            <p class="section-sub">Organize your learning into focused study queues.</p>
          </div>
          <div class="section-actions">
            <input
              id="vh-playlists-filter-input"
              type="text"
              class="playlist-filter-input"
              placeholder="Filter playlists..."
              [(ngModel)]="playlistFilterText"
              aria-label="Filter playlists by name or description"
            />
            <button
              id="vh-playlists-create-btn"
              type="button"
              class="btn btn-sm btn-accent"
              (click)="openCreatePlaylistModal()"
              aria-label="Create a new custom playlist"
            >
              + Create Playlist
            </button>
          </div>
        </div>

        <div id="vh-playlists-grid" class="playlists-grid">
          @for (pl of filteredPlaylists(); track pl.id) {
            <article id="vh-playlist-card-{{ pl.id }}" class="playlist-card card">
              <div class="pl-header">
                <div class="pl-info">
                  <h3 id="vh-pl-name-{{ pl.id }}">{{ pl.name }}</h3>
                  <p>{{ pl.description || 'Personal study playlist' }}</p>
                </div>
                <button
                  id="vh-pl-del-btn-{{ pl.id }}"
                  type="button"
                  class="btn-delete-pl"
                  (click)="confirmDeletePlaylist(pl)"
                  title="Delete playlist"
                  aria-label="Delete playlist {{ pl.name }}"
                >
                  ✕
                </button>
              </div>

              <!-- Playlist Video Preview Mini Strip -->
              <div class="pl-preview">
                @if (pl.items.length > 0) {
                  <div class="preview-thumbs">
                    @for (v of pl.items.slice(0, 3); track v.videoId) {
                      <img [src]="v.thumbnailUrl" [alt]="v.title" class="mini-thumb" loading="lazy" />
                    }
                  </div>
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
    </main>
  `,
  styleUrl: './video-hub-page.scss',
})
export class VideoHubPage {
  protected readonly service = inject(VideoHubService);
  protected readonly auth = inject(AuthStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  protected searchQuery = '';
  protected queueFilterText = '';
  protected playlistFilterText = '';
  protected activeTab = signal<'notes' | 'queue'>('notes');
  protected selectedChip = signal<string>('All');
  protected playlistModalVideo = signal<VideoSearchResult | PlaylistItem | null>(null);
  protected showCreatePlaylistModal = signal<boolean>(false);
  protected newPlaylistNameInModal = '';
  protected createPlaylistForm = { name: '', description: '' };

  protected readonly detectedDirectVideoId = computed<string | null>(() => {
    return this.service.extractYouTubeId(this.searchQuery);
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
    const embedUrl = `https://www.youtube.com/embed/${v.videoId}?autoplay=1&enablejsapi=1&rel=0`;
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
      } else if (q) {
        this.searchQuery = q;
        this.service.searchVideos(q);
      } else if (this.service.searchResults().length === 0) {
        this.service.loadCuratedVideos();
      }
    });
  }

  protected onSearchSubmit(e: Event) {
    e.preventDefault();
    this.selectedChip.set('All');
    this.service.searchVideos(this.searchQuery);
  }

  protected clearSearch() {
    this.searchQuery = '';
    this.selectedChip.set('All');
    this.service.loadCuratedVideos();
  }

  protected applyChip(chip: { label: string; query: string }) {
    this.selectedChip.set(chip.label);
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
    document.querySelector('.player-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected playVideo(video: VideoSearchResult | PlaylistItem) {
    this.service.selectVideo(video);
    document.querySelector('.player-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected playPlaylist(pl: Playlist) {
    this.service.playEntirePlaylist(pl);
    this.activeTab.set('queue');
    document.querySelector('.player-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  protected confirmDeletePlaylist(pl: Playlist) {
    if (confirm(`Are you sure you want to delete playlist "${pl.name}"?`)) {
      this.service.deletePlaylist(pl.id);
    }
  }
}
