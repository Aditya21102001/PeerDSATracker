import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  LanguageOption,
  Problem,
  RunResult,
  SubmissionView,
  SubmitResultView,
  TestCaseView,
} from '../../core/models/api.models';
import { CodeService } from '../../core/services/code.service';
import { CodeMirror } from '../../shared/code-mirror/code-mirror';
import { Spinner } from '../../shared/spinner';

/**
 * The in-app code editor for one problem, routed as code/:problemId with problemId supplied by
 * component input binding. A LeetCode-style split: the problem and its resources on the left, a
 * CodeMirror editor plus a test case and submissions console on the right.
 *
 * Code execution proxies to Piston's sandbox via the analytics service.
 * "Run" executes against the active testcase or custom stdin.
 * "Submit" runs code against all problem test cases, saves a submission record, and
 * automatically transitions the problem status to SOLVED with XP and streak updates upon ACCEPTED.
 */
@Component({
  selector: 'app-code-editor',
  imports: [FormsModule, RouterLink, Spinner, CodeMirror, DatePipe],
  template: `
    <main id="main-content" tabindex="-1" class="code">
      <header>
        <a routerLink="/sheet">← Sheet</a>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
        </nav>
      </header>

      <div class="workspace" [style.--left-col]="leftWidth() + 'px'">
        <section class="problem-pane" aria-label="Problem">
          @if (problem(); as p) {
            <h1>{{ p.title }}</h1>
            <div class="tags">
              <span class="pill" [attr.data-level]="p.difficulty">{{ p.difficulty }}</span>
              <span class="step">Step {{ p.stepNo }} · {{ p.subStepTitle }}</span>
              @if (p.status === 'SOLVED') {
                <span class="pill solved-pill">✓ SOLVED</span>
              }
            </div>

            <div class="resources">
              @if (p.leetcodeUrl) {
                <a [href]="p.leetcodeUrl" target="_blank" rel="noopener">LeetCode ↗</a>
              }
              @if (p.articleUrl) {
                <a [href]="p.articleUrl" target="_blank" rel="noopener">Article ↗</a>
              }
              @if (p.youtubeUrl) {
                <a [href]="p.youtubeUrl" target="_blank" rel="noopener">Video ↗</a>
              }
              <a [routerLink]="['/notes', problemId()]">Note</a>
            </div>

            <p class="hint">
              The full statement, constraints and examples live on the linked problem. Write, test,
              and submit your solution on the right.
            </p>
          } @else {
            <app-spinner label="Loading problem…" />
          }
        </section>

        <div
          class="divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          tabindex="0"
          (pointerdown)="startDrag($event)"
          (pointermove)="onDrag($event)"
          (pointerup)="endDrag($event)"
          (keydown)="onDividerKey($event)"
        ></div>

        <section class="editor-pane" aria-label="Editor">
          <div class="toolbar">
            <label for="lang" class="sr-only">Language</label>
            <select id="lang" [ngModel]="language()" (ngModelChange)="onLanguageChange($event)" name="language">
              @for (l of languages(); track l.id) {
                <option [value]="l.id">{{ l.label }}</option>
              }
            </select>

            <button
              type="button"
              class="btn btn-ghost"
              (click)="run()"
              [disabled]="running() || submitting() || !language()"
            >
              {{ running() ? 'Running…' : '▶ Run' }}
            </button>

            <button
              type="button"
              class="btn btn-submit"
              (click)="submit()"
              [disabled]="running() || submitting() || !language()"
            >
              {{ submitting() ? 'Submitting…' : '✓ Submit' }}
            </button>

            <button
              type="button"
              class="btn btn-ghost"
              (click)="save()"
              [disabled]="saving() || !language()"
            >
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>

            @if (status()) {
              <span class="status" role="status">{{ status() }}</span>
            }
          </div>

          <div class="editor-host">
            <app-code-mirror [(value)]="source" [language]="editorMode()" />
          </div>

          <div class="console">
            <div class="console-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                class="tab-btn"
                [class.active]="activeTab() === 'input'"
                [attr.aria-selected]="activeTab() === 'input'"
                (click)="activeTab.set('input')"
              >
                Testcase
              </button>
              <button
                type="button"
                role="tab"
                class="tab-btn"
                [class.active]="activeTab() === 'output'"
                [attr.aria-selected]="activeTab() === 'output'"
                (click)="activeTab.set('output')"
              >
                Run Output
                @if (result()) {
                  <span class="dot" [class.bad]="result()?.exitCode !== 0"></span>
                }
              </button>
              <button
                type="button"
                role="tab"
                class="tab-btn"
                [class.active]="activeTab() === 'submissions'"
                [attr.aria-selected]="activeTab() === 'submissions'"
                (click)="activeTab.set('submissions')"
              >
                Submissions
                @if (submissions().length > 0) {
                  <span class="count-badge">{{ submissions().length }}</span>
                }
              </button>
            </div>

            <div class="console-body">
              @if (activeTab() === 'input') {
                <div class="testcase-pane">
                  @if (testCases().length > 0) {
                    <div class="case-chips">
                      @for (tc of testCases(); track tc.id; let idx = $index) {
                        <button
                          type="button"
                          class="chip-btn"
                          [class.active]="activeTestCaseIndex() === idx"
                          (click)="selectTestCase(idx)"
                        >
                          Case {{ idx + 1 }}
                        </button>
                      }
                      <button
                        type="button"
                        class="chip-btn"
                        [class.active]="activeTestCaseIndex() === -1"
                        (click)="selectCustomInput()"
                      >
                        Custom Input
                      </button>
                    </div>

                    @if (currentExpectedOutput()) {
                      <div class="expected-box">
                        <span class="pane-label">Expected Output</span>
                        <pre class="code-preview">{{ currentExpectedOutput() }}</pre>
                      </div>
                    }
                  }

                  <div class="io">
                    <label for="stdin" class="pane-label">Input (stdin)</label>
                    <textarea
                      id="stdin"
                      name="stdin"
                      spellcheck="false"
                      [(ngModel)]="stdin"
                      placeholder="Standard input provided to your program..."
                    ></textarea>
                  </div>
                </div>
              } @else if (activeTab() === 'output') {
                <div class="io output" aria-live="polite">
                  @if (running()) {
                    <app-spinner inline label="Running in the sandbox…" />
                  } @else if (result(); as r) {
                    @if (r.error) {
                      <p class="run-error" role="alert">{{ r.error }}</p>
                    }
                    @if (r.compileOutput) {
                      <div class="block err">
                        <span class="block-label">Compile errors</span>
                        <pre>{{ r.compileOutput }}</pre>
                      </div>
                    }
                    @if (r.stdout) {
                      <div class="block">
                        <span class="block-label">stdout</span>
                        <pre>{{ r.stdout }}</pre>
                      </div>
                    }
                    @if (r.stderr) {
                      <div class="block err">
                        <span class="block-label">stderr</span>
                        <pre>{{ r.stderr }}</pre>
                      </div>
                    }
                    @if (r.ran) {
                      <p class="exit" [class.bad]="r.exitCode !== 0">
                        Exit code {{ r.exitCode }}@if (r.signal) { · signal {{ r.signal }} }
                        @if (r.version) { · {{ r.language }} {{ r.version }} }
                      </p>
                      @if (!r.stdout && !r.stderr && !r.compileOutput) {
                        <p class="muted">Ran with no output.</p>
                      }
                    }
                  } @else {
                    <p class="muted">
                      Click ▶ Run to execute your code with the selected testcase or stdin.
                    </p>
                  }
                </div>
              } @else if (activeTab() === 'submissions') {
                <div class="submissions-pane">
                  @if (submitting()) {
                    <app-spinner inline label="Evaluating against test cases…" />
                  } @else if (submitResult(); as res) {
                    <div class="submission-banner" [class.success]="res.accepted" [class.fail]="!res.accepted">
                      <div class="banner-header">
                        <span class="verdict-tag" [attr.data-verdict]="res.submission.verdict">
                          {{ res.submission.verdict }}
                        </span>
                        <span class="pass-count">
                          {{ res.submission.passedTestCases }} / {{ res.submission.totalTestCases }} test cases passed
                        </span>
                        @if (res.newlySolved) {
                          <span class="xp-badge">+{{ res.xpEarned }} XP</span>
                        }
                      </div>
                      <p class="banner-msg">{{ res.message }}</p>

                      @if (res.submission.compileOutput) {
                        <div class="block err">
                          <span class="block-label">Compiler diagnostics:</span>
                          <pre>{{ res.submission.compileOutput }}</pre>
                        </div>
                      }
                      @if (res.submission.stderr && !res.accepted) {
                        <div class="block err">
                          <span class="block-label">stderr:</span>
                          <pre>{{ res.submission.stderr }}</pre>
                        </div>
                      }
                    </div>
                  }

                  <div class="history-list">
                    <span class="pane-label">Submission History</span>
                    @if (submissions().length === 0) {
                      <p class="muted">No submissions recorded yet for this problem.</p>
                    } @else {
                      <div class="submissions-table">
                        @for (s of submissions(); track s.id) {
                          <div class="submission-row">
                            <span class="verdict-tag" [attr.data-verdict]="s.verdict">{{ s.verdict }}</span>
                            <span class="sub-lang">{{ s.language }}</span>
                            <span class="sub-cases">{{ s.passedTestCases }}/{{ s.totalTestCases }} passed</span>
                            <span class="sub-time">{{ s.createdAt | date: 'mediumDate' }} {{ s.createdAt | date: 'shortTime' }}</span>
                            <button
                              type="button"
                              class="btn btn-sm btn-quiet"
                              (click)="loadSubmissionCode(s)"
                              title="Restore this code into the editor"
                            >
                              Load code
                            </button>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </section>
      </div>
    </main>
  `,
  styleUrl: './code-editor.scss',
})
export class CodeEditor {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly problemId = input.required<string>();

