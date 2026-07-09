import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

/**
 * Two bugs already lived here: `resolved()` returns the string 'light' | 'dark' (both
 * truthy, so `if (resolved())` is always true), and matchMedia does not exist outside a
 * browser. Both are pinned below.
 */
describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('survives an environment without matchMedia', () => {
    // jsdom has no matchMedia; constructing the service must not throw.
    expect(service.theme()).toBe('system');
    expect(['light', 'dark']).toContain(service.resolved());
  });

  it('resolves to a string, never a boolean — the toggle must compare, not coerce', () => {
    service.set('dark');
    expect(service.resolved()).toBe('dark');

    service.set('light');
    expect(service.resolved()).toBe('light');
  });

  it('writes data-theme on <html> and persists the choice', () => {
    service.set('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('peerdsa.theme')).toBe('dark');
  });

  it('toggling flips between light and dark', () => {
    service.set('light');
    service.toggle();
    expect(service.resolved()).toBe('dark');

    service.toggle();
    expect(service.resolved()).toBe('light');
  });

  it("'system' clears the attribute so the media query decides again", () => {
    service.set('dark');
    service.set('system');

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('peerdsa.theme')).toBeNull();
  });
});
