import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { ThemeService } from '../../core/services/theme.service';

/** Maps a backend LanguageOption.editorMode to its CodeMirror grammar. C rides on the C++ grammar. */
export function grammarFor(mode: string): Extension {
  switch (mode) {
    case 'python':
      return python();
    case 'cpp':
    case 'c':
      return cpp();
    case 'java':
      return java();
    case 'javascript':
      return javascript();
    case 'go':
      return go();
    default:
      return [];
  }
}

/** Structural only (height, fonts). Colours come from oneDark / the default light highlight. */
const layoutTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '0.85rem' },
  '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)', overflow: 'auto' },
  '.cm-gutters': { borderRight: '1px solid var(--border)' },
  '&.cm-focused': { outline: 'none' },
});

/**
 * A thin CodeMirror 6 host. Two-way bound via {@link value}; {@link language} is the editorMode a
 * LanguageOption carries. The grammar and the light/dark theme live in compartments so they can be
 * swapped without tearing down the editor (and losing the cursor/history). CodeMirror runs its own
 * DOM event loop outside Angular — the only bridge back in is {@link value}, set on real edits.
 */
@Component({
  selector: 'app-code-mirror',
  template: `<div #host class="host"></div>`,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .host {
      height: 100%;
    }
  `,
})
export class CodeMirror {
  /** The document text. Emits on user edits; external sets (e.g. a template) reconcile into the doc. */
  readonly value = model('');
  /** editorMode from the selected LanguageOption: 'python' | 'cpp' | 'java' | 'javascript' | 'c' | 'go'. */
  readonly language = input('');

  private readonly theme = inject(ThemeService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private view?: EditorView;
  private readonly grammar = new Compartment();
  private readonly palette = new Compartment();

  constructor() {
    afterNextRender(() => this.mount());
    inject(DestroyRef).onDestroy(() => this.view?.destroy());

    // An external value change (language switch loads a saved draft or the starter template) must
    // reach the doc — but a user keystroke sets value to what the doc already holds, so guard it.
    effect(() => {
      const incoming = this.value();
      const view = this.view;
      if (view && view.state.doc.toString() !== incoming) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: incoming } });
      }
    });

    effect(() => {
      const mode = this.language();
      this.view?.dispatch({ effects: this.grammar.reconfigure(grammarFor(mode)) });
    });

    effect(() => {
      const dark = this.theme.resolved() === 'dark';
      this.view?.dispatch({ effects: this.palette.reconfigure(dark ? oneDark : []) });
    });
  }

  private mount(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab, // Tab indents inside the editor instead of leaving it
          ]),
          this.grammar.of(grammarFor(this.language())),
          this.palette.of(this.theme.resolved() === 'dark' ? oneDark : []),
          layoutTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.value.set(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
  }
}