  private readonly code = inject(CodeService);

  protected readonly problem = signal<Problem | null>(null);
  protected readonly languages = signal<LanguageOption[]>([]);
  protected readonly language = signal('');
  protected readonly running = signal(false);
  protected readonly submitting = signal(false);
  protected readonly saving = signal(false);
  protected readonly result = signal<RunResult | null>(null);
  protected readonly submitResult = signal<SubmitResultView | null>(null);
  protected readonly testCases = signal<TestCaseView[]>([]);
  protected readonly submissions = signal<SubmissionView[]>([]);
  protected readonly activeTab = signal<'input' | 'output' | 'submissions'>('input');
  protected readonly activeTestCaseIndex = signal<number>(0);
  protected readonly status = signal<string | null>(null);

  /** Expected output for the currently selected sample test case. */
  protected readonly currentExpectedOutput = computed(() => {
    const idx = this.activeTestCaseIndex();
    if (idx < 0) return '';
    return this.testCases()[idx]?.expectedOutput ?? '';
  });

  /** The CodeMirror highlight mode for the selected language. */
  protected readonly editorMode = computed(
    () => this.languages().find((l) => l.id === this.language())?.editorMode ?? '',
  );

  /** Two-way bound to the editor. A signal so zoneless change detection always tracks external
   *  sets (template load, language switch), not just user keystrokes. */
  protected readonly source = signal('');
  protected stdin = '';

