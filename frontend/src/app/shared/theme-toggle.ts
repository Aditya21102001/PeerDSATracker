import { Component, computed, inject } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="toggle"
      [attr.aria-label]="'Switch to ' + (isDark() ? 'light' : 'dark') + ' theme'"
      [title]="'Switch to ' + (isDark() ? 'light' : 'dark') + ' theme'"
      (click)="theme.toggle()"
    >
      <span class="icon" aria-hidden="true">{{ isDark() ? '☀' : '☾' }}</span>
    </button>
  `,
  styles: `
    .toggle {
      display: grid;
      place-items: center;
      width: 2.1rem;
      height: 2.1rem;
      border: 1px solid var(--border);
      border-radius: var(--r-full);
      background: var(--surface);
      cursor: pointer;
      transition:
        background-color var(--t-fast) var(--ease),
        border-color var(--t-fast) var(--ease),
        transform var(--t-fast) var(--ease);
    }

    .toggle:hover {
      background: var(--surface-2);
      border-color: var(--border-strong);
    }

    .toggle:active {
      transform: scale(0.92);
    }

    .icon {
      font-size: var(--fs-sm);
      line-height: 1;
      /* The swap should read as a rotation, not a jump. */
      animation: spin-in var(--t-base) var(--ease);
    }

    @keyframes spin-in {
      from {
        transform: rotate(-90deg) scale(0.6);
        opacity: 0;
      }
    }
  `,
})
/**
 * The single theme switch for the whole app. One instance lives in the app shell so every
 * page — sign-in included — can flip the theme.
 *
 * The label names the theme it switches *to*, not the current one, so the action stays
 * unambiguous when read aloud.
 */
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);

  // resolved() is the string 'light' | 'dark' — both truthy. Compare, don't coerce.
  protected readonly isDark = computed(() => this.theme.resolved() === 'dark');
}
