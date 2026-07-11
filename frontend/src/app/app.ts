import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/services/auth.store';
import { ChatWidget } from './shared/chat-widget/chat-widget';
import { ThemeToggle } from './shared/theme-toggle';
import { TourOverlay } from './shared/tour-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle, TourOverlay, ChatWidget],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
/**
 * Root shell: hosts the routed views, the always-visible theme toggle, the product-tour overlay
 * (kept here, outside the router outlet, so it survives the navigations a tour step makes), and —
 * once signed in — the floating study assistant.
 */
export class App {
  protected readonly auth = inject(AuthStore);
}
