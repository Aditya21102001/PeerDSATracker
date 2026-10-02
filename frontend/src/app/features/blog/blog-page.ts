import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { marked } from 'marked';
import { forkJoin } from 'rxjs';
import { BlogPost, BlogPostRequest, BlogPostStatus } from '../../core/models/blog.models';
import { BlogService } from '../../core/services/blog.service';
import { Spinner } from '../../shared/spinner';

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
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <main id="main-content" tabindex="-1" class="blog">
      <header>
        <div>
          <div class="breadcrumb">
            <a routerLink="/dashboard">Dashboard</a>
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
            <button type="button" class="btn btn-quiet" (click)="selected.set(null)">← Back to all subjects</button>
            <div class="reader-meta-pills">
              <span class="read-time">{{ readTime(article.content) }}</span>
              @if (article.mine) {
                <span class="status" [class.draft]="article.status === 'DRAFT'">{{ article.status === 'DRAFT' ? 'Draft' : 'Published' }}</span>
              }
            </div>
          </div>

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
              <button type="button" class="subject-nav-card prev" (click)="selected.set(prev)">
                <span class="nav-direction">← Previous in {{ article.subject }}</span>
                <span class="nav-title">{{ prev.title }}</span>
              </button>
            } @else {
              <div class="subject-nav-spacer"></div>
            }
            @if (nextInSubject(); as next) {
              <button type="button" class="subject-nav-card next" (click)="selected.set(next)">
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
                  <div class="more-card" (click)="selected.set(item)">
                    <span class="more-title">{{ item.title }}</span>
                    <span class="more-meta">{{ readTime(item.content) }}</span>
                  </div>
                }
              </div>
            </section>
          }
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
                    <article class="article-card" (click)="selected.set(article)">
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
                        <button type="button" class="btn btn-quiet btn-sm" (click)="$event.stopPropagation(); selected.set(article)">Read →</button>
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
    </main>
  `,
  styleUrl: './blog-page.scss',
})
export class BlogPage {
  private readonly blogs = inject(BlogService);
  private readonly sanitizer = inject(DomSanitizer);

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
      const haystack = `${post.title} ${post.subject} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase();
      return matchesSubject && matchesDomain && (!needle || haystack.includes(needle));
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
      const html = marked.parse(post.content, { async: false, gfm: true, breaks: true }) as string;
      return this.sanitizer.bypassSecurityTrustHtml(html);
    } catch {
      return post.content;
    }
  });

  protected readonly renderedDraft = computed<SafeHtml>(() => {
    if (!this.draft.content) return '';
    try {
      const html = marked.parse(this.draft.content, { async: false, gfm: true, breaks: true }) as string;
      return this.sanitizer.bypassSecurityTrustHtml(html);
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

  protected selectDomain(domain: string): void {
    this.selectedDomain.set(domain);
    this.subject = '';
    this.selected.set(null);
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
    this.selected.set(null);
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
        this.selected.set(null);
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
    this.selected.set(null);
  }

  protected filterByTag(tag: string): void {
    this.query = tag;
    this.selected.set(null);
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

  protected date(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  }

  private load(): void {
    forkJoin({ published: this.blogs.published(), mine: this.blogs.mine() }).subscribe({
      next: ({ published, mine }) => {
        const byId = new Map(published.map((post) => [post.id, post]));
        mine.forEach((post) => byId.set(post.id, post));
        this.posts.set(
          [...byId.values()].sort((a, b) =>
            (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt),
          ),
        );
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
