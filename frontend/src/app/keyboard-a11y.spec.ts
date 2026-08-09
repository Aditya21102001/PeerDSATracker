import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CodeSignin } from './features/auth/code-signin';
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

/**
 * Keyboard and structural accessibility that axe cannot see.
 *
 * <p>axe checks the attributes on an element in isolation. It cannot tell whether a skip link
 * actually points at anything, whether a dialog moves focus when it opens, or whether Escape
 * closes it — those are behaviours, and they are the ones that decide whether the app is usable
 * without a mouse. Each of these was genuinely missing before this suite existed.
 */
describe('keyboard accessibility', () => {
  const PAGES: [string, Type<unknown>][] = [
    ['welcome', WelcomePage],
    ['guide', GuidePage],
    ['signin', Signin],
    ['signup', Signup],
    ['code sign-in', CodeSignin],
    ['security', Security],
    ['sheet', SheetPage],
    ['peers', PeersPage],
    ['leaderboard', LeaderboardPage],
    ['notes', NotesPage],
    ['revision', RevisionPage],
    ['profile', ProfilePage],
  ];

  const render = async (component: Type<unknown>) => {
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    return fixture;
  };

  /**
   * WCAG 2.4.1, Bypass Blocks (Level A). The skip link lives in the app shell and targets
   * `#main-content`, so every routed page has to provide that anchor — a skip link pointing at an
   * id that does not exist on the current page silently does nothing.
   */
  describe('the skip link has somewhere to go', () => {
    for (const [name, component] of PAGES) {
      it(`${name} exposes #main-content`, async () => {
        const fixture = await render(component);
        const main: HTMLElement | null = fixture.nativeElement.querySelector('#main-content');

        expect(main, `${name} has no #main-content for the skip link to reach`).not.toBeNull();
        expect(main!.tagName.toLowerCase(), 'the target should be the main landmark').toBe('main');

        // Without tabindex the browser scrolls but leaves focus on the link, so the next Tab
        // walks straight back into the nav the user just asked to skip.
        expect(main!.getAttribute('tabindex'), `${name} main is not focusable`).toBe('-1');

        TestBed.resetTestingModule();
      });
    }
  });

  /** Exactly one main landmark per page: two would make "skip to main content" ambiguous. */
  it('every page has exactly one main landmark', async () => {
    for (const [name, component] of PAGES) {
      const fixture = await render(component);

      expect(fixture.nativeElement.querySelectorAll('main').length, `${name}`).toBe(1);

      TestBed.resetTestingModule();
    }
  });

  /**
   * Every page starts its heading outline at h1 and never skips a level on the way down. Screen
   * reader users navigate by headings, and a jump from h1 to h3 reads as a missing section.
   */
  it('heading levels are ordered and start at h1', async () => {
    for (const [name, component] of PAGES) {
      const fixture = await render(component);
      const levels = [...fixture.nativeElement.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(
        (h) => Number((h as HTMLElement).tagName[1]),
      );

      if (levels.length > 0) {
        expect(levels[0], `${name} starts at h${levels[0]}, not h1`).toBe(1);
        for (let i = 1; i < levels.length; i++) {
          expect(
            levels[i] - levels[i - 1],
            `${name} jumps from h${levels[i - 1]} to h${levels[i]}`,
          ).toBeLessThanOrEqual(1);
        }
      }

      TestBed.resetTestingModule();
    }
  });

  /**
   * Every control has an accessible name. axe covers most of this, but icon-only buttons are the
   * ones that regress — someone replaces a label with an emoji and the button becomes "button".
   */
  it('no control is announced as nothing at all', async () => {
    for (const [name, component] of PAGES) {
      const fixture = await render(component);
      const controls = [...fixture.nativeElement.querySelectorAll('button, a[href]')];

      for (const control of controls as HTMLElement[]) {
        const name_ =
          control.getAttribute('aria-label') ??
          control.getAttribute('title') ??
          control.textContent?.trim();

        expect(name_, `${name}: ${control.outerHTML.slice(0, 100)}`).toBeTruthy();
      }

      TestBed.resetTestingModule();
    }
  });
});
