import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { CodeSignin } from './features/auth/code-signin';
import { Forgot } from './features/auth/forgot';
import { Reset } from './features/auth/reset';
import { Security } from './features/auth/security';
import { Signin } from './features/auth/signin';
import { Signup } from './features/auth/signup';
import { GuidePage } from './features/guide/guide-page';
import { LeaderboardPage } from './features/leaderboard/leaderboard-page';
import { NotesPage } from './features/notes/notes-page';
import { PeersPage } from './features/peers/peers-page';
import { ProfilePage } from './features/profile/profile-page';
import { RevisionPage } from './features/revision/revision-page';
import { SheetPage } from './features/sheet/sheet-page';
import { WelcomePage } from './features/welcome/welcome-page';
import { ThemeToggle } from './shared/theme-toggle';

/**
 * Automated accessibility checks, run by axe-core against every screen.
 *
 * <p>Why this exists as a test rather than a review: accessibility regressions are invisible to
 * everyone who is not affected by them. A button that loses its label, an input whose `for` no
 * longer matches an id, a heading level skipped during a refactor — none of these look wrong, none
 * break a build, and none are noticed by anybody using a mouse and a screen. They are only ever
 * found by the person they lock out.
 *
 * <p>Scope and honesty about it. axe in jsdom checks the things that live in the markup: names,
 * roles, labels, relationships, heading order, landmark structure, duplicate ids. It **cannot**
 * check anything that needs layout or paint — colour contrast, focus visibility, reflow, target
 * size. Those are covered separately by `design-tokens.spec.ts` (contrast, computed from the token
 * values) and `reflow.spec.ts` (fixed widths that would break 320px). Between them the automated
 * coverage is real, but it is not a substitute for testing with an actual screen reader.
 */
describe('accessibility (axe-core)', () => {
  /**
   * Every routed screen. Components needing route params or a signed-in profile still render —
   * they show their empty/loading state, which is a state a real user sees and so is a state that
   * has to be accessible too.
   */
  const SCREENS: [string, Type<unknown>][] = [
    ['welcome', WelcomePage],
    ['guide', GuidePage],
    ['signin', Signin],
    ['signup', Signup],
    ['code sign-in', CodeSignin],
    ['forgot password', Forgot],
    ['reset password', Reset],
    ['security', Security],
    ['sheet', SheetPage],
    ['peers', PeersPage],
    ['leaderboard', LeaderboardPage],
    ['notes', NotesPage],
    ['revision', RevisionPage],
    ['profile', ProfilePage],
    ['theme toggle', ThemeToggle],
  ];

  /**
   * Rules switched off, each with a reason.
   *
   * `region` requires every piece of content to sit inside a landmark. Components are rendered
   * here in isolation, outside the app shell that provides them, so it reports on the harness
   * rather than the code. Landmark structure is asserted directly in `landmarks.spec.ts` instead.
   *
   * `color-contrast` cannot run in jsdom at all (no layout, no computed colours) — axe skips it
   * and would report it as "incomplete" rather than passing. It is genuinely checked in
   * `design-tokens.spec.ts`, against the token values themselves.
   */
  const DISABLED_RULES = { region: { enabled: false }, 'color-contrast': { enabled: false } };

  const analyse = async (component: Type<unknown>) => {
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();

    // axe needs the element attached to the document; a detached fixture root reports nothing.
    document.body.appendChild(fixture.nativeElement);
    try {
      return await axe.run(fixture.nativeElement, {
        rules: DISABLED_RULES,
        // WCAG 2.1 AA is the stated bar. Best-practice rules are not part of it and are not
        // asserted here, to keep failures meaningful rather than noisy.
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
    } finally {
      fixture.nativeElement.remove();
      TestBed.resetTestingModule();
    }
  };

  /** Turns axe's output into something a failure message can actually be acted on. */
  const describeViolations = (violations: axe.Result[]) =>
    violations
      .map(
        (v) =>
          `\n  [${v.impact}] ${v.id}: ${v.help}\n` +
          v.nodes.map((n) => `    ${n.html}\n      -> ${n.failureSummary}`).join('\n'),
      )
      .join('\n');

  /**
   * Proves the harness can fail.
   *
   * <p>Fifteen green ticks are worthless if the checker is silently a no-op — a misconfigured
   * `runOnly`, an element never attached to the document, an over-eager disabled-rules list, and
   * every screen "passes" while checking nothing. This deliberately broken markup exercises three
   * of the most common real failures and asserts axe catches all three. If this test ever passes
   * with an empty violation list, every other test in this file is lying.
   */
  it('the checker itself detects violations (guard against a no-op suite)', async () => {
    const broken = document.createElement('div');
    broken.innerHTML = `
      <input type="text" id="no-label-here">
      <img src="x.png">
      <a href="#"></a>
    `;
    document.body.appendChild(broken);

    try {
      const results = await axe.run(broken, {
        rules: DISABLED_RULES,
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      const ids = results.violations.map((v) => v.id);

      expect(ids).toContain('label'); // an input nobody can name
      expect(ids).toContain('image-alt'); // an image a screen reader cannot describe
      expect(ids).toContain('link-name'); // a link announced as nothing at all
    } finally {
      broken.remove();
    }
  });

  for (const [name, component] of SCREENS) {
    it(`${name} has no WCAG 2.1 AA violations`, async () => {
      const results = await analyse(component);

      expect(results.violations, describeViolations(results.violations)).toEqual([]);
    });
  }
});
