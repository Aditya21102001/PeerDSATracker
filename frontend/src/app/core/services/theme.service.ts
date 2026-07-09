import { Service, computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'peerdsa.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Owns the `data-theme` attribute on <html>. A small inline script in index.html applies
 * the stored value before first paint; this service keeps it in sync afterwards.
 *
 * 'system' means: remove the attribute and let the prefers-color-scheme media query in
 * styles.scss decide.
 */
@Service()
export class ThemeService {
  private readonly current = signal<Theme>(this.read());

  /** Kept as a signal so `resolved` recomputes when the OS theme changes under us. */
  private readonly systemPrefersDark = signal(this.queryPrefersDark());

  readonly theme = this.current.asReadonly();

  /** What the user actually sees right now, resolving 'system'. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const theme = this.current();
    if (theme !== 'system') {
      return theme;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    // matchMedia is missing in jsdom, and absent during any non-browser render.
    if (typeof matchMedia !== 'function') {
      return;
    }
    matchMedia(DARK_QUERY).addEventListener('change', (event) => {
      this.systemPrefersDark.set(event.matches);
    });
  }

  set(theme: Theme): void {
    this.current.set(theme);
    this.apply(theme);
  }

  /** Toggles light <-> dark, taking the currently resolved value as the starting point. */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private queryPrefersDark(): boolean {
    return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY).matches : false;
  }

  private apply(theme: Theme): void {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }

    try {
      if (theme === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // Private mode. The choice simply will not survive a reload.
    }
  }

  private read(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }
}
