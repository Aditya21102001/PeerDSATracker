import { Component, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageOption, Problem, RunResult } from '../../core/models/api.models';
import { CodeService } from '../../core/services/code.service';
import { CodeMirror } from '../../shared/code-mirror/code-mirror';
import { CodeEditor } from './code-editor';

/** Stands in for the real editor so CodeMirror never has to mount in jsdom. */
@Component({ selector: 'app-code-mirror', template: '' })
class StubCodeMirror {
  readonly value = model('');
  readonly language = input('');
}

const LANGUAGES: LanguageOption[] = [
  { id: 'python', label: 'Python', editorMode: 'python', template: 'print(1)' },
  { id: 'java', label: 'Java', editorMode: 'java', template: 'class Main {}' },
];

const PROBLEM = { id: 5, title: 'Reverse a number', difficulty: 'EASY', stepNo: 3 } as Problem;

describe('CodeEditor', () => {
  let fixture: ComponentFixture<CodeEditor>;
  let editor: any;
  let code: {
    problem: ReturnType<typeof vi.fn>;
    languages: ReturnType<typeof vi.fn>;
    drafts: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    code = {
      problem: vi.fn().mockReturnValue(of(PROBLEM)),
      languages: vi.fn().mockReturnValue(of(LANGUAGES)),
      drafts: vi.fn().mockReturnValue(of([])),
      run: vi.fn(),
      save: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CodeService, useValue: code }],
    });
    TestBed.overrideComponent(CodeEditor, {
      remove: { imports: [CodeMirror] },
      add: { imports: [StubCodeMirror] },
    });

    fixture = TestBed.createComponent(CodeEditor);
    fixture.componentRef.setInput('problemId', '5');
    editor = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve(); // run the constructor's queueMicrotask; mocked of() emits synchronously
    fixture.detectChanges();
  });

  it('seeds the first language and its starter template', () => {
    expect(editor.language()).toBe('python');
    expect(editor.editorMode()).toBe('python');
    expect(editor.source()).toBe('print(1)');
    expect(editor.problem()?.title).toBe('Reverse a number');
  });

  it('switching language swaps the template and the highlight mode', () => {
    editor.onLanguageChange('java');
    expect(editor.language()).toBe('java');
    expect(editor.editorMode()).toBe('java');
    expect(editor.source()).toBe('class Main {}');
  });

  it('keeps per-language edits when switching away and back', () => {
    editor.source.set('print(42)'); // edit the python buffer
    editor.onLanguageChange('java');
    expect(editor.source()).toBe('class Main {}');
    editor.onLanguageChange('python');
    expect(editor.source()).toBe('print(42)'); // restored, not reset to the template
  });

  it('run() shows the sandbox result', () => {
    const result = { ran: true, stdout: '3\n', exitCode: 0 } as RunResult;
    code.run.mockReturnValue(of(result));

    editor.run();

    expect(code.run).toHaveBeenCalledWith('python', 'print(1)', '');
    expect(editor.result()).toEqual(result);
    expect(editor.running()).toBe(false);
  });

  it('the divider clamps the pane width and never inverts it', () => {
    editor.onDividerKey({ key: 'ArrowLeft', preventDefault() {} });
    expect(editor.leftWidth()).toBeGreaterThanOrEqual(240);

    for (let i = 0; i < 60; i++) {
      editor.onDividerKey({ key: 'ArrowLeft', preventDefault() {} });
    }
    expect(editor.leftWidth()).toBe(240); // floor holds
  });
});
