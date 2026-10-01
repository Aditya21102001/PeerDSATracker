import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

/** Subject-organised study articles with an author-only editor for drafts and published posts. */
@Component({
  selector: 'app-blog-page',
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <main id="main-content" tabindex="-1" class="blog">
      <header>
        <div>
          <h1>Study Articles</h1>
          <p class="muted">Share clear notes, patterns, and lessons across every subject.</p>
        </div>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/notes">Notes</a>
        </nav>
      </header>

      <section class="toolbar" aria-label="Article filters">
        <label class="search">
          <span class="sr-only">Search articles</span>
          <input type="search" [(ngModel)]="query" placeholder="Search articles, subjects, or tags" />
        </label>
        <label class="subject-filter">
          <span class="sr-only">Filter by subject</span>
          <select [(ngModel)]="subject">
            <option value="">All subjects</option>
            @for (item of subjects(); track item) {
              <option [value]="item">{{ item }}</option>
            }
          </select>
        </label>
        <button type="button" class="btn" (click)="openNew()">Write article</button>
      </section>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (editorOpen()) {
        <section class="editor" aria-labelledby="editor-title">
          <div class="editor-heading">
            <div>
              <h2 id="editor-title">{{ editing() ? 'Edit article' : 'New article' }}</h2>
              <p class="muted">Drafts are private until you publish them.</p>
            </div>
            <button type="button" class="btn btn-quiet" (click)="closeEditor()">Close</button>
          </div>

          <form (ngSubmit)="save()">
            <div class="form-grid">
              <label class="field wide">
                <span>Title</span>
                <input name="title" [(ngModel)]="draft.title" required maxlength="180" placeholder="e.g. The two-pointer technique" />
              </label>
              <label class="field">
                <span>Subject</span>
                <input name="subject" [(ngModel)]="draft.subject" required maxlength="80" placeholder="Arrays, DBMS, OS..." />
              </label>
              <label class="field">
                <span>Visibility</span>
                <select name="status" [(ngModel)]="draft.status">
                  <option value="DRAFT">Save as draft</option>
                  <option value="PUBLISHED">Publish for everyone</option>
                </select>
              </label>
              <label class="field wide">
                <span>Short description</span>
                <textarea name="excerpt" [(ngModel)]="draft.excerpt" maxlength="500" rows="2" placeholder="What will readers learn?"></textarea>
              </label>
              <label class="field wide">
                <span>Article</span>
                <textarea name="content" [(ngModel)]="draft.content" required maxlength="30000" rows="12" placeholder="Write the explanation, examples, and takeaways..."></textarea>
              </label>
              <label class="field wide">
                <span>Tags</span>
                <input name="tags" [(ngModel)]="draft.tags" maxlength="280" placeholder="two pointers, arrays, interview" />
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
        <app-spinner label="Loading articles..." />
      } @else if (selected(); as article) {
        <article class="reader">
          <div class="reader-topline">
            <button type="button" class="btn btn-quiet" (click)="selected.set(null)">Back to articles</button>
            @if (article.mine) {
              <span class="status" [class.draft]="article.status === 'DRAFT'">{{ article.status === 'DRAFT' ? 'Draft' : 'Published' }}</span>
            }
          </div>
          <p class="subject">{{ article.subject }}</p>
          <h2>{{ article.title }}</h2>
          <p class="byline">By {{ article.authorName }} - {{ date(article.publishedAt || article.updatedAt) }}</p>
          @if (article.excerpt) { <p class="lead">{{ article.excerpt }}</p> }
          <div class="article-body">{{ article.content }}</div>
          <div class="reader-footer">
            <div class="tags" aria-label="Tags">
              @for (tag of article.tags; track tag) { <span>{{ tag }}</span> }
            </div>
            @if (article.mine) {
              <div class="article-actions">
                <button type="button" class="btn btn-ghost" (click)="openEdit(article)">Edit</button>
                <button type="button" class="btn btn-danger" (click)="remove(article)">Delete</button>
              </div>
            }
          </div>
        </article>
      } @else {
        <section class="articles" aria-live="polite">
          <p class="result-count">{{ filtered().length }} article(s)</p>
          <div class="article-grid stagger">
            @for (article of filtered(); track article.id) {
              <article class="article-card">
                <div class="card-meta">
                  <span class="subject">{{ article.subject }}</span>
                  @if (article.mine) {
                    <span class="status" [class.draft]="article.status === 'DRAFT'">{{ article.status === 'DRAFT' ? 'Draft' : 'Mine' }}</span>
                  }
                </div>
                <h2>{{ article.title }}</h2>
                <p class="excerpt">{{ article.excerpt || excerpt(article.content) }}</p>
                <div class="tags" aria-label="Tags">
                  @for (tag of article.tags; track tag) { <span>{{ tag }}</span> }
                </div>
                <footer>
                  <span>By {{ article.authorName }} - {{ date(article.publishedAt || article.updatedAt) }}</span>
                  <button type="button" class="btn btn-quiet" (click)="selected.set(article)">Read</button>
                </footer>
              </article>
            } @empty {
              <div class="empty">No articles match these filters. Be the first to write one.</div>
            }
          </div>
        </section>
      }
    </main>
  `,
  styleUrl: './blog-page.scss',
})
export class BlogPage {
  private readonly blogs = inject(BlogService);

  protected readonly posts = signal<BlogPost[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<BlogPost | null>(null);
  protected readonly selected = signal<BlogPost | null>(null);
  protected query = '';
  protected subject = '';
  protected draft: EditorDraft = this.emptyDraft();

  protected readonly subjects = computed(() =>
    [...new Set(this.posts().map((post) => post.subject))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly filtered = computed(() => {
    const needle = this.query.trim().toLocaleLowerCase();
    return this.posts().filter((post) => {
      const matchesSubject = !this.subject || post.subject === this.subject;
      const haystack = `${post.title} ${post.subject} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase();
      return matchesSubject && (!needle || haystack.includes(needle));
    });
  });

  constructor() { this.load(); }

  protected openNew(): void {
    this.editing.set(null);
    this.draft = this.emptyDraft();
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(post: BlogPost): void {
    this.editing.set(post);
    this.draft = { title: post.title, subject: post.subject, excerpt: post.excerpt, content: post.content, tags: post.tags.join(', '), status: post.status };
    this.selected.set(null);
    this.error.set(null);
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
      title: this.draft.title.trim(), subject: this.draft.subject.trim(), excerpt: this.draft.excerpt.trim(), content: this.draft.content.trim(),
      tags: this.draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean), status: this.draft.status,
    };
    const editing = this.editing();
    const request = editing ? this.blogs.update(editing.id, payload) : this.blogs.create(payload);
    request.subscribe({
      next: (post) => {
        this.posts.update((items) => [post, ...items.filter((item) => item.id !== post.id)]);
        this.closeEditor();
        this.saving.set(false);
      },
      error: () => { this.error.set('Could not save this article. Please try again.'); this.saving.set(false); },
    });
  }

  protected remove(post: BlogPost): void {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    this.blogs.delete(post.id).subscribe({
      next: () => { this.posts.update((items) => items.filter((item) => item.id !== post.id)); this.selected.set(null); },
      error: () => this.error.set('Could not delete this article. Please try again.'),
    });
  }

  protected excerpt(content: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}...` : flat;
  }

  protected date(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  }

  private load(): void {
    forkJoin({ published: this.blogs.published(), mine: this.blogs.mine() }).subscribe({
      next: ({ published, mine }) => {
        const byId = new Map(published.map((post) => [post.id, post]));
        mine.forEach((post) => byId.set(post.id, post));
        this.posts.set([...byId.values()].sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt)));
        this.loading.set(false);
      },
      error: () => { this.error.set('Could not load articles. Please refresh and try again.'); this.loading.set(false); },
    });
  }

  private emptyDraft(): EditorDraft {
    return { title: '', subject: '', excerpt: '', content: '', tags: '', status: 'PUBLISHED' };
  }
}
