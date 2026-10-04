import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BlogPost, BlogPostStatus } from '../../core/models/blog.models';
import { BlogService } from '../../core/services/blog.service';
import { BlogPage } from './blog-page';

describe('BlogPage — Subject-wise Articles & Markdown Reader', () => {
  let fixture: ComponentFixture<BlogPage>;
  let component: BlogPage;

  const mockPosts: BlogPost[] = [
    {
      id: 1,
      authorId: 10,
      title: 'Thread Synchronization in Java',
      subject: 'Java Concurrency & Threads',
      excerpt: 'Understanding synchronized, volatile, and locks.',
      content: '# Thread Synchronization\n\n```java\nsynchronized(lock) {}\n```\nKey takeaways.',
      tags: ['java', 'threads'],
      status: 'PUBLISHED' as BlogPostStatus,
      authorName: 'Aditya',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
      publishedAt: '2026-10-01T10:00:00Z',
      mine: true,
    },
    {
      id: 2,
      authorId: 10,
      title: 'Spring Security Filter Chain Deep Dive',
      subject: 'Spring Security & Auth',
      excerpt: 'How SecurityFilterChain and filters operate.',
      content: '# Spring Security\n\nExplanation of SecurityFilterChain.',
      tags: ['spring-boot', 'security'],
      status: 'PUBLISHED' as BlogPostStatus,
      authorName: 'Aditya',
      createdAt: '2026-10-01T11:00:00Z',
      updatedAt: '2026-10-01T11:00:00Z',
      publishedAt: '2026-10-01T11:00:00Z',
      mine: false,
    },
  ];

  const fakeBlogService = {
    published: () => of(mockPosts),
    mine: () => of(mockPosts.filter((p) => p.mine)),
    create: () => of(mockPosts[0]),
    update: () => of(mockPosts[0]),
    delete: () => of(void 0),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlogPage],
      providers: [
        provideRouter([]),
        { provide: BlogService, useValue: fakeBlogService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BlogPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders subject groups and articles', () => {
    const el = fixture.nativeElement as HTMLElement;
    const groups = el.querySelectorAll('.subject-group');
    expect(groups.length).toBe(2);

    const title = el.querySelector('.subject-group-title h2');
    expect(title?.textContent?.trim()).toContain('Java Concurrency & Threads');
  });

  it('filters articles when a domain tab is clicked', () => {
    const el = fixture.nativeElement as HTMLElement;
    const domainTabs = el.querySelectorAll<HTMLButtonElement>('.domain-tab');
    expect(domainTabs.length).toBeGreaterThan(1);

    // Find and click 'Java' domain tab
    const javaTab = Array.from(domainTabs).find((btn) => btn.textContent?.includes('Java'));
    expect(javaTab).toBeDefined();
    javaTab?.click();
    fixture.detectChanges();

    const groups = el.querySelectorAll('.subject-group');
    expect(groups.length).toBe(1);
    expect(groups[0].textContent).toContain('Java Concurrency & Threads');
  });

  it('renders markdown in reader view when an article is selected', () => {
    component['selected'].set(mockPosts[0]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const reader = el.querySelector('.reader');
    expect(reader).not.toBeNull();

    const markdownBody = el.querySelector('.markdown-body');
    expect(markdownBody?.innerHTML).toContain('<h1');
    expect(markdownBody?.innerHTML).toContain('<pre><code');
  });

  it('renders Reading Coach HUD bar when an article is selected', () => {
    component['selectArticle'](mockPosts[0]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const hud = el.querySelector('.reading-hud-bar');
    expect(hud).not.toBeNull();
    expect(hud?.textContent).toContain('Retention');
    expect(hud?.textContent).toContain('WPM');
  });

  it('toggles coach drawer and displays metrics and scratchpad', () => {
    component['selectArticle'](mockPosts[0]);
    component['coach'].setCoachDrawerOpen(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const drawer = el.querySelector('.coach-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('Active Reading Coach & Scratchpad');

    const textarea = el.querySelector<HTMLTextAreaElement>('.scratchpad-textarea');
    expect(textarea).not.toBeNull();
  });

  it('inserts 1-Line summary template into notes when triggered', () => {
    component['selectArticle'](mockPosts[0]);
    component['applyArticleCoachAction']('insert_summary');
    fixture.detectChanges();

    expect(component['coach'].articleNotes()).toContain('1-Line Core Concept');
    expect(component['coach'].isCoachDrawerOpen()).toBe(true);
  });

  it('displays alert banner when SKIMMING or PASSIVE_READING is detected', () => {
    component['selectArticle'](mockPosts[0]);
    component['coach'].setPatternForTesting('SKIMMING');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('.article-alert-banner');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Skimming Alert');
  });

  it('shows eye rest overlay when Pomodoro break timer is active', () => {
    component['selectArticle'](mockPosts[0]);
    component['coach'].startBreakTimer(60);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const overlay = el.querySelector('.reader-rest-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Time to Rest Your Eyes');
  });

  it('triggers manual topic quiz when Quick Quiz button is clicked', () => {
    component['selectArticle'](mockPosts[0]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const quickQuizBtn = el.querySelector<HTMLButtonElement>('#blog-hud-quiz-btn');
    expect(quickQuizBtn).not.toBeNull();

    quickQuizBtn?.click();
    fixture.detectChanges();

    expect(component['quizService'].isOpen()).toBe(true);
    expect(component['quizService'].activeQuestion()).not.toBeNull();
    expect(component['quizService'].activeQuestion()?.topic).toBe('Java');
  });

  it('saves takeaway from quiz into active reading scratchpad notes', () => {
    component['selectArticle'](mockPosts[0]);
    component['handleQuizTakeaway']('\n\n### 💡 Checkpoint Takeaway: volatile keyword guarantees happens-before visibility.');

    expect(component['coach'].articleNotes()).toContain('Checkpoint Takeaway: volatile keyword guarantees happens-before visibility.');
  });
});