  /** Width of the problem pane in px, driven by the drag divider. Feeds a CSS var so the mobile
   *  media query can still collapse the split (an inline grid-template-columns could not be
   *  overridden). Clamped in {@link onDrag}. */
  protected readonly leftWidth = signal(340);
  private dragging = false;

  /** Latest source persisted per language, so a re-opened language restores its saved draft. */
  private readonly saved = new Map<string, string>();
  /** Live, unsaved edits per language, so switching language and back keeps your work. */
  private readonly buffers = new Map<string, string>();

  constructor() {
    // input() values land after construction, so defer a tick (same idiom as note-editor).
    queueMicrotask(() => {
      const id = Number(this.problemId());
      this.code.problem(id).subscribe({ next: (p) => this.problem.set(p) });
      this.code.warmup().subscribe({ error: () => {} });

      forkJoin({
        langs: this.code.languages(),
        drafts: this.code.drafts(id),
        testCases: this.code.testCases(id),
        submissions: this.code.submissions(id),
      }).subscribe({
        next: ({ langs, drafts, testCases, submissions }) => {
          this.languages.set(langs);
          drafts.forEach((d) => this.saved.set(d.language, d.source));
          const first = langs[0]?.id ?? '';
          this.source.set(this.sourceFor(first));
          this.language.set(first);

          this.testCases.set(testCases);
          if (testCases.length > 0) {
            this.stdin = testCases[0].input;
            this.activeTestCaseIndex.set(0);
          } else {
            this.activeTestCaseIndex.set(-1);
          }
          this.submissions.set(submissions);
        },
        error: () => this.status.set('Could not load the editor.'),
      });
    });
  }

