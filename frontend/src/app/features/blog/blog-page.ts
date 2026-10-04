import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { forkJoin } from 'rxjs';
import { BlogPost, BlogPostRequest, BlogPostStatus } from '../../core/models/blog.models';
import { ArticleStudyCoachService } from '../../core/services/article-study-coach.service';
import { BlogService } from '../../core/services/blog.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { TopicQuizService } from '../../core/services/topic-quiz.service';
import { Spinner } from '../../shared/spinner';
import { TopicQuizModal } from '../../shared/topic-quiz-modal/topic-quiz-modal';

// Ensure external links in markdown open safely in a new tab without leaving the app
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

interface EditorDraft {
  title: string;
  subject: string;
  excerpt: string;
  content: string;
  tags: string;
  status: BlogPostStatus;
}

interface SubjectGroup {
  subject: string;
  domain: string;
  icon: string;
  articles: BlogPost[];
}

/** Subject-organised study articles grouped subject-wise with rich markdown reader. */
@Component({
  selector: 'app-blog-page',
  imports: [FormsModule, RouterLink, Spinner, TopicQuizModal],
  template: `
    <main id="main-content" tabindex="-1" class="blog">
      <header>
        <div>
          <div class="breadcrumb">
            <button
              type="button"
              class="nav-back-pill"
              (click)="nav.back('/dashboard')"
              aria-label="Go back"
            >
              ← Back to {{ nav.previousPageLabel('Dashboard') }}
            </button>
            <span>/</span>
            <span>Study Articles</span>
          </div>
          <h1>Technical Study Articles</h1>
          <p class="muted">Curated technical interview prep guides, deep dives, and patterns organized subject-wise.</p>
        </div>
        <nav>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/notes">Notes</a>
          <button type="button" class="btn" (click)="openNew()">+ Write article</button>
        </nav>
      </header>

      <!-- Domain Category Tabs -->
      <section class="domain-tabs" aria-label="Filter by domain">
        <button
          type="button"
          class="domain-tab"
          [class.active]="selectedDomain() === 'All'"
          (click)="selectDomain('All')"
        >
          <span class="tab-icon">📚</span>
          <span class="tab-name">All Subjects</span>
          <span class="tab-count">{{ posts().length }}</span>
        </button>
        @for (dom of domains(); track dom.name) {
          <button
            type="button"
            class="domain-tab"
            [class.active]="selectedDomain() === dom.name"
            (click)="selectDomain(dom.name)"
          >
            <span class="tab-icon">{{ dom.icon }}</span>
            <span class="tab-name">{{ dom.name }}</span>
            <span class="tab-count">{{ dom.count }}</span>
          </button>
        }
      </section>

      <!-- Search & Specific Subject Filter Toolbar -->
      <section class="toolbar" aria-label="Article filters">
        <label class="search">
          <span class="sr-only">Search articles</span>
          <input type="search" [(ngModel)]="query" placeholder="Search across titles, subjects, tags, and content..." />
        </label>
        <label class="subject-filter">
          <span class="sr-only">Jump to specific subject</span>
          <select [(ngModel)]="subject">
            <option value="">All {{ subjects().length }} subjects</option>
            @for (item of subjects(); track item) {
              <option [value]="item">{{ item }} ({{ countForSubject(item) }})</option>
            }
          </select>
        </label>
        @if (subject || query || selectedDomain() !== 'All') {
          <button type="button" class="btn btn-quiet btn-sm" (click)="clearAllFilters()">Reset filters</button>
        }
      </section>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <!-- Article Editor Modal / Inline Form -->
      @if (editorOpen()) {
        <section class="editor" aria-labelledby="editor-title">
          <div class="editor-heading">
            <div>
              <h2 id="editor-title">{{ editing() ? 'Edit article' : 'New article' }}</h2>
              <p class="muted">Drafts are private until you publish them. Markdown formatting is supported.</p>
            </div>
            <button type="button" class="btn btn-quiet" (click)="closeEditor()">Close</button>
          </div>

          <form (ngSubmit)="save()">
            <div class="form-grid">
              <label class="field wide">
                <span>Title</span>
                <input name="title" [(ngModel)]="draft.title" required maxlength="180" placeholder="e.g. Memory Model in Java Virtual Machine" />
              </label>
              <label class="field">
                <span>Subject</span>
                <input name="subject" [(ngModel)]="draft.subject" required maxlength="80" placeholder="e.g. Java Concurrency & Threads, Spring Boot Fundamentals..." />
              </label>
              <label class="field">
                <span>Visibility</span>
                <select name="status" [(ngModel)]="draft.status">
                  <option value="DRAFT">Save as draft</option>
                  <option value="PUBLISHED">Publish for everyone</option>
                </select>
              </label>
              <label class="field wide">
                <span>Short description / summary</span>
                <textarea name="excerpt" [(ngModel)]="draft.excerpt" maxlength="500" rows="2" placeholder="What will readers learn?"></textarea>
              </label>
              <div class="field wide editor-content-field">
                <div class="editor-subhead">
                  <span>Article Content (Markdown supported)</span>
                  <div class="editor-tabs" role="tablist">
                    <button type="button" class="tab-btn" [class.active]="editorTab() === 'write'" (click)="editorTab.set('write')">Write</button>
                    <button type="button" class="tab-btn" [class.active]="editorTab() === 'preview'" (click)="editorTab.set('preview')">Preview</button>
                  </div>
                </div>
                @if (editorTab() === 'write') {
                  <textarea name="content" [(ngModel)]="draft.content" required maxlength="500000" rows="14" placeholder="Write markdown explanations, code blocks, interview questions..."></textarea>
                } @else {
                  <div class="preview-box markdown-body" [innerHTML]="renderedDraft()"></div>
                }
              </div>
              <label class="field wide">
                <span>Tags</span>
                <input name="tags" [(ngModel)]="draft.tags" maxlength="280" placeholder="java, concurrency, interview, spring-boot" />
                <small>Separate tags with commas.</small>
              </label>
            </div>
            <div class="editor-actions">
              <button type="button" class="btn btn-ghost" (click)="closeEditor()">Cancel</button>
              <button type="submit" class="btn" [disabled]="saving()">{{ saving() ? 'Saving...' : editing() ? 'Save changes' : 'Save article' }}</button>
            </div>
          </form>
        </section>
      }

      @if (loading()) {
        <app-spinner label="Loading study articles..." />
      } @else if (selected(); as article) {
        <!-- Article Reader View -->
        <article class="reader">
          <div class="reader-topline">
            <button type="button" class="nav-back-pill" (click)="selectArticle(null)">← Back to all subjects</button>
            <div class="reader-meta-pills">
              <span class="read-time">{{ readTime(article.content) }}</span>
              @if (article.mine) {
                <span class="status" [class.draft]="article.status === 'DRAFT'">{{ article.status === 'DRAFT' ? 'Draft' : 'Published' }}</span>
              }
            </div>
          </div>

          <!-- Article Reading Coach HUD Bar -->
          <div class="reading-hud-bar" role="region" aria-label="Reading Study Coach HUD">
            <div class="hud-left">
              <button
                type="button"
                class="hud-status-badge"
                [class]="coach.patternLabel().badgeClass"
                (click)="coach.toggleCoachDrawer()"
                [title]="coach.patternLabel().subtitle"
              >
                <span class="hud-icon">{{ coach.patternLabel().icon }}</span>
                <span class="hud-status-text">
                  <span class="hud-status-title">{{ coach.patternLabel().title }}</span>
                  <span class="hud-status-desc">{{ coach.patternLabel().subtitle }}</span>
                </span>
              </button>
            </div>

            <div class="hud-metrics">
              <div class="hud-pill" title="Current Reading Pace (Words Per Minute)">
                <span class="pill-icon">⚡</span>
                <span class="pill-label">WPM</span>
                <strong class="pill-val">{{ coach.currentWpm() }}</strong>
              </div>

              <div class="hud-pill" title="Continuous Reading Streak">
                <span class="pill-icon">⏱️</span>
                <span class="pill-label">Streak</span>
                <strong class="pill-val">{{ coach.formattedContinuousRead() }}</strong>
              </div>

              <div class="hud-pill" title="Active Reflection Pauses Taken">
                <span class="pill-icon">⏸️</span>
                <span class="pill-label">Pauses</span>
                <strong class="pill-val">{{ coach.pauseCount() }}</strong>
              </div>

              <div class="hud-pill" title="Article Scroll Depth">
                <span class="pill-icon">📜</span>
                <span class="pill-label">Depth</span>
                <strong class="pill-val">{{ coach.scrollDepthPercent() }}%</strong>
              </div>

              <div
                class="hud-pill retention-pill"
                [class.high]="coach.retentionIndex() >= 80"
                [class.medium]="coach.retentionIndex() >= 60 && coach.retentionIndex() < 80"
                [class.low]="coach.retentionIndex() < 60"
                title="Pedagogical Retention Score based on pace, reflection pauses, and active notes"
              >
                <span class="pill-icon">🎯</span>
                <span class="pill-label">Retention</span>
                <strong class="pill-val">{{ coach.retentionIndex() }}%</strong>
              </div>

              @if (coach.breakTimerActive()) {
                <div class="hud-pill rest-pill" title="Pomodoro Eye Rest Active">
                  <span class="pill-icon">☕</span>
                  <span class="pill-label">Rest</span>
                  <strong class="pill-val">{{ coach.formattedBreakTimer() }}</strong>
                  <button type="button" class="mini-cancel-btn" (click)="coach.cancelBreakTimer()" aria-label="Cancel rest timer">✕</button>
                </div>
              }
            </div>

            <div class="hud-actions">
              <button
                type="button"
                id="blog-hud-quiz-btn"
                class="btn btn-sm btn-hud-quiz"
                (click)="openTopicQuiz()"
                title="Take an optional 60-second quiz on this topic to test retention"
                aria-label="Take quick concept quiz"
              >
                ⚡ Quick Quiz
              </button>
              <button
                type="button"
                class="btn btn-sm btn-hud-toggle"
                [class.active]="coach.isCoachDrawerOpen()"
                (click)="coach.toggleCoachDrawer()"
                aria-label="Toggle Study Coach and Scratchpad Drawer"
              >
                💡 Study Coach & Notes
                @if (coach.activePauseCount() > 0) {
                  <span class="hud-badge-dot">{{ coach.activePauseCount() }}</span>
                }
              </button>
            </div>
          </div>

          <!-- Pedagogical Pattern Alert Banner (When Skimming or Reading Passively) -->
          @if (coach.currentPattern() === 'SKIMMING' || coach.currentPattern() === 'PASSIVE_READING' || coach.currentPattern() === 'COMPREHENSION_STRUGGLE') {
            <aside class="article-alert-banner" [class]="coach.patternLabel().badgeClass" role="alert">
              <div class="banner-main">
                <span class="banner-icon">{{ coach.patternLabel().icon }}</span>
                <div class="banner-body">
                  <strong>{{ coach.patternLabel().title }}</strong>
                  <p>{{ coach.patternLabel().subtitle }}</p>
                </div>
              </div>
              <div class="banner-buttons">
                @if (coach.currentPattern() === 'SKIMMING') {
                  <button type="button" class="btn btn-sm banner-action" (click)="applyArticleCoachAction('take_pause')">
                    ⏸️ 60s Recall Pause
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost banner-action" (click)="applyArticleCoachAction('insert_summary')">
                    📝 1-Line Summary
                  </button>
                } @else if (coach.currentPattern() === 'PASSIVE_READING') {
                  <button type="button" class="btn btn-sm banner-action" (click)="applyArticleCoachAction('insert_summary')">
                    📝 1-Sentence Distillation
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost banner-action" (click)="applyArticleCoachAction('start_rest_3m')">
                    ☕ 3-Min Pomodoro Rest
                  </button>
                } @else if (coach.currentPattern() === 'COMPREHENSION_STRUGGLE') {
                  <button type="button" class="btn btn-sm banner-action" (click)="applyArticleCoachAction('insert_invariant_breakdown')">
                    🔍 Code Invariant Trace
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost banner-action" (click)="applyArticleCoachAction('insert_tradeoffs')">
                    ⚖️ Tradeoff Breakdown
                  </button>
                }
              </div>
            </aside>
          }

          <!-- Study Coach Drawer & In-Reader Active Scratchpad -->
          @if (coach.isCoachDrawerOpen()) {
            <section class="coach-drawer" aria-labelledby="coach-drawer-title">
              <div class="drawer-header">
                <div class="drawer-title-group">
                  <h3 id="coach-drawer-title">
                    <span>🧠</span> Active Reading Coach & Scratchpad
                  </h3>
                  <span class="drawer-subtitle">Observation-driven cognitive feedback for technical retention</span>
                </div>
                <button type="button" class="btn btn-quiet btn-xs" (click)="coach.toggleCoachDrawer()" aria-label="Close Study Coach">✕ Close</button>
              </div>

              <!-- Diagnostic 4-Metric Grid -->
              <div class="coach-metrics-grid">
                <div class="coach-metric-card">
                  <span class="metric-icon">⏱️</span>
                  <div class="metric-content">
                    <span class="metric-title">Continuous vs Pause</span>
                    <span class="metric-value">{{ coach.formattedReadTime() }} read / {{ coach.formattedPauseTime() }} pause</span>
                    <span class="metric-sub">{{ coach.pauseCount() }} reflection pauses recorded</span>
                  </div>
                </div>

                <div class="coach-metric-card">
                  <span class="metric-icon">⚡</span>
                  <div class="metric-content">
                    <span class="metric-title">Pace & Depth</span>
                    <span class="metric-value">{{ coach.currentWpm() }} WPM &bull; {{ coach.scrollDepthPercent() }}% scrolled</span>
                    <span class="metric-sub">Ideal tech reading: 140–280 WPM</span>
                  </div>
                </div>

                <div class="coach-metric-card">
                  <span class="metric-icon">🔄</span>
                  <div class="metric-content">
                    <span class="metric-title">Re-reads & Highlights</span>
                    <span class="metric-value">{{ coach.reReadCount() }} re-reads &bull; {{ coach.activePauseCount() }} active notes</span>
                    <span class="metric-sub">Highlighting text boosts recall</span>
                  </div>
                </div>

                <div class="coach-metric-card highlight">
                  <span class="metric-icon">🎯</span>
                  <div class="metric-content">
                    <span class="metric-title">Retention Health</span>
                    <span class="metric-value">{{ coach.retentionIndex() }} / 100</span>
                    <span class="metric-sub">{{ coach.patternLabel().title }}</span>
                  </div>
                </div>
              </div>

              <!-- Pomodoro Screen Rest Box -->
              <div class="pomodoro-box">
                <div class="pomodoro-info">
                  <strong>☕ Cognitive Rest & Eye Refresh</strong>
                  <p>Short pauses prevent cognitive saturation when processing algorithms and architecture.</p>
                </div>
                <div class="pomodoro-actions">
                  @if (coach.breakTimerActive()) {
                    <span class="active-timer-display">Resting: {{ coach.formattedBreakTimer() }} remaining</span>
                    <button type="button" class="btn btn-sm btn-ghost" (click)="coach.cancelBreakTimer()">Resume Reading</button>
                  } @else {
                    <button type="button" class="btn btn-sm btn-quiet" (click)="coach.startBreakTimer(60)">1m Micro-Pause</button>
                    <button type="button" class="btn btn-sm btn-quiet" (click)="coach.startBreakTimer(180)">3m Eye Rest</button>
                    <button type="button" class="btn btn-sm btn-quiet" (click)="coach.startBreakTimer(300)">5m Pomodoro</button>
                  }
                </div>
              </div>

              <!-- Study Recommendations -->
              <div class="coach-recommendations-section">
                <h4>💡 Pedagogical Recommendations for Current Pace</h4>
                <div class="recs-grid">
                  @for (rec of coach.recommendations(); track rec.id) {
                    <div class="rec-card" [class]="'rec-' + rec.category">
                      <div class="rec-header">
                        <span class="rec-title">{{ rec.title }}</span>
                        <span class="rec-badge">{{ rec.badge }}</span>
                      </div>
                      <p class="rec-desc">{{ rec.description }}</p>
                      @if (rec.actionText && rec.actionKey) {
                        <button
                          type="button"
                          class="btn btn-xs btn-action"
                          (click)="applyArticleCoachAction(rec.actionKey)"
                        >
                          {{ rec.actionText }}
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- Interactive In-Reader Study Scratchpad -->
              <div class="scratchpad-box">
                <div class="scratchpad-header">
                  <div>
                    <h4>📝 Article Active Scratchpad & Notes</h4>
                    <span class="scratchpad-sub">Auto-saved for this article. Writing notes increases long-term retention.</span>
                  </div>
                  <div class="template-shortcuts">
                    <button type="button" class="btn btn-xs btn-ghost" (click)="applyArticleCoachAction('insert_summary')">+ 1-Line Summary</button>
                    <button type="button" class="btn btn-xs btn-ghost" (click)="applyArticleCoachAction('insert_interview_qa')">+ Mock Q&A</button>
                    <button type="button" class="btn btn-xs btn-ghost" (click)="applyArticleCoachAction('insert_tradeoffs')">+ Tradeoffs</button>
                  </div>
                </div>
                <textarea
                  class="scratchpad-textarea"
                  rows="5"
                  placeholder="Synthesize key takeaways, invariants, or interview questions in your own words..."
                  [ngModel]="coach.articleNotes()"
                  (ngModelChange)="onNotesChange($event)"
                ></textarea>
              </div>
            </section>
          }

          <!-- Eye Rest / Pomodoro Overlay -->
          @if (coach.breakTimerActive()) {
            <div class="reader-rest-overlay" role="dialog" aria-modal="true" aria-label="Reading Eye Rest">
              <div class="rest-overlay-card">
                <div class="rest-breathing-circle"></div>
                <h3>☕ Time to Rest Your Eyes & Digest</h3>
                <p class="rest-timer-counter">{{ coach.formattedBreakTimer() }}</p>
                <p class="rest-hint">Look 20 feet away to relax your optical nerves and let concepts consolidate.</p>
                <button type="button" class="btn btn-sm" (click)="coach.cancelBreakTimer()">Resume Reading Now</button>
              </div>
            </div>
          }

          <div class="reader-header-meta">
            <span class="subject-badge-pill" (click)="filterBySubject(article.subject)">{{ getSubjectIcon(article.subject) }} {{ article.subject }}</span>
            <span class="meta-dot">·</span>
            <span class="byline">By {{ article.authorName }}</span>
            <span class="meta-dot">·</span>
            <span class="byline">{{ date(article.publishedAt || article.updatedAt) }}</span>
          </div>

          <h2>{{ article.title }}</h2>
          @if (article.excerpt) { <p class="lead">{{ article.excerpt }}</p> }

          <div class="article-body markdown-body" [innerHTML]="renderedContent()"></div>

          <div class="reader-footer">
            <div class="tags" aria-label="Tags">
              @for (tag of article.tags; track tag) {
                <button type="button" class="tag-btn" (click)="filterByTag(tag)">#{{ tag }}</button>
              }
            </div>
            @if (article.mine) {
              <div class="article-actions">
                <button type="button" class="btn btn-ghost" (click)="openEdit(article)">Edit</button>
                <button type="button" class="btn btn-danger" (click)="remove(article)">Delete</button>
              </div>
            }
          </div>

          <!-- Subject Navigation: Next / Prev in this subject -->
          <nav class="reader-subject-nav" aria-label="Subject sequence navigation">
            @if (prevInSubject(); as prev) {
              <button type="button" class="subject-nav-card prev" (click)="selectArticle(prev)">
                <span class="nav-direction">← Previous in {{ article.subject }}</span>
                <span class="nav-title">{{ prev.title }}</span>
              </button>
            } @else {
              <div class="subject-nav-spacer"></div>
            }
            @if (nextInSubject(); as next) {
              <button type="button" class="subject-nav-card next" (click)="selectArticle(next)">
                <span class="nav-direction">Next in {{ article.subject }} →</span>
                <span class="nav-title">{{ next.title }}</span>
              </button>
            }
          </nav>

          <!-- More articles in this subject -->
          @if (moreInSubject().length > 0) {
            <section class="more-in-subject">
              <h3>More in {{ article.subject }}</h3>
              <div class="more-grid">
                @for (item of moreInSubject(); track item.id) {
                  <div class="more-card" (click)="selectArticle(item)">
                    <span class="more-title">{{ item.title }}</span>
                    <span class="more-meta">{{ readTime(item.content) }}</span>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Optional Topic Concept Quiz Modal & Prompt -->
          <app-topic-quiz-modal (saveTakeaway)="handleQuizTakeaway($event)"></app-topic-quiz-modal>
        </article>
      } @else {
        <!-- Subject-Wise Grouped Articles View -->
        <section class="subject-wise-container" aria-live="polite">
          <div class="results-header">
            <p class="result-count">
              Showing <strong>{{ filtered().length }}</strong> article(s) across <strong>{{ subjectGroups().length }}</strong> subject(s)
            </p>
          </div>

          @for (group of subjectGroups(); track group.subject) {
            <section class="subject-group" [id]="'subj-' + sanitizeId(group.subject)">
              <div class="subject-group-header">
                <div class="subject-group-title">
                  <span class="group-icon">{{ group.icon }}</span>
                  <div>
                    <h2>{{ group.subject }}</h2>
                    <span class="group-domain">{{ group.domain }}</span>
                  </div>
                </div>
                <div class="subject-group-actions">
                  <span class="group-count-pill">{{ group.articles.length }} article{{ group.articles.length === 1 ? '' : 's' }}</span>
                  <button type="button" class="btn btn-quiet btn-xs" (click)="toggleCollapse(group.subject)">
                    {{ isCollapsed(group.subject) ? 'Expand' : 'Collapse' }}
                  </button>
                </div>
              </div>

              @if (!isCollapsed(group.subject)) {
                <div class="article-grid">
                  @for (article of group.articles; track article.id) {
                    <article class="article-card" (click)="selectArticle(article)">
                      <div class="card-meta">
                        <span class="subject-badge">{{ article.subject }}</span>
                        <span class="read-time">{{ readTime(article.content) }}</span>
                      </div>
                      <h3>{{ article.title }}</h3>
                      <p class="excerpt">{{ article.excerpt || excerpt(article.content) }}</p>
                      <div class="tags" aria-label="Tags">
                        @for (tag of article.tags; track tag) { <span>#{{ tag }}</span> }
                      </div>
                      <footer>
                        <span class="author-meta">{{ article.authorName }}</span>
                        <button type="button" class="btn btn-quiet btn-sm" (click)="$event.stopPropagation(); selectArticle(article)">Read →</button>
                      </footer>
                    </article>
                  }
                </div>
              }
            </section>
          } @empty {
            <div class="empty">
              <p>No articles match these filters.</p>
              <button type="button" class="btn btn-quiet" (click)="clearAllFilters()">Reset filters</button>
            </div>
          }
        </section>
      }

      <!-- Floating Coach Toast -->
      @if (coach.activeToast(); as toast) {
        <div class="coach-toast" [class]="'toast-' + toast.type" role="status">
          <span class="toast-icon">{{ toast.icon }}</span>
          <span class="toast-message">{{ toast.message }}</span>
          <button type="button" class="toast-close" (click)="coach.dismissToast()" aria-label="Dismiss notification">✕</button>
        </div>
      }
    </main>
  `,
  styleUrl: './blog-page.scss',
})
export class BlogPage implements OnInit, OnDestroy {
  private readonly blogs = inject(BlogService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly nav = inject(NavigationHistoryService);
  protected readonly coach = inject(ArticleStudyCoachService);
  protected readonly quizService = inject(TopicQuizService);
  private pendingArticleId: number | null = null;

  protected readonly posts = signal<BlogPost[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<BlogPost | null>(null);
  protected readonly selected = signal<BlogPost | null>(null);
  protected readonly editorTab = signal<'write' | 'preview'>('write');
  protected readonly collapsedSubjects = signal<Set<string>>(new Set());

  protected readonly selectedDomain = signal<string>('All');
  protected query = '';
  protected subject = '';
  protected draft: EditorDraft = this.emptyDraft();

  protected readonly subjects = computed(() =>
    [...new Set(this.posts().map((post) => post.subject))].sort((a, b) => a.localeCompare(b)),
  );

  protected readonly domains = computed(() => {
    const map = new Map<string, { count: number; icon: string }>();
    for (const post of this.posts()) {
      const domain = this.getSubjectDomain(post.subject);
      const icon = this.getDomainIcon(domain);
      const entry = map.get(domain) || { count: 0, icon };
      entry.count++;
      map.set(domain, entry);
    }
    const order = ['Java', 'Spring Boot', 'Python', 'DSA', 'Case Studies', 'Frontend & Web', 'Database & SQL', 'System Design', 'Testing', 'Code Snippets', 'General'];
    return [...map.entries()]
      .sort((a, b) => {
        const idxA = order.indexOf(a[0]);
        const idxB = order.indexOf(b[0]);
        return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
      })
      .map(([name, data]) => ({ name, count: data.count, icon: data.icon }));
  });

  protected readonly filtered = computed(() => {
    const needle = this.query.trim().toLocaleLowerCase();
    const domainFilter = this.selectedDomain();
    return this.posts().filter((post) => {
      const matchesSubject = !this.subject || post.subject === this.subject;
      const matchesDomain = domainFilter === 'All' || this.getSubjectDomain(post.subject) === domainFilter;
      if (!matchesSubject || !matchesDomain) return false;
      if (!needle) return true;
      const inMeta = `${post.title} ${post.subject} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase().includes(needle);
      const inContent = needle.length >= 3 && post.content.toLocaleLowerCase().includes(needle);
      return inMeta || inContent;
    });
  });

  protected readonly subjectGroups = computed<SubjectGroup[]>(() => {
    const groupsMap = new Map<string, BlogPost[]>();
    for (const article of this.filtered()) {
      const list = groupsMap.get(article.subject) || [];
      list.push(article);
      groupsMap.set(article.subject, list);
    }

    return [...groupsMap.entries()]
      .sort((a, b) => {
        const domainA = this.getSubjectDomain(a[0]);
        const domainB = this.getSubjectDomain(b[0]);
        if (domainA !== domainB) return domainA.localeCompare(domainB);
        return a[0].localeCompare(b[0]);
      })
      .map(([subject, articles]) => ({
        subject,
        domain: this.getSubjectDomain(subject),
        icon: this.getSubjectIcon(subject),
        articles,
      }));
  });

  protected readonly renderedContent = computed<SafeHtml>(() => {
    const post = this.selected();
    if (!post) return '';
    try {
      const raw = marked.parse(post.content, { async: false, gfm: true, breaks: true }) as string;
      const clean = DOMPurify.sanitize(raw, {
        ADD_ATTR: ['target', 'rel'],
      });
      return this.sanitizer.bypassSecurityTrustHtml(clean);
    } catch {
      return post.content;
    }
  });

  protected readonly renderedDraft = computed<SafeHtml>(() => {
    if (!this.draft.content) return '';
    try {
      const raw = marked.parse(this.draft.content, { async: false, gfm: true, breaks: true }) as string;
      const clean = DOMPurify.sanitize(raw, {
        ADD_ATTR: ['target', 'rel'],
      });
      return this.sanitizer.bypassSecurityTrustHtml(clean);
    } catch {
      return this.draft.content;
    }
  });

  protected readonly currentSubjectArticles = computed<BlogPost[]>(() => {
    const sel = this.selected();
    if (!sel) return [];
    return this.posts().filter((p) => p.subject === sel.subject);
  });

  protected readonly prevInSubject = computed<BlogPost | null>(() => {
    const sel = this.selected();
    if (!sel) return null;
    const list = this.currentSubjectArticles();
    const idx = list.findIndex((p) => p.id === sel.id);
    return idx > 0 ? list[idx - 1] : null;
  });

  protected readonly nextInSubject = computed<BlogPost | null>(() => {
    const sel = this.selected();
    if (!sel) return null;
    const list = this.currentSubjectArticles();
    const idx = list.findIndex((p) => p.id === sel.id);
    return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  });

  protected readonly moreInSubject = computed<BlogPost[]>(() => {
    const sel = this.selected();
    if (!sel) return [];
    return this.currentSubjectArticles().filter((p) => p.id !== sel.id).slice(0, 6);
  });

  constructor() {
    this.load();
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const articleParam = params['article'];
      if (articleParam) {
        const parsedId = Number(articleParam);
        if (!Number.isNaN(parsedId)) {
          this.pendingArticleId = parsedId;
          const found = this.posts().find((p) => p.id === parsedId);
          if (found) {
            this.selected.set(found);
            this.coach.startSession(found.id, found.title, found.content, found.subject);
          }
        }
      } else {
        this.pendingArticleId = null;
        this.selected.set(null);
        this.coach.endSession();
      }
    });
  }

  ngOnDestroy(): void {
    this.coach.endSession();
  }

  protected selectDomain(domain: string): void {
    this.selectedDomain.set(domain);
    this.subject = '';
    this.selectArticle(null);
  }

  protected selectArticle(post: BlogPost | null, updateUrl = true): void {
    this.selected.set(post);
    if (updateUrl) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { article: post ? post.id : null },
        queryParamsHandling: 'merge',
      });
    }
    if (post) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.coach.startSession(post.id, post.title, post.content, post.subject);
    } else {
      this.coach.endSession();
    }
  }

  protected openTopicQuiz(): void {
    const article = this.selected();
    if (article) {
      this.quizService.openManualQuiz(article.subject, article.title, 'article');
    }
  }

  protected handleQuizTakeaway(takeaway: string): void {
    const current = this.coach.articleNotes();
    this.coach.updateArticleNotes(current ? current + takeaway : takeaway.trim());
    this.coach.showToast('Quiz checkpoint takeaway saved into your notes!', 'success', '📝');
  }

  protected onNotesChange(text: string): void {
    this.coach.updateArticleNotes(text);
  }

  protected applyArticleCoachAction(actionKey: string): void {
    const current = this.coach.articleNotes();
    switch (actionKey) {
      case 'take_pause':
        this.coach.startBreakTimer(60);
        this.coach.showToast('Taking 60s pause. Digest the main thesis before moving forward.', 'info', '⏸️');
        break;
      case 'start_rest_3m':
        this.coach.startBreakTimer(180);
        break;
      case 'start_rest_5m':
        this.coach.startBreakTimer(300);
        break;
      case 'insert_summary': {
        const template = `\n\n### 📝 1-Line Core Concept\n- **Problem Solved:** \n- **Key Invariant / Rule:** \n- **Main Tradeoff:** \n`;
        this.coach.updateArticleNotes(current ? current + template : template.trim());
        if (!this.coach.isCoachDrawerOpen()) {
          this.coach.toggleCoachDrawer();
        }
        break;
      }
      case 'insert_interview_qa': {
        const template = `\n\n### 🎯 Mock Interview Q&A\n- **Q:** How does this behave under high concurrency / edge cases?\n- **A:** \n- **Complexity:** Time O( ), Space O( )\n`;
        this.coach.updateArticleNotes(current ? current + template : template.trim());
        if (!this.coach.isCoachDrawerOpen()) {
          this.coach.toggleCoachDrawer();
        }
        break;
      }
      case 'insert_tradeoffs': {
        const template = `\n\n### ⚖️ Tradeoff Breakdown\n- **Pros / Strengths:** \n- **Cons / Bottlenecks:** \n- **When to Avoid:** \n`;
        this.coach.updateArticleNotes(current ? current + template : template.trim());
        if (!this.coach.isCoachDrawerOpen()) {
          this.coach.toggleCoachDrawer();
        }
        break;
      }
      case 'insert_invariant_breakdown': {
        const template = `\n\n### 🔍 Code Invariant Trace\n- **Base State:** \n- **Step-by-step Transformation:** \n- **Edge cases to watch for:** \n`;
        this.coach.updateArticleNotes(current ? current + template : template.trim());
        if (!this.coach.isCoachDrawerOpen()) {
          this.coach.toggleCoachDrawer();
        }
        break;
      }
      default:
        this.coach.showToast('Study action applied! Active engagement recorded.', 'success', '✨');
    }
  }

  protected toggleCollapse(subj: string): void {
    this.collapsedSubjects.update((set) => {
      const next = new Set(set);
      if (next.has(subj)) next.delete(subj);
      else next.add(subj);
      return next;
    });
  }

  protected isCollapsed(subj: string): boolean {
    return this.collapsedSubjects().has(subj);
  }

  protected openNew(): void {
    this.editing.set(null);
    this.draft = this.emptyDraft();
    this.error.set(null);
    this.editorTab.set('write');
    this.editorOpen.set(true);
  }

  protected openEdit(post: BlogPost): void {
    this.editing.set(post);
    this.draft = {
      title: post.title,
      subject: post.subject,
      excerpt: post.excerpt,
      content: post.content,
      tags: post.tags.join(', '),
      status: post.status,
    };
    this.selectArticle(null);
    this.error.set(null);
    this.editorTab.set('write');
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editing.set(null);
  }

  protected save(): void {
    if (!this.draft.title.trim() || !this.draft.subject.trim() || !this.draft.content.trim()) {
      this.error.set('Title, subject, and article content are required.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const payload: BlogPostRequest = {
      title: this.draft.title.trim(),
      subject: this.draft.subject.trim(),
      excerpt: this.draft.excerpt.trim(),
      content: this.draft.content.trim(),
      tags: this.draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: this.draft.status,
    };
    const editing = this.editing();
    const request = editing ? this.blogs.update(editing.id, payload) : this.blogs.create(payload);
    request.subscribe({
      next: (post) => {
        this.posts.update((items) => [post, ...items.filter((item) => item.id !== post.id)]);
        this.closeEditor();
        this.saving.set(false);
      },
      error: () => {
        this.error.set('Could not save this article. Please try again.');
        this.saving.set(false);
      },
    });
  }

  protected remove(post: BlogPost): void {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    this.blogs.delete(post.id).subscribe({
      next: () => {
        this.posts.update((items) => items.filter((item) => item.id !== post.id));
        this.selectArticle(null);
      },
      error: () => this.error.set('Could not delete this article. Please try again.'),
    });
  }

  protected excerpt(content: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}...` : flat;
  }

  protected readTime(content: string): string {
    const words = (content || '').trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 220));
    return `${minutes} min read`;
  }

  protected countForSubject(subj: string): number {
    return this.posts().filter((p) => p.subject === subj).length;
  }

  protected filterBySubject(subj: string): void {
    this.subject = subj;
    this.selectArticle(null);
  }

  protected filterByTag(tag: string): void {
    this.query = tag;
    this.selectArticle(null);
  }

  protected clearAllFilters(): void {
    this.selectedDomain.set('All');
    this.subject = '';
    this.query = '';
  }

  protected sanitizeId(val: string): string {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  protected getSubjectDomain(subject: string): string {
    const s = subject.toLowerCase();
    if (s.includes('java ') || s.startsWith('java') || s.includes('core java') || s.includes('oop')) return 'Java';
    if (s.includes('spring') || s.includes('kafka')) return 'Spring Boot';
    if (s.includes('database') || s.includes('sql') || s.includes('hibernate') || s.includes('jdbc')) return 'Database & SQL';
    if (s.includes('system design') || s.includes('transaction')) return 'System Design';
    if (s.includes('python')) return 'Python';
    if (s.includes('dsa') || s.includes('data structures') || s.includes('algorithm') || s.includes('arrays') || s.includes('trees')) return 'DSA';
    if (s.includes('fullstack') || s.includes('web') || s.includes('frontend') || s.includes('angular')) return 'Frontend & Web';
    if (s.includes('banking') || s.includes('case stud')) return 'Case Studies';
    if (s.includes('testing')) return 'Testing';
    if (s.includes('snippet')) return 'Code Snippets';
    return 'General';
  }

  protected getSubjectIcon(subject: string): string {
    const s = subject.toLowerCase();
    if (s.includes('java ') || s.startsWith('java') || s.includes('core java') || s.includes('oop')) return '☕';
    if (s.includes('spring')) return '🍃';
    if (s.includes('kafka')) return '📬';
    if (s.includes('database') || s.includes('sql') || s.includes('hibernate') || s.includes('jdbc')) return '🗄️';
    if (s.includes('system design') || s.includes('url shortener')) return '🏛️';
    if (s.includes('transaction')) return '🔄';
    if (s.includes('python')) return '🐍';
    if (s.includes('dsa') || s.includes('data structures') || s.includes('algorithm') || s.includes('tree') || s.includes('array')) return '⚡';
    if (s.includes('web') || s.includes('angular') || s.includes('frontend')) return '🌐';
    if (s.includes('banking') || s.includes('case stud')) return '🏢';
    if (s.includes('testing')) return '🧪';
    if (s.includes('snippet')) return '📝';
    return '📖';
  }

  protected getDomainIcon(domain: string): string {
    switch (domain) {
      case 'Java': return '☕';
      case 'Spring Boot': return '🍃';
      case 'Database & SQL': return '🗄️';
      case 'System Design': return '🏛️';
      case 'Python': return '🐍';
      case 'DSA': return '⚡';
      case 'Frontend & Web': return '🌐';
      case 'Case Studies': return '🏢';
      case 'Testing': return '🧪';
      case 'Code Snippets': return '📝';
      default: return '📚';
    }
  }

  protected date(value?: string | null): string {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
    } catch {
      return '';
    }
  }

  private load(): void {
    forkJoin({ published: this.blogs.published(), mine: this.blogs.mine() }).subscribe({
      next: ({ published, mine }) => {
        const byId = new Map(published.map((post) => [post.id, post]));
        mine.forEach((post) => byId.set(post.id, post));
        const allPosts = [...byId.values()].sort((a, b) => {
          const timeA = a.publishedAt || a.updatedAt || '';
          const timeB = b.publishedAt || b.updatedAt || '';
          return timeB.localeCompare(timeA);
        });
        this.posts.set(allPosts);
        if (this.pendingArticleId) {
          const found = allPosts.find((p) => p.id === this.pendingArticleId);
          if (found) {
            this.selected.set(found);
            this.coach.startSession(found.id, found.title, found.content, found.subject);
          }
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load articles. Please refresh and try again.');
        this.loading.set(false);
      },
    });
  }

  private emptyDraft(): EditorDraft {
    return { title: '', subject: '', excerpt: '', content: '', tags: '', status: 'PUBLISHED' };
  }
}
