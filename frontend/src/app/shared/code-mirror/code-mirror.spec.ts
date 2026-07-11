import { describe, expect, it } from 'vitest';
import { grammarFor } from './code-mirror';

/**
 * The editorMode -> grammar mapping is what turns "python"/"cpp"/etc. from the backend into
 * highlighting. Every supported language must resolve to a real extension, C must ride on the C++
 * grammar, and an unknown mode must degrade to no highlighting rather than throw.
 */
describe('grammarFor', () => {
  it('resolves a grammar for every backend language', () => {
    for (const mode of ['python', 'cpp', 'c', 'java', 'javascript', 'go']) {
      const grammar = grammarFor(mode);
      // A real language extension is a non-empty object/array; the fallback is an empty array.
      expect(grammar, `mode ${mode}`).toBeTruthy();
      expect(Array.isArray(grammar) && grammar.length === 0, `mode ${mode} should not be the empty fallback`).toBe(
        false,
      );
    }
  });

  it('falls back to no grammar (empty extension) for an unknown mode', () => {
    const grammar = grammarFor('brainfuck');
    expect(Array.isArray(grammar)).toBe(true);
    expect(grammar as unknown[]).toHaveLength(0);
  });
});
