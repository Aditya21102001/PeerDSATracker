import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

/** One destination in the bar or the sheet. */
interface Destination {
  path: string;
  label: string;
  /** Decorative — the label is what is announced. */
  icon: string;
}

@Component({
  selector: 'app-mobile-nav',
  imports: [RouterLink, RouterLinkActive],
  host: {
    '(keydown.escape)': 'closeMore()',
  },
  template: `
    <!-- Scrim first, so a tap anywhere outside the sheet closes it. -->
    @if (moreOpen()) {
      <button
        type="button"
        class="scrim"
        aria-label="Close menu"
        (click)="closeMore()"
      ></button>

      <div class="sheet" role="dialog" aria-modal="true" aria-label="More destinations">
        <p class="sheet-title" id="more-title">More</p>
        <ul>
          @for (d of secondary; track d.path) {
            <li>
              <a
                [routerLink]="d.path"
                routerLinkActive="on"
                (click)="closeMore()"
              >
                <span class="icon" aria-hidden="true">{{ d.icon }}</span>
                {{ d.label }}
              </a>
            </li>
          }
          <li>
            <button type="button" class="sign-out" (click)="signOut()">
              <span class="icon" aria-hidden="true">⏻</span>
              Sign out
            </button>
          </li>
        </ul>
      </div>
    }

    <!--
      data-tour="nav" is on both this bar and the desktop header nav. Exactly one is displayed at
      any width, and the tour picks whichever is actually visible.
    -->
    <nav class="tabbar" aria-label="Main" data-tour="nav">
      @for (d of primary; track d.path) {
        <a
          [routerLink]="d.path"
          routerLinkActive="on"
          [routerLinkActiveOptions]="{ exact: d.path === '/dashboard' }"
          ariaCurrentWhenActive="page"
        >
          <span class="icon" aria-hidden="true">{{ d.icon }}</span>
          <span class="label">{{ d.label }}</span>
        </a>
      }

      <button
        #moreButton
        type="button"
        [class.on]="moreOpen()"
        [attr.aria-expanded]="moreOpen()"
        aria-haspopup="dialog"
        (click)="toggleMore()"
      >
        <span class="icon" aria-hidden="true">☰</span>
        <span class="label">More</span>
      </button>
    </nav>
  `,
  styleUrl: './mobile-nav.scss',
})
/**
 * Thumb-reachable navigation for phones, and the reason the per-page header nav is hidden there.
 *
 * The problem it solves: every page's header carried the same eight links plus "Sign out". Wrapped
 * onto a 375px screen at the 40px tap height accessibility requires, that is four rows and around
 * 160px of vertical space consumed before any content — and it reads as an unstyled list of links
 * rather than an application. It also put navigation at the very top, the hardest part of a phone
 * screen to reach one-handed.
 *
 * Four primary destinations sit in the bar; the rest live behind "More". Four because five is the
 * point at which labels start truncating at 320px, and a truncated label is worse than one more
 * tap.
 *
 * Only rendered for signed-in users — see app.html. A signed-out visitor has nowhere to navigate
 * to, and a bar of links that all bounce to /signin is noise.
 */
export class MobileNav {
  private readonly auth = inject(AuthStore);
  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('moreButton');

  protected readonly moreOpen = signal(false);

  constructor() {
    /*
     * Marks the document while this bar exists, so the global stylesheet can hide the per-page
     * header nav and reserve space at the foot of the page *only* when there is something to
     * replace it with.
     *
     * That condition matters: /guide and the welcome page are reachable signed out, where this
     * component is not rendered. Hiding their header nav unconditionally would leave a visitor
     * with no navigation of any kind.
     */
    document.body.classList.add('has-mobile-nav');
    inject(DestroyRef).onDestroy(() => document.body.classList.remove('has-mobile-nav'));
  }

  /** In the bar. Ordered by how often they are actually used, not alphabetically. */
  protected readonly primary: Destination[] = [
    { path: '/dashboard', label: 'Home', icon: '⚡' },
    { path: '/sheet', label: 'Sheet', icon: '📋' }, // not ☰ — that is the More button's glyph
    { path: '/revision', label: 'Revise', icon: '↻' },
    { path: '/peers', label: 'Peers', icon: '👥' },
  ];

  /** Behind "More". */
  protected readonly secondary: Destination[] = [
    { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { path: '/notes', label: 'Notes', icon: '✎' },
    { path: '/profile', label: 'Platforms', icon: '🔗' },
    { path: '/security', label: 'Password', icon: '🔒' },
    { path: '/guide', label: 'Guide', icon: '?' },
  ];

  protected toggleMore(): void {
    this.moreOpen.update((v) => !v);
  }

  protected closeMore(): void {
    if (!this.moreOpen()) {
      return;
    }
    this.moreOpen.set(false);
    // Focus goes back to the button that opened it. Closing destroys the focused element, and
    // without this the browser drops focus to <body> and the next Tab restarts from the top.
    this.moreButton()?.nativeElement.focus();
  }

  protected signOut(): void {
    this.moreOpen.set(false);
    this.auth.logout();
  }
}
