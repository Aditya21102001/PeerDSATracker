import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Read from disk rather than imported. `import '../styles.scss?raw'` is the tidier spelling but
 * the Angular compiler plugin has no loader for .scss outside a component, so it fails the build.
 * Reading the file keeps the single source of truth intact, which is the point: the tokens under
 * test are the ones the application actually ships.
 */
const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf8');

/**
 * WCAG colour-contrast checks over the design tokens themselves.
 *
 * <p>This exists because axe cannot do it. Its `color-contrast` rule needs a real layout engine to
 * resolve what colour a pixel actually ends up, and jsdom has none — axe silently reports the rule
 * as "incomplete" rather than failing, so a contrast regression would sail through
 * `a11y.spec.ts` unnoticed.
 *
 * <p>So instead of testing rendered pixels, this tests the source of truth: every colour the app
 * paints comes from a token in `styles.scss`, and the tokens are parsed straight out of that file
 * rather than duplicated here. Change a token and this test sees the change — copy the values into
 * the test and it would only ever verify itself.
 *
 * <p>Both themes are checked. Dark mode is where contrast usually breaks, because a colour picked
 * to look right on white is being asked to work on near-black.
 */
describe('design tokens: WCAG contrast', () => {
  /** Relative luminance, per WCAG 2.x. */
  const luminance = (hex: string): number => {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrast = (a: string, b: string): number => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };

  /**
   * Pulls `--name: #rrggbb` pairs out of a block of the stylesheet.
   *
   * Eight-digit hexes are skipped deliberately: those are the `-soft` tints, which are translucent
   * overlays whose final colour depends on what is behind them. They are never used for text.
   */
  const tokensIn = (block: string): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const [, name, hex] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      found[name] = hex;
    }
    return found;
  };

  const lightBlock = stylesheet.slice(stylesheet.indexOf(':root {'), stylesheet.indexOf('@mixin dark-tokens'));
  const darkBlock = stylesheet.slice(stylesheet.indexOf('@mixin dark-tokens'));

  const THEMES: [string, Record<string, string>][] = [
    ['light', tokensIn(lightBlock)],
    ['dark', tokensIn(darkBlock)],
  ];

  /** Sanity: if the parse silently returned nothing, every assertion below would vacuously pass. */
  it('parses tokens out of the real stylesheet', () => {
    for (const [theme, tokens] of THEMES) {
      expect(Object.keys(tokens).length, `${theme} tokens`).toBeGreaterThan(15);
      expect(tokens['text'], `${theme} --text`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tokens['bg'], `${theme} --bg`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // And the two themes must genuinely differ, or one block was parsed twice.
    expect(THEMES[0][1]['bg']).not.toEqual(THEMES[1][1]['bg']);
  });

  /**
   * Body text: 4.5:1 (WCAG 1.4.3, AA). Checked against every surface it can sit on, because
   * `--surface-2` panels are a slightly different colour from the page behind them.
   */
  describe.each(THEMES)('%s theme', (_theme, tokens) => {
    const SURFACES = ['bg', 'surface', 'surface-2'];

    it.each(SURFACES)('--text reads on --%s at 4.5:1', (surface) => {
      expect(contrast(tokens['text'], tokens[surface])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(SURFACES)('--text-muted reads on --%s at 4.5:1', (surface) => {
      expect(contrast(tokens['text-muted'], tokens[surface])).toBeGreaterThanOrEqual(4.5);
    });

    /**
     * `--text-faint` is used only for small supporting labels, which are still body-size text and
     * so still owe 4.5:1. If this ever fails the honest fix is to darken the token, not to
     * reclassify the text as decorative.
     */
    it.each(SURFACES)('--text-faint reads on --%s at 4.5:1', (surface) => {
      expect(contrast(tokens['text-faint'], tokens[surface])).toBeGreaterThanOrEqual(4.5);
    });

    /** Link and button text carry meaning, so they owe full body contrast too. */
    it.each(SURFACES)('--accent reads on --%s at 4.5:1', (surface) => {
      expect(contrast(tokens['accent'], tokens[surface])).toBeGreaterThanOrEqual(4.5);
    });

    it('--on-accent reads on a filled --accent button at 4.5:1', () => {
      expect(contrast(tokens['on-accent'], tokens['accent'])).toBeGreaterThanOrEqual(4.5);
    });

    /** Difficulty pills and status text: coloured, small, and load-bearing. */
    it.each(['easy', 'medium', 'hard', 'success', 'danger', 'xp'])(
      '--%s reads on --surface at 4.5:1',
      (token) => {
        expect(contrast(tokens[token], tokens['surface'])).toBeGreaterThanOrEqual(4.5);
      },
    );

    /**
     * Borders are non-text UI, which owes 3:1 under WCAG 1.4.11 — but only where the border is
     * what conveys something. `--border-strong` outlines inputs and dashed empty states, where
     * losing the edge means losing the control.
     */
    it('--border-strong is distinguishable from --surface at 3:1', () => {
      expect(contrast(tokens['border-strong'], tokens['surface'])).toBeGreaterThanOrEqual(3);
    });

    /**
     * The edge of a text field, select or checkbox. This is the one that was actually broken:
     * controls used `--border`, which is 1.3:1 against white -- an edge most people simply cannot
     * see, on the elements it matters most for. WCAG 1.4.11 asks 3:1 of exactly this.
     */
    it('--border-control makes a form field findable at 3:1', () => {
      for (const surface of SURFACES) {
        expect(contrast(tokens['border-control'], tokens[surface]), surface).toBeGreaterThanOrEqual(3);
      }
    });

    /** The focus ring is the single most important non-text contrast in the app. */
    it('the focus ring (--accent) is visible against every surface at 3:1', () => {
      for (const surface of SURFACES) {
        expect(contrast(tokens['accent'], tokens[surface]), surface).toBeGreaterThanOrEqual(3);
      }
    });
  });

  /** Proves the maths, so a broken formula cannot make everything above pass. */
  it('computes known contrast ratios correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5); // the classic AA boundary
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.6);
  });
});
