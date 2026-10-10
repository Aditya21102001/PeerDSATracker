import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { SeoService } from '../../core/services/seo.service';
import {
  GuideTopic,
  StudyGuidesService,
} from '../../core/services/study-guides.service';

/**
 * Detail page for a single study guide (e.g. DSA, Angular).
 * Shows a sidebar of topics and a main content area that renders the selected
 * topic's sections with syntax-highlighted code snippets and call-out boxes.
 */
@Component({
  selector: 'app-study-guide-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (guide(); as g) {
      <main id="main-content" tabindex="-1" class="sgd-page">
        <header class="sgd-header">
          <div class="sgd-breadcrumb">
            <button
              type="button"
              class="nav-back-pill"
              (click)="nav.back('/study-guides')"
              aria-label="Go back"
            >
              ← Back to {{ nav.previousPageLabel('Study Guides') }}
            </button>
            <span class="sep">/</span>
            <span [style.color]="g.color">{{ g.icon }} {{ g.title }}</span>
          </div>
          <nav class="sgd-nav">
            @if (auth.isAuthenticated()) {
              <a routerLink="/dashboard">Dashboard</a>
              <a routerLink="/sheet">Sheet</a>
            } @else {
              <a routerLink="/">Home</a>
              <a routerLink="/signin">Sign in</a>
            }
          </nav>
        </header>

        <div class="sgd-layout">
          <!-- Sidebar: topic list -->
          <aside class="sgd-sidebar" aria-label="Topics">
            <div class="sgd-guide-info">
              <div class="sgd-icon" [style.background]="g.color + '22'" [style.border-color]="g.color + '44'">
                {{ g.icon }}
              </div>
              <div>
                <h1>{{ g.title }}</h1>
                <p>{{ g.description }}</p>
              </div>
            </div>

            <nav class="topic-list" aria-label="Topic navigation">
              @for (topic of g.topics; track topic.id; let idx = $index) {
                <button
                  type="button"
                  class="topic-item"
                  [class.active]="activeTopic()?.id === topic.id"
                  (click)="selectTopic(topic)"
                >
                  <span class="topic-num">{{ idx + 1 }}</span>
                  <span class="topic-text">
                    <strong>{{ topic.title }}</strong>
                    <small>{{ topic.sections.length }} section{{ topic.sections.length !== 1 ? 's' : '' }}</small>
                  </span>
                </button>
              }
            </nav>
          </aside>

          <!-- Main content area -->
          <div class="sgd-content" role="region" aria-label="Guide content">
            @if (activeTopic(); as topic) {
              <div class="topic-header">
                <h2>{{ topic.title }}</h2>
                <p class="topic-desc">{{ topic.description }}</p>
              </div>

              <div class="sections-list">
                @for (section of topic.sections; track section.id) {
                  <article class="section-card" [id]="section.id">
                    <h3>{{ section.title }}</h3>

                    <div class="section-content">
                      @for (block of parseContent(section.content); track $index) {
                        @if (block.type === 'text') {
                          <p>{{ block.text }}</p>
                        } @else if (block.type === 'heading') {
                          <p class="section-sub-heading">{{ block.text }}</p>
                        } @else if (block.type === 'list-item') {
                          <div class="list-row">
                            <span class="list-bullet">•</span>
                            <span>{{ block.text }}</span>
                          </div>
                        } @else if (block.type === 'table') {
                          <div class="table-wrap">
                            <table>
                              @for (row of block.rows; track $index; let rowIdx = $index) {
                                <tr [class.header-row]="rowIdx === 0">
                                  @for (cell of row; track $index; let cellIdx = $index) {
                                    @if (rowIdx === 0) {
                                      <th>{{ cell }}</th>
                                    } @else {
                                      <td>{{ cell }}</td>
                                    }
                                  }
                                </tr>
                              }
                            </table>
                          </div>
                        }
                      }
                    </div>

                    @if (section.code) {
                      <div class="code-block">
                        <div class="code-header">
                          <span class="code-lang">{{ section.language ?? 'code' }}</span>
                          <button
                            type="button"
                            class="copy-btn"
                            (click)="copyCode(section.code!, $event)"
                          >
                            {{ copiedId() === section.id ? '✓ Copied' : 'Copy' }}
                          </button>
                        </div>
                        <pre class="code-pre"><code>{{ section.code }}</code></pre>
                      </div>
                    }

                    @if (section.tip) {
                      <div class="callout tip">
                        <span class="callout-icon">💡</span>
                        <p>{{ section.tip }}</p>
                      </div>
                    }

                    @if (section.warning) {
                      <div class="callout warning">
                        <span class="callout-icon">⚠️</span>
                        <p>{{ section.warning }}</p>
                      </div>
                    }
                  </article>
                }
              </div>

              <!-- Bottom navigation between topics -->
              <div class="topic-nav-footer">
                @if (prevTopic(); as prev) {
                  <button type="button" class="topic-nav-btn" (click)="selectTopic(prev)">
                    ← {{ prev.title }}
                  </button>
                } @else {
                  <span></span>
                }
                @if (nextTopic(); as next) {
                  <button type="button" class="topic-nav-btn next" (click)="selectTopic(next)">
                    {{ next.title }} →
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </main>
    } @else {
      <main class="sgd-page">
        <p class="not-found">Guide not found. <a routerLink="/study-guides">Back to guides</a></p>
      </main>
    }
  `,
  styleUrl: './study-guide-detail.scss',
})
export class StudyGuideDetail {
  /** Bound from router param via withComponentInputBinding() */
  readonly guideId = input.required<string>();

  private readonly svc = inject(StudyGuidesService);
  private readonly seo = inject(SeoService);
  protected readonly auth = inject(AuthStore);
  protected readonly nav = inject(NavigationHistoryService);

  protected readonly guide = computed(() => this.svc.getById(this.guideId()));
  protected readonly activeTopic = signal<GuideTopic | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  constructor() {
    // Dynamically update SEO metadata when guide is loaded
    effect(() => {
      const g = this.guide();
      if (g) {
        this.seo.updateMeta({
          title: `${g.title} Study Guide & Interview Cheatsheet | PeerDSATracker`,
          description: g.description,
          url: `https://peer-dsa-tracker-iota.vercel.app/study-guides/${g.id}`,
        });
      }
    });

    // Select the first topic once the guide is available
    queueMicrotask(() => {
      const g = this.guide();
      if (g && g.topics.length > 0) {
        this.activeTopic.set(g.topics[0]);
      }
    });
  }

  protected selectTopic(topic: GuideTopic): void {
    this.activeTopic.set(topic);
    // Scroll content area to top
    document.querySelector('.sgd-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected readonly prevTopic = computed(() => {
    const g = this.guide();
    const active = this.activeTopic();
    if (!g || !active) return null;
    const idx = g.topics.findIndex((t) => t.id === active.id);
    return idx > 0 ? g.topics[idx - 1] : null;
  });

  protected readonly nextTopic = computed(() => {
    const g = this.guide();
    const active = this.activeTopic();
    if (!g || !active) return null;
    const idx = g.topics.findIndex((t) => t.id === active.id);
    return idx < g.topics.length - 1 ? g.topics[idx + 1] : null;
  });

  /** Parse the markdown-ish content string into typed blocks for template rendering. */
  protected parseContent(
    content: string,
  ): Array<{ type: string; text?: string; rows?: string[][] }> {
    const blocks: Array<{ type: string; text?: string; rows?: string[][] }> = [];
    const lines = content.split('\n');
    let tableRows: string[][] = [];
    let inTable = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (inTable && tableRows.length > 0) {
          blocks.push({ type: 'table', rows: tableRows });
          tableRows = [];
          inTable = false;
        }
        continue;
      }

      // Table row
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes('---')) {
          inTable = true; // separator row — skip
          continue;
        }
        const cells = line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim().replace(/\*\*/g, ''));
        tableRows.push(cells);
        inTable = true;
        continue;
      }

      if (inTable) {
        blocks.push({ type: 'table', rows: tableRows });
        tableRows = [];
        inTable = false;
      }

      // Bold heading line (e.g. **Step 1 — ...**)
      if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
        blocks.push({ type: 'heading', text: line.slice(2, -2) });
        continue;
      }

      // Bullet list item
      if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({ type: 'list-item', text: line.slice(2).replace(/\*\*/g, '') });
        continue;
      }

      // Numbered list item
      if (/^\d+\.\s/.test(line)) {
        blocks.push({ type: 'list-item', text: line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '') });
        continue;
      }

      // Plain text / bold inline
      blocks.push({ type: 'text', text: line.replace(/\*\*/g, '') });
    }

    if (inTable && tableRows.length > 0) {
      blocks.push({ type: 'table', rows: tableRows });
    }

    return blocks.filter((b) => b.type !== 'text' || (b.text && b.text.trim().length > 0));
  }

  protected async copyCode(code: string, event: Event): Promise<void> {
    const btn = event.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(code);
      // find section id from nearest article
      const article = btn.closest('article');
      this.copiedId.set(article?.id ?? 'copied');
      setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      /* clipboard not available in all envs */
    }
  }
}
