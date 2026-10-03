import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from './core/services/auth.store';
import { AppFooter } from './shared/app-footer';
import { ChatWidget } from './shared/chat-widget/chat-widget';
import { ColdStartNotice } from './shared/cold-start-notice';
import { MobileNav } from './shared/mobile-nav/mobile-nav';
import { ThemeToggle } from './shared/theme-toggle';
import { TourOverlay } from './shared/tour-overlay';
import { VideoTourModal } from './shared/video-tour-modal/video-tour-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle, TourOverlay, VideoTourModal, ChatWidget, MobileNav, ColdStartNotice, AppFooter],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
/**
 * Root shell: hosts the routed views, the always-visible theme toggle, the product-tour overlay
 * (kept here, outside the router outlet, so it survives the navigations a tour step makes), the
 * cold-start notice and build footer — and, once signed in, the floating study assistant and the
 * phone navigation bar.
 */
export class App {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  private readonly currentUrl = signal<string>(this.router.url);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects || event.url);
      });
  }

  /**
   * Hide the fixed cold-start notice on public landing and exploration pages so visitors can
   * browse problem sets, study guides, and video hub freely without distraction while the
   * backend warms up silently behind the scenes.
   */
  protected readonly isPublicExploration = computed(() => {
    const raw = this.currentUrl();
    const clean = raw.split('?')[0].split('#')[0];
    return (
      clean === '' ||
      clean === '/' ||
      clean.startsWith('/study-guides') ||
      clean.startsWith('/videos') ||
      clean === '/guide'
    );
  });
}
