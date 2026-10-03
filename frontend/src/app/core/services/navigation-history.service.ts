import { Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from './auth.store';

/**
 * Tracks in-app navigation history to enable smooth, context-aware back navigation
 * across all subpages, editors, and detailed views.
 */
@Injectable({
  providedIn: 'root',
})
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly auth = inject(AuthStore);

  private readonly historyStack: string[] = [];

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects || event.url;
        const last = this.historyStack[this.historyStack.length - 1];
        if (last !== url) {
          this.historyStack.push(url);
          // Keep stack bounded
          if (this.historyStack.length > 50) {
            this.historyStack.shift();
          }
        }
      });
  }

  /**
   * Returns the previous in-app URL before the current page, if any.
   */
  previousUrl(): string | null {
    if (this.historyStack.length >= 2) {
      return this.historyStack[this.historyStack.length - 2];
    }
    return null;
  }

  /**
   * Derives a friendly label for the previous page (e.g. 'Dashboard', 'Sheet', 'Study Guides').
   */
  previousPageLabel(defaultFallback?: string): string {
    const prev = this.previousUrl();
    if (!prev) {
      if (defaultFallback) return defaultFallback;
      return this.auth.isAuthenticated() ? 'Dashboard' : 'Home';
    }

    const clean = prev.split('?')[0].split('#')[0];
    if (clean.includes('/dashboard')) return 'Dashboard';
    if (clean.includes('/sheet')) return 'Sheet';
    if (clean.includes('/videos')) return 'Video Hub';
    if (clean.includes('/study-guides')) return 'Study Guides';
    if (clean.includes('/interview')) return 'AI Interview';
    if (clean.includes('/proctor')) return 'Proctored Test';
    if (clean.includes('/hire')) return 'Hire Portal';
    if (clean.includes('/blog')) return 'Articles';
    if (clean.includes('/code')) return 'Code Editor';
    if (clean.includes('/revision')) return 'Revision';
    if (clean.includes('/leaderboard')) return 'Leaderboard';
    if (clean.includes('/notes')) return 'Notes';
    if (clean.includes('/messages')) return 'Messages';
    if (clean.includes('/peers')) return 'Peers';
    if (clean === '/' || clean === '') return 'Home';

    return defaultFallback || (this.auth.isAuthenticated() ? 'Dashboard' : 'Home');
  }

  /**
   * Smoothly navigates to the previous page in history, or to the fallback if no previous history exists.
   */
  back(fallbackUrl?: string): void {
    const fallback = fallbackUrl || (this.auth.isAuthenticated() ? '/dashboard' : '/');

    if (this.historyStack.length > 1 && typeof window !== 'undefined' && window.history.length > 1) {
      this.historyStack.pop(); // pop current
      this.location.back();
    } else {
      this.router.navigateByUrl(fallback);
    }
  }
}
