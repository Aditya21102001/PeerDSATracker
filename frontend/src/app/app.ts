import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/services/auth.store';
import { AppFooter } from './shared/app-footer';
import { ChatWidget } from './shared/chat-widget/chat-widget';
import { ColdStartNotice } from './shared/cold-start-notice';
import { MobileNav } from './shared/mobile-nav/mobile-nav';
import { ThemeToggle } from './shared/theme-toggle';
import { TourOverlay } from './shared/tour-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle, TourOverlay, ChatWidget, MobileNav, ColdStartNotice, AppFooter],
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
}
