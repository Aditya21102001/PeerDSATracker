import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { LanguageOption, Problem, RunResult } from '../../core/models/api.models';
import { CodeService } from '../../core/services/code.service';
import { Spinner } from '../../shared/spinner';

/**
 * The in-app code editor for one problem, routed as code/:problemId with problemId supplied by
 * component input binding. Write code, run it in Piston's sandbox, and save a draft per language.
 *
 * Code never runs in the browser: Run posts to the backend, which proxies to the sandbox. A failed
 * compile or a crash is a normal result shown in the output panel; only the runner being
 * unreachable (503, usually a cold start) is treated as a transient error worth retrying.
 *
 * Per-language buffers keep unsaved edits when you switch language and back within a session;
 * only Save persists anything. Switching to a language with no draft seeds its starter template.
 */
@Component({
  selector: 'app-code-editor',
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <main class="code">
      <header>
        <a routerLink="/sheet">← Sheet</a>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a [routerLink]="['/notes', problemId()]">Note</a>
        </nav>
      </header>

      @if (problem(); as p) {
        <h1>{{ p.title }}</h1>
        <p class="meta">
          Step {{ p.stepNo }} · <span class="pill" [attr.data-level]="p.difficulty">{{ p.difficulty }}</span>
          @if (p.leetcodeUrl) {
            · <a [href]="p.leetcodeUrl" target="_blank" rel="noopener">LeetCode</a>
          }
        </p>
      } @else {
        <h1>Code</h1>
      }

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

      <div class="grid">
        <section class="pane source" aria-label="Source code">
          <label for="source" class="pane-label">Source</label>
          <textarea
            id="source"
            name="source"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            wrap="off"
            [(ngModel)]="source"
            (keydown.tab)="onTab($event)"
          ></textarea>
        </section>

        <section class="side">
          <div class="pane">
            <label for="stdin" class="pane-label">Input (stdin)</label>
            <textarea id="stdin" name="stdin" spellcheck="false" [(ngModel)]="stdin"></textarea>
          </div>

          <div class="pane output" aria-live="polite">
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
              <p class="muted">Run your code to see its output here. The first run after a while can take a moment while the sandbox wakes.</p>
            }
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

  /** Bound to the textareas. Plain fields: the native element owns the text, like note-editor. */
  protected source = '';
  protected stdin = '';

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
          this.language.set(first);
          this.source = this.sourceFor(first);
        },
        error: () => this.status.set('Could not load the editor.'),
      });
    });
  }

  protected onLanguageChange(next: string): void {
    this.buffers.set(this.language(), this.source); // stash the current buffer before switching
    this.language.set(next);
    this.source = this.sourceFor(next);
    this.result.set(null);
  }

  protected run(): void {
    this.running.set(true);
    this.status.set(null);
    this.result.set(null);

    this.code.run(this.language(), this.source, this.stdin).subscribe({
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

    this.code.save(Number(this.problemId()), this.language(), this.source).subscribe({
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

  /** Insert spaces instead of moving focus, so Tab indents like an editor. */
  protected onTab(event: Event): void {
    event.preventDefault();
    const area = event.target as HTMLTextAreaElement;
    const indent = '    ';
    const start = area.selectionStart;
    const end = area.selectionEnd;
    area.value = area.value.slice(0, start) + indent + area.value.slice(end);
    area.selectionStart = area.selectionEnd = start + indent.length;
    this.source = area.value;
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