  /** Pointer capture keeps the drag alive even when the cursor leaves the thin divider. */
  protected startDrag(event: PointerEvent): void {
    this.dragging = true;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  protected onDrag(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const workspace = (event.currentTarget as HTMLElement).parentElement;
    if (!workspace) {
      return;
    }
    const rect = workspace.getBoundingClientRect();
    const max = Math.max(280, rect.width - 360);
    this.leftWidth.set(clamp(event.clientX - rect.left, 240, max));
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  /** Arrow keys nudge the split, so the divider is usable without a pointer. */
  protected onDividerKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowLeft' ? -24 : event.key === 'ArrowRight' ? 24 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    this.leftWidth.update((w) => clamp(w + step, 240, 720));
  }

  protected onLanguageChange(next: string): void {
    this.buffers.set(this.language(), this.source());
    this.source.set(this.sourceFor(next));
    this.language.set(next);
    this.result.set(null);
  }

  protected selectTestCase(index: number): void {
    this.activeTestCaseIndex.set(index);
    const tc = this.testCases()[index];
    if (tc) {
      this.stdin = tc.input;
    }
  }

  protected selectCustomInput(): void {
    this.activeTestCaseIndex.set(-1);
  }

  protected run(): void {
    this.executeRun(0);
  }

  private executeRun(retryCount: number): void {
    this.running.set(true);
    this.status.set(null);
    this.result.set(null);
    this.activeTab.set('output');

    this.code.run(this.language(), this.source(), this.stdin).subscribe({
      next: (r) => {
        this.running.set(false);
        this.status.set(null);
        this.result.set(r);
      },
      error: (err) => {
        const errorDetail = err?.error?.message;
        const isNotConfigured =
          errorDetail &&
          (errorDetail.includes('ANALYTICS_BASE_URL') || errorDetail.includes('not configured'));

        if (err?.status === 503 && !isNotConfigured && retryCount < 2) {
          this.status.set(
            `Code runner is warming up from idle... Retrying automatically (attempt ${retryCount + 1}/2)`,
          );
          setTimeout(() => {
            if (this.running()) {
              this.executeRun(retryCount + 1);
            }
          }, 3500);
        } else {
          this.running.set(false);
          this.status.set(
            errorDetail ||
              (err?.status === 503
                ? 'The code runner is taking longer than expected to wake up. Please wait a few seconds and run again.'
                : 'Could not run your code.'),
          );
        }
      },
    });
  }

  protected submit(): void {
    this.executeSubmit(0);
  }

  private executeSubmit(retryCount: number): void {
    this.submitting.set(true);
    this.status.set(null);
    this.activeTab.set('submissions');

    const id = Number(this.problemId());
    this.code.submit(id, this.language(), this.source(), this.stdin).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.status.set(null);
        this.submitResult.set(res);
        this.submissions.update((list) => [res.submission, ...list]);
        this.saved.set(this.language(), this.source());
        if (res.accepted) {
          this.problem.update((p) => (p ? { ...p, status: 'SOLVED' } : null));
        }
        this.flash(res.message);
      },
      error: (err) => {
        const errorDetail = err?.error?.message;
        const isNotConfigured =
          errorDetail &&
          (errorDetail.includes('ANALYTICS_BASE_URL') || errorDetail.includes('not configured'));

        if (err?.status === 503 && !isNotConfigured && retryCount < 2) {
          this.status.set(
            `Code execution service is warming up... Retrying submission (attempt ${retryCount + 1}/2)`,
          );
          setTimeout(() => {
            if (this.submitting()) {
              this.executeSubmit(retryCount + 1);
            }
          }, 3500);
        } else {
          this.submitting.set(false);
          this.status.set(
            errorDetail ||
              (err?.status === 503
                ? 'The code execution service is taking longer than expected to wake up. Please wait a moment and submit again.'
                : 'Could not submit your code.'),
          );
        }
      },
    });
  }

  protected loadSubmissionCode(s: SubmissionView): void {
    if (s.language !== this.language()) {
      this.onLanguageChange(s.language);
    }
    this.source.set(s.source);
    this.flash('Loaded submission code.');
  }

  protected save(): void {
    this.saving.set(true);
    this.status.set(null);

    this.code.save(Number(this.problemId()), this.language(), this.source()).subscribe({
      next: (d) => {
        this.saving.set(false);
        this.saved.set(d.language, d.source);
        this.flash('Saved.');
      },
      error: () => {
        this.saving.set(false);
        this.flash('Could not save.');
      },
    });
  }

  /** Live buffer first, then the saved draft, then the language's starter template. */
  private sourceFor(language: string): string {
    return (
      this.buffers.get(language) ??
      this.saved.get(language) ??
      this.languages().find((l) => l.id === language)?.template ??
      ''
    );
  }

  private flash(message: string): void {
    this.status.set(message);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
