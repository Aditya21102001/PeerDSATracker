import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { BackendStatus } from '../../core/services/backend-status';

interface RoadmapStep {
  number: number;
  title: string;
  problemCount: number;
  sampleProblems: Array<{ name: string; difficulty: 'Easy' | 'Medium' | 'Hard'; xp: number }>;
}

/**
 * Public landing and exploration page.
 * Accessible without authentication.
 *
 * It showcases:
 * - Free, instant-access Study Guides (DSA, Java, Spring Boot, Angular)
 * - The Curated 474 Striver A2Z Problem Roadmap
 * - AI Mock Interview & Proctored Challenge engine
 * - Career Matchmaker & Tech Openings
 * - Spaced repetition & Gamification
 *
 * While visitors browse, Render backend warms up silently behind the scenes.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [RouterLink],
  template: `
    <div class="welcome-shell">
      <!-- Public Top Navigation -->
      <header class="public-nav" aria-label="Main Navigation">
        <div class="nav-brand">
          <a routerLink="/" class="brand-link">
            <span class="brand-bolt">⚡</span>
            <span class="brand-text">PeerDSA</span>
          </a>
          <span class="brand-badge">Free &amp; Open</span>
        </div>

        <nav class="nav-links">
          <a routerLink="/study-guides" class="nav-link highlighted">
            <span class="nav-icon">📚</span> Study Guides
          </a>
          <a routerLink="/videos" class="nav-link highlighted">
            <span class="nav-icon">📺</span> Video Hub
          </a>
          <a href="#roadmap" class="nav-link">🗺️ 474 Roadmap</a>
          <a href="#ai-engine" class="nav-link">🤖 AI Interview</a>
          <a href="#career" class="nav-link">💼 Career Portal</a>
          <a routerLink="/guide" class="nav-link">📖 How it Works</a>
        </nav>

        <div class="nav-actions">
          <!-- Backend warm-up indicator (subtle and reassuring) -->
          <div class="server-status" [title]="backendStatusTooltip()">
            @if (backend.isReady()) {
              <span class="status-dot ready"></span>
              <span class="status-label">Cloud Online</span>
            } @else {
              <span class="status-dot warming"></span>
              <span class="status-label">Cloud Warming</span>
            }
          </div>

          @if (auth.isAuthenticated()) {
            <a routerLink="/dashboard" class="btn-cta">Dashboard ⚡</a>
          } @else {
            <a [routerLink]="['/signin']" [queryParams]="authQueryParams()" class="btn-signin">Sign in</a>
            <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn-cta">Start Free 🚀</a>
          }
        </div>
      </header>

      <!-- Auth Required Notification (when redirected from a protected route) -->
      @if (authRequired()) {
        <aside class="auth-notice" role="alert">
          <div class="auth-notice-content">
            <span class="notice-icon">👋</span>
            <div class="notice-text">
              <strong>Account required for private tracker</strong>
              <p>Sign in or create a free account to track your solves, streaks, and mock interviews. Meanwhile, all our Study Guides &amp; Roadmap below are 100% free to read without signing in!</p>
            </div>
            <div class="notice-actions">
              <a [routerLink]="['/signin']" [queryParams]="authQueryParams()" class="btn btn-sm btn-accent">Sign in</a>
              <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-sm btn-ghost">Create account</a>
            </div>
          </div>
        </aside>
      }

      <main id="main-content" tabindex="-1" class="welcome-main">
        <!-- Hero Section -->
        <section class="hero-section">
          <div class="hero-badge">
            <span class="badge-spark">⚡</span>
            <span>The Striver A2Z DSA &amp; AI Prep Engine</span>
          </div>

          <h1 class="hero-title">
            Conquer 474 Problems.<br>
            <span class="gradient-text">Ace Tech Interviews.</span>
          </h1>

          <p class="hero-sub">
            A comprehensive, gamified platform engineered for software developers. Track the entire Striver A2Z sheet,
            retain knowledge with automated spaced repetition, practice with live AI mock interviewers, and match your
            skills with top tech company openings.
          </p>

          <div class="hero-cta-group">
            @if (auth.isAuthenticated()) {
              <a routerLink="/dashboard" class="btn-hero-primary">
                ⚡ Go to My Dashboard
              </a>
            } @else {
              <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn-hero-primary">
                🚀 Start Grinding — It's 100% Free
              </a>
            }
            <a routerLink="/study-guides" class="btn-hero-secondary">
              📚 Free Study Guides
            </a>
            <a routerLink="/videos" class="btn-hero-secondary">
              📺 Embedded Video Hub (Free)
            </a>
            <a href="#roadmap" class="btn-hero-tertiary">
              🗺️ Explore 474 Problems
            </a>
          </div>

          <div class="hero-reassurance">
            <span>✓ No credit card required</span>
            <span>✓ Instant access</span>
            <span>✓ YouTube Video Hub &amp; Playlists</span>
            <span>✓ 4 Deep Study Guides</span>
            <span>✓ AI-Powered Test Simulator</span>
          </div>
        </section>

        <!-- Stats Counter Strip -->
        <dl class="stats-strip" aria-label="Platform Highlights">
          <div class="stat-item">
            <dt>474</dt>
            <dd>Curated Problems</dd>
          </div>
          <div class="stat-item">
            <dt>18</dt>
            <dd>Striver A2Z Steps</dd>
          </div>
          <div class="stat-item">
            <dt>4</dt>
            <dd>Complete Study Guides</dd>
          </div>
          <div class="stat-item">
            <dt>AI</dt>
            <dd>Mock Interview Engine</dd>
          </div>
          <div class="stat-item">
            <dt>0 ₹</dt>
            <dd>Free Forever</dd>
          </div>
        </dl>

        <!-- SECTION 1: Free Interactive Study Guides (Zero Auth Required) -->
        <section class="section study-guides-section">
          <div class="section-header">
            <span class="section-tag">Instant Knowledge</span>
            <h2>Free Interactive Study Guides</h2>
            <p class="section-lead">
              Comprehensive interview preparation notes on topics that matter most. Master core patterns, read production
              code snippets, and copy clean implementations — completely open to everyone without login.
            </p>
          </div>

          <div class="guides-grid">
            <article class="guide-card dsa">
              <div class="guide-card-top">
                <span class="guide-icon">🧮</span>
                <span class="guide-pill">Algorithms</span>
              </div>
              <h3>DSA Masterclass</h3>
              <p>Two Pointer, Sliding Window, Prefix Sum, BFS/DFS, Union-Find, Dijkstra, 0/1 Knapsack, LCS, and Big-O cheatsheet.</p>
              <ul class="guide-highlights">
                <li>• 4 Core Topics &amp; 10 Detailed Patterns</li>
                <li>• Proven Complexity &amp; Space Intuitions</li>
                <li>• Copy-ready TypeScript implementations</li>
              </ul>
              <a routerLink="/study-guides/dsa" class="guide-link">Read DSA Guide →</a>
            </article>

            <article class="guide-card java">
              <div class="guide-card-top">
                <span class="guide-icon">☕</span>
                <span class="guide-pill">Backend Core</span>
              </div>
              <h3>Java &amp; JVM Internals</h3>
              <p>SOLID principles, Collections selection matrix, Concurrency, volatile, ExecutorService, JVM memory model &amp; GC.</p>
              <ul class="guide-highlights">
                <li>• Thread safety &amp; Double-Checked Locking</li>
                <li>• Streams API &amp; Parallel Performance</li>
                <li>• Heap, Stack &amp; GC Tuning for Interviews</li>
              </ul>
              <a routerLink="/study-guides/java" class="guide-link">Read Java Guide →</a>
            </article>

            <article class="guide-card spring">
              <div class="guide-card-top">
                <span class="guide-icon">🍃</span>
                <span class="guide-pill">Frameworks</span>
              </div>
              <h3>Spring Boot Ecosystem</h3>
              <p>IoC Bean Lifecycle, Scopes, REST best practices, Spring Security 6 stateless JWT, Data JPA, and N+1 query fixes.</p>
              <ul class="guide-highlights">
                <li>• ControllerAdvice &amp; Global Error Handling</li>
                <li>• JOIN FETCH &amp; EntityGraph Optimization</li>
                <li>• Modern SecurityFilterChain Architecture</li>
              </ul>
              <a routerLink="/study-guides/spring-boot" class="guide-link">Read Spring Guide →</a>
            </article>

            <article class="guide-card angular">
              <div class="guide-card-top">
                <span class="guide-icon">🅰️</span>
                <span class="guide-pill">Modern Web</span>
              </div>
              <h3>Angular 19+ Architecture</h3>
              <p>Signals, computed, effects, signal inputs &amp; outputs, Standalone components, Zoneless reactivity, and RxJS interop.</p>
              <ul class="guide-highlights">
                <li>• Fine-grained reactivity without Zone.js</li>
                <li>• Input &amp; Output signals pattern</li>
                <li>• Clean component tree &amp; Performance</li>
              </ul>
              <a routerLink="/study-guides/angular" class="guide-link">Read Angular Guide →</a>
            </article>
          </div>

          <div class="guides-footer">
            <a routerLink="/study-guides" class="btn btn-outline">
              📚 View All Topics in Study Guide Hub →
            </a>
          </div>
        </section>

        <!-- SECTION 2: Curated 474 Striver A2Z Problem Roadmap Explorer -->
        <section id="roadmap" class="section roadmap-section">
          <div class="section-header">
            <span class="section-tag">Curated Syllabus</span>
            <h2>The 474 Striver A2Z Roadmap</h2>
            <p class="section-lead">
              Every single problem from the celebrated Striver A2Z DSA Course sheet, categorized across 18 progressive steps
              from basic programming to advanced dynamic programming and tries.
            </p>
          </div>

          <!-- Interactive Step Selector -->
          <div class="step-nav" role="tablist" aria-label="Roadmap Steps">
            @for (step of roadmapSteps; track step.number) {
              <button
                type="button"
                class="step-pill"
                [class.active]="selectedStep().number === step.number"
                (click)="selectStep(step)"
                role="tab"
                [attr.aria-selected]="selectedStep().number === step.number"
              >
                <span class="step-num">Step {{ step.number }}</span>
                <span class="step-title">{{ step.title }}</span>
              </button>
            }
          </div>

          <!-- Active Step Problems Preview -->
          <div class="step-detail-card card">
            <div class="step-card-header">
              <div>
                <h3>Step {{ selectedStep().number }}: {{ selectedStep().title }}</h3>
                <span class="step-count">{{ selectedStep().problemCount }} Hand-picked Problems in this Step</span>
              </div>
              <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-sm btn-accent">
                Start Tracking Step {{ selectedStep().number }} →
              </a>
            </div>

            <div class="problems-table">
              <div class="problem-row header">
                <span class="col-name">Problem Title</span>
                <span class="col-diff">Difficulty</span>
                <span class="col-xp">Reward</span>
                <span class="col-action">Action</span>
              </div>
              @for (p of selectedStep().sampleProblems; track p.name) {
                <div class="problem-row">
                  <span class="col-name">
                    <span class="problem-dot"></span>
                    {{ p.name }}
                  </span>
                  <span class="col-diff">
                    <span class="diff-tag" [class]="p.difficulty.toLowerCase()">{{ p.difficulty }}</span>
                  </span>
                  <span class="col-xp">+{{ p.xp }} XP</span>
                  <span class="col-action">
                    <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="table-link">Solve &amp; Track →</a>
                  </span>
                </div>
              }
            </div>

            <p class="step-hint">
              💡 Track all {{ selectedStep().problemCount }} problems with status markers (Solved, Attempted, Revisit), personal notes, code snippets, and automated revision scheduling.
            </p>
          </div>
        </section>

        <!-- SECTION 3: AI Interview & Proctored Challenge Engine -->
        <section id="ai-engine" class="section ai-section">
          <div class="section-header">
            <span class="section-tag">Next-Gen Prep</span>
            <h2>AI Mock Interview &amp; Proctor Engine</h2>
            <p class="section-lead">
              Don't just solve problems on paper. Experience realistic technical screening interviews and anti-cheat coding assessments powered by state-of-the-art AI.
            </p>
          </div>

          <div class="feature-two-col">
            <article class="feature-box card">
              <div class="feature-badge">🎙️ Interactive AI Interview</div>
              <h3>Real-Time DSA &amp; System Design Mock Sessions</h3>
              <p>
                Engage with our AI interviewer that listens to your explanation, asks probing follow-up questions on edge cases,
                evaluates time &amp; space complexity, and provides instant coaching on communication.
              </p>
              <ul class="feature-checks">
                <li>✓ Live voice recognition &amp; audio response synthesis</li>
                <li>✓ Dynamic algorithm problem generation by target company</li>
                <li>✓ Granular scorecards for code quality, communication, and speed</li>
              </ul>
              <div class="feature-action">
                <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-primary">
                  Try AI Mock Interview →
                </a>
              </div>
            </article>

            <article class="feature-box card">
              <div class="feature-badge">🛡️ Anti-Cheat Proctor Test</div>
              <h3>Company-Grade Timed Coding Assessments</h3>
              <p>
                Practice in realistic timed exam environments with automatic test case validation, multi-language editor
                (Java, C++, Python, TS), and tab-switch monitoring to simulate real recruitment rounds.
              </p>
              <ul class="feature-checks">
                <li>✓ In-browser code editor with instant test suite execution</li>
                <li>✓ Violation detection &amp; comprehensive assessment scorecards</li>
                <li>✓ Benchmark your performance against peer averages</li>
              </ul>
              <div class="feature-action">
                <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-primary">
                  Practice Proctored Tests →
                </a>
              </div>
            </article>
          </div>
        </section>

        <!-- SECTION 4: Realtime Career Matchmaker -->
        <section id="career" class="section career-section">
          <div class="section-header">
            <span class="section-tag">Get Hired</span>
            <h2>Naukri-Grade Tech Career Matchmaker</h2>
            <p class="section-lead">
              Our 1-click career portal dynamically matches verified openings at top companies (TCS, Infosys, Amazon, startups)
              against your real DSA solves, certifications, and experience.
            </p>
          </div>

          <div class="career-preview-grid">
            <div class="job-mini-card card">
              <div class="job-top">
                <div class="job-avatar">TA</div>
                <div>
                  <h3>Tata Consultancy Services (TCS)</h3>
                  <span class="job-role">Systems Engineer / Java Developer</span>
                </div>
                <span class="match-badge">90% Match</span>
              </div>
              <div class="job-pills">
                <span>📍 Pune / Bengaluru</span>
                <span>💰 ₹6 - ₹12 LPA</span>
                <span>⚡ Java, Spring Boot, DSA</span>
              </div>
            </div>

            <div class="job-mini-card card">
              <div class="job-top">
                <div class="job-avatar amz">AM</div>
                <div>
                  <h3>Amazon Web Services</h3>
                  <span class="job-role">Software Development Engineer I</span>
                </div>
                <span class="match-badge">85% Match</span>
              </div>
              <div class="job-pills">
                <span>📍 Hyderabad / Gurugram</span>
                <span>💰 ₹18 - ₹28 LPA</span>
                <span>⚡ Algorithms, Trees, Graphs</span>
              </div>
            </div>
          </div>

          <div class="career-footer">
            <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-accent">
              Unlock Career Matchmaker &amp; Apply in 1-Click →
            </a>
          </div>
        </section>

        <!-- SECTION 5: Spaced Repetition & Gamification -->
        <section class="section gamification-section">
          <div class="section-header">
            <span class="section-tag">Habit Formation</span>
            <h2>Never Forget a Solution Again</h2>
            <p class="section-lead">
              The biggest challenge in DSA is forgetting problems you solved weeks ago. Our spaced repetition engine
              surfaces problems on an optimal interval ladder (1, 3, 7, 21, 60 days) so you retain patterns forever.
            </p>
          </div>

          <div class="gamification-grid">
            <div class="g-card card">
              <span class="g-icon">🔥</span>
              <h3>Daily Streaks &amp; Heatmaps</h3>
              <p>Solve at least one problem daily to keep your streak alive. Visualize your dedication with an interactive GitHub-style contribution matrix.</p>
            </div>
            <div class="g-card card">
              <span class="g-icon">⭐</span>
              <h3>XP &amp; Level Milestones</h3>
              <p>Earn 10 XP for Easy, 20 XP for Medium, 40 XP for Hard. Level up every 500 XP and unlock 13 prestigious badges.</p>
            </div>
            <div class="g-card card">
              <span class="g-icon">🔁</span>
              <h3>Automated Spaced Repetition</h3>
              <p>Add tricky problems to your revision deck with 1 click. The system alerts you exactly when it's time to refresh your memory.</p>
            </div>
            <div class="g-card card">
              <span class="g-icon">🏆</span>
              <h3>Peer Competitions &amp; Leaderboards</h3>
              <p>Follow your friends, build study circles, and see who's climbing the global and private peer leaderboards.</p>
            </div>
          </div>
        </section>

        <!-- Final Closer CTA -->
        <section class="section closer-section">
          <div class="closer-card card">
            <span class="closer-badge">Ready to conquer the grind?</span>
            <h2>Join hundreds of peers preparing smarter today.</h2>
            <p>
              Sign up in 10 seconds. All 474 problems, AI interview practice, study guides, and streak tracking
              are ready for your first session.
            </p>
            <div class="closer-actions">
              <a [routerLink]="['/signup']" [queryParams]="authQueryParams()" class="btn btn-lg btn-accent">
                🚀 Create Your Free Account
              </a>
              <a routerLink="/study-guides" class="btn btn-lg btn-ghost">
                📚 Continue Reading Study Guides
              </a>
            </div>
            <p class="closer-foot">
              Already have an account?
              <a [routerLink]="['/signin']" [queryParams]="authQueryParams()">Sign in here</a>
            </p>
          </div>
        </section>
      </main>
    </div>
  `,
  styleUrl: './welcome-page.scss',
})
export class WelcomePage {
  private readonly route = inject(ActivatedRoute);
  protected readonly backend = inject(BackendStatus);
  protected readonly auth = inject(AuthStore);

  /** Whether the visitor was redirected here because auth is required */
  protected readonly authRequired = computed(() => {
    const p = this.route.snapshot.queryParamMap;
    return p.get('authRequired') === '1' || p.get('authRequired') === 'true';
  });

  /** Preserves attempted URL for redirection after sign in */
  protected readonly redirectTarget = computed(() => {
    return this.route.snapshot.queryParamMap.get('redirect') ?? null;
  });

  protected readonly authQueryParams = computed(() => {
    const target = this.redirectTarget();
    return target ? { redirect: target } : {};
  });

  protected readonly backendStatusTooltip = computed(() => {
    if (this.backend.isReady()) {
      return 'Cloud backend is warm and ready to serve requests with 0 latency.';
    }
    return 'Cloud backend is currently waking up in the background. It will be ready shortly!';
  });

  /** Curated roadmap sample steps for the interactive explorer */
  protected readonly roadmapSteps: RoadmapStep[] = [
    {
      number: 1,
      title: 'Learn the Basics',
      problemCount: 31,
      sampleProblems: [
        { name: 'Count Digits in a Number', difficulty: 'Easy', xp: 10 },
        { name: 'Reverse a Number & Check Palindrome', difficulty: 'Easy', xp: 10 },
        { name: 'GCD / HCF of Two Numbers (Euclidean)', difficulty: 'Easy', xp: 10 },
        { name: 'Check for Prime in O(sqrt(N))', difficulty: 'Easy', xp: 10 },
      ],
    },
    {
      number: 3,
      title: 'Solve Problems on Arrays',
      problemCount: 40,
      sampleProblems: [
        { name: 'Two Sum (Optimal Hash Map)', difficulty: 'Easy', xp: 10 },
        { name: "Maximum Subarray Sum (Kadane's Algorithm)", difficulty: 'Medium', xp: 20 },
        { name: 'Sort an Array of 0s, 1s, and 2s (Dutch Flag)', difficulty: 'Medium', xp: 20 },
        { name: '3-Sum Problem (Sorted Two Pointers)', difficulty: 'Medium', xp: 20 },
        { name: 'Next Permutation (Dictionary Order)', difficulty: 'Medium', xp: 20 },
      ],
    },
    {
      number: 4,
      title: 'Binary Search (1D, 2D, Answer Space)',
      problemCount: 32,
      sampleProblems: [
        { name: 'Binary Search in Sorted Array', difficulty: 'Easy', xp: 10 },
        { name: 'Search in Rotated Sorted Array', difficulty: 'Medium', xp: 20 },
        { name: 'Find Minimum in Rotated Sorted Array', difficulty: 'Medium', xp: 20 },
        { name: 'Koko Eating Bananas (Search on Answer)', difficulty: 'Medium', xp: 20 },
        { name: 'Book Allocation Problem (Search Space)', difficulty: 'Hard', xp: 40 },
      ],
    },
    {
      number: 6,
      title: 'Learn LinkedList (Single, Double, Hard)',
      problemCount: 31,
      sampleProblems: [
        { name: 'Reverse a Singly Linked List', difficulty: 'Easy', xp: 10 },
        { name: 'Detect Cycle in LL (Floyd Tortoise & Hare)', difficulty: 'Easy', xp: 10 },
        { name: 'Remove Nth Node from End of List', difficulty: 'Medium', xp: 20 },
        { name: 'Flattening of a Linked List', difficulty: 'Hard', xp: 40 },
        { name: 'LRU Cache Design (Doubly LL + Hash Map)', difficulty: 'Hard', xp: 40 },
      ],
    },
    {
      number: 9,
      title: 'Stack and Queues',
      problemCount: 30,
      sampleProblems: [
        { name: 'Valid Parentheses String', difficulty: 'Easy', xp: 10 },
        { name: 'Next Greater Element (Monotonic Stack)', difficulty: 'Medium', xp: 20 },
        { name: 'Trapping Rainwater (Two Pointers & Stack)', difficulty: 'Hard', xp: 40 },
        { name: 'Largest Rectangle in Histogram', difficulty: 'Hard', xp: 40 },
      ],
    },
    {
      number: 13,
      title: 'Binary Trees (Traversals & Views)',
      problemCount: 35,
      sampleProblems: [
        { name: 'Level Order Traversal (BFS Queue)', difficulty: 'Easy', xp: 10 },
        { name: 'Maximum Depth & Diameter of Binary Tree', difficulty: 'Easy', xp: 10 },
        { name: 'Lowest Common Ancestor (LCA) in BT', difficulty: 'Medium', xp: 20 },
        { name: 'Binary Tree Maximum Path Sum', difficulty: 'Hard', xp: 40 },
      ],
    },
    {
      number: 15,
      title: 'Graphs (BFS, DFS, Shortest Path, MST)',
      problemCount: 54,
      sampleProblems: [
        { name: 'Number of Provinces (Connected Components)', difficulty: 'Medium', xp: 20 },
        { name: 'Rotten Oranges (Multi-source BFS)', difficulty: 'Medium', xp: 20 },
        { name: "Dijkstra's Shortest Path Algorithm (Min Heap)", difficulty: 'Medium', xp: 20 },
        { name: 'Word Ladder I (Shortest Transformation)', difficulty: 'Hard', xp: 40 },
        { name: 'Disjoint Set (Union-Find with Rank & Path)', difficulty: 'Hard', xp: 40 },
      ],
    },
    {
      number: 16,
      title: 'Dynamic Programming (1D, 2D, MCM)',
      problemCount: 56,
      sampleProblems: [
        { name: 'Climbing Stairs & Frog Jump', difficulty: 'Easy', xp: 10 },
        { name: '0/1 Knapsack Problem (Space-Optimized)', difficulty: 'Medium', xp: 20 },
        { name: 'Longest Common Subsequence (LCS)', difficulty: 'Medium', xp: 20 },
        { name: 'Edit Distance (Levenshtein Distance)', difficulty: 'Hard', xp: 40 },
        { name: 'Matrix Chain Multiplication (MCM Partition)', difficulty: 'Hard', xp: 40 },
      ],
    },
  ];

  protected readonly selectedStep = signal<RoadmapStep>(this.roadmapSteps[1]); // default to Arrays (Step 3)

  protected selectStep(step: RoadmapStep): void {
    this.selectedStep.set(step);
  }
}
