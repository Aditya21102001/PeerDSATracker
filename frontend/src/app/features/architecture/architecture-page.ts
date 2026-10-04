import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

type DiagramTab = 'architecture' | 'workflow';

@Component({
  selector: 'app-architecture-page',
  imports: [RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="arch-container">
      <header class="arch-header">
        <div class="header-left">
          <div class="badge-row">
            <span class="archify-badge">ARCHIFY INTERACTIVE</span>
            <span class="tech-tag">SVG + Wasm Runtime</span>
          </div>
          <h1>System Architecture & Flow Engine</h1>
          <p class="subtitle">
            Interactive, verified architectural maps and camera presence workflows generated with Archify.
          </p>
        </div>

        <nav class="header-nav">
          @if (isAuthenticated()) {
            <a routerLink="/dashboard" class="nav-btn">⚡ Dashboard</a>
            <a routerLink="/videos" class="nav-btn">📺 Video Hub</a>
            <a routerLink="/study-guides" class="nav-btn">📚 Study Guides</a>
          } @else {
            <a routerLink="/" class="nav-btn">🏠 Home</a>
            <a routerLink="/videos" class="nav-btn">📺 Video Hub</a>
            <a routerLink="/guide" class="nav-btn">📖 Guide</a>
          }
        </nav>
      </header>

      <div class="controls-bar">
        <div class="tab-pills" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 'architecture'"
            class="tab-btn"
            [class.active]="activeTab() === 'architecture'"
            (click)="switchTab('architecture')"
          >
            🏛️ Full System Architecture
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 'workflow'"
            class="tab-btn"
            [class.active]="activeTab() === 'workflow'"
            (click)="switchTab('workflow')"
          >
            ⚡ Camera Presence & Gesture Workflow
          </button>
        </div>

        <div class="actions">
          <a
            [href]="activeDiagramRawUrl()"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-popout"
            title="Open standalone diagram in new tab"
          >
            Open in Full Tab ↗
          </a>
        </div>
      </div>

      <section class="viewer-section">
        <div class="frame-wrapper">
          <iframe
            [src]="sanitizedUrl()"
            class="archify-frame"
            title="Archify Interactive Architecture Diagram"
            allow="fullscreen"
          ></iframe>
        </div>

        <div class="feature-hints">
          <div class="hint-card">
            <span class="hint-icon">🔍</span>
            <div class="hint-text">
              <strong>Interactive Pan & Zoom</strong>
              <span>Scroll wheel or pinch to zoom. Click and drag canvas to pan across subsystems.</span>
            </div>
          </div>
          <div class="hint-card">
            <span class="hint-icon">🎯</span>
            <div class="hint-text">
              <strong>Click to Inspect & Trace</strong>
              <span>Click any component, service box, or boundary to view technical metadata and trace routes.</span>
            </div>
          </div>
          <div class="hint-card">
            <span class="hint-icon">🌓</span>
            <div class="hint-text">
              <strong>Theme & Export</strong>
              <span>Use the in-viewer toolbar to switch between Dark/Light themes or export diagrams to SVG/PNG.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .arch-container {
      max-width: 1540px;
      margin: 0 auto;
      padding: 1.5rem 2rem 3rem;
      color: #f1f5f9;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .arch-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      gap: 1.5rem;
      flex-wrap: wrap;

      .badge-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;

        .archify-badge {
          background: linear-gradient(135deg, #0284c7, #0891b2);
          color: #ffffff;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.6rem;
          border-radius: 9999px;
          text-transform: uppercase;
        }

        .tech-tag {
          background: rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          font-size: 0.72rem;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }
      }

      h1 {
        font-size: 1.85rem;
        font-weight: 800;
        margin: 0 0 0.4rem;
        background: linear-gradient(135deg, #f8fafc, #94a3b8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .subtitle {
        color: #94a3b8;
        font-size: 0.95rem;
        margin: 0;
      }

      .header-nav {
        display: flex;
        align-items: center;
        gap: 0.6rem;

        .nav-btn {
          padding: 0.45rem 0.9rem;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s ease;

          &:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.2);
          }
        }
      }
    }

    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0.6rem 0.9rem;
      margin-bottom: 1.25rem;
      gap: 1rem;
      flex-wrap: wrap;

      .tab-pills {
        display: flex;
        gap: 0.4rem;

        .tab-btn {
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;

          &:hover {
            color: #f8fafc;
            background: rgba(255, 255, 255, 0.05);
          }

          &.active {
            background: #0284c7;
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
          }
        }
      }

      .btn-popout {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 0.9rem;
        border-radius: 8px;
        background: rgba(14, 165, 233, 0.15);
        border: 1px solid rgba(14, 165, 233, 0.3);
        color: #38bdf8;
        font-size: 0.82rem;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(14, 165, 233, 0.25);
          border-color: #38bdf8;
          color: #ffffff;
        }
      }
    }

    .viewer-section {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;

      .frame-wrapper {
        width: 100%;
        height: 760px;
        background: #090d16;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);

        .archify-frame {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      }

      .feature-hints {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;

        .hint-card {
          display: flex;
          align-items: flex-start;
          gap: 0.8rem;
          padding: 0.9rem 1.1rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;

          .hint-icon {
            font-size: 1.3rem;
            line-height: 1;
          }

          .hint-text {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;

            strong {
              font-size: 0.88rem;
              color: #f1f5f9;
            }

            span {
              font-size: 0.78rem;
              color: #94a3b8;
              line-height: 1.4;
            }
          }
        }
      }
    }

    @media (max-width: 768px) {
      .arch-container {
        padding: 1rem;
      }

      .viewer-section .frame-wrapper {
        height: 520px;
      }
    }
  `],
})
export class ArchitecturePage {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly auth = inject(AuthStore, { optional: true });

  readonly activeTab = signal<DiagramTab>('architecture');

  readonly isAuthenticated = computed(() => !!this.auth?.isAuthenticated());

  readonly activeDiagramRawUrl = computed(() => {
    return this.activeTab() === 'architecture'
      ? '/archify/architecture.html'
      : '/archify/workflow.html';
  });

  readonly sanitizedUrl = computed<SafeResourceUrl>(() => {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.activeDiagramRawUrl());
  });

  switchTab(tab: DiagramTab): void {
    this.activeTab.set(tab);
  }
}
