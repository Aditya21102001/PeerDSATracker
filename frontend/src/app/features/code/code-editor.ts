import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { LanguageOption, Problem, RunResult } from '../../core/models/api.models';
import { CodeService } from '../../core/services/code.service';
import { CodeMirror } from '../../shared/code-mirror/code-mirror';
import { Spinner } from '../../shared/spinner';

/**
 * The in-app code editor for one problem, routed as code/:problemId with problemId supplied by
 * component input binding. A LeetCode-style split: the problem and its resources on the left, a
 * CodeMirror editor plus a run console on the right.
 *
 * Code never runs in the browser: Run posts to the backend, which proxies to Piston's sandbox. A
 * failed compile or a crash is a normal result shown in the console; only the runner being
 * unreachable (503, usually a cold start) is treated as a transient error worth retrying.
 *
 * Per-language buffers keep unsaved edits when you switch language and back within a session; only
 * Save persists anything. Switching to a language with no draft seeds its starter template.
 */
@Component({
  selector: 'app-code-editor',
  imports: [FormsModule, RouterLink, Spinner, CodeMirror],
  template: `
    <main class="code">
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
              The full statement, constraints and examples live on the linked problem. Write and run
              your solution on the right.
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

            <button type="button" class="btn" (click)="run()" [disabled]="running() || !language()">
              {{ running() ? 'Running…' : '▶ Run' }}
            </button>
            <button type="button" class="btn btn-ghost" (click)="save()" [disabled]="saving() || !language()">
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
            <div class="io">
              <label for="stdin" class="pane-label">Input (stdin)</label>
              <textarea id="stdin" name="stdin" spellcheck="false" [(ngModel)]="stdin"></textarea>
            </div>

            <div class="io output" aria-live="polite">
              <span class="pane-label">Output</span>
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
                  Run your code to see its output here. The first run after a while can take a moment
                  while the sandbox wakes.
                </p>
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
  protected readonly saving = signal(false);
  protected readonly result = signal<RunResult | null>(null);
  protected readonly status = signal<string | null>(null);

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

      forkJoin({ langs: this.code.languages(), drafts: this.code.drafts(id) }).subscribe({
        next: ({ langs, drafts }) => {
          this.languages.set(langs);
          drafts.forEach((d) => this.saved.set(d.language, d.source));
          const first = langs[0]?.id ?? '';
          this.source.set(this.sourceFor(first));
          this.language.set(first);
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
    // Keep at least 280px for the problem pane and ~360px for the editor.
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
    this.buffers.set(this.language(), this.source()); // stash the current buffer before switching
    this.source.set(this.sourceFor(next));
    this.language.set(next);
    this.result.set(null);
  }

  protected run(): void {
    this.running.set(true);
    this.status.set(null);
    this.result.set(null);

    this.code.run(this.language(), this.source(), this.stdin).subscribe({
      next: (r) => {
        this.running.set(false);
        this.result.set(r);
      },
      error: (err) => {
        this.running.set(false);
        this.status.set(
          err?.status === 503
            ? 'The code runner is waking up — give it a few seconds and run again.'
            : 'Could not run your code.',
        );
      },
    });
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
