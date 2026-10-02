import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudyGuidesService } from '../../core/services/study-guides.service';

/**
 * Landing page for the Study Guides section. Shows all available guides as
 * rich cards with icon, colour, and description. Each card routes to the
 * guide detail page where users browse topics and sections.
 */
@Component({
  selector: 'app-study-guides-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="sg-page">
      <header class="sg-header">
        <div class="sg-header-text">
          <h1>Study Guides</h1>
          <p class="sg-lead">
            Comprehensive notes on the topics that matter most — DSA patterns, Java internals,
            Spring Boot, Angular, and System Design.
          </p>
        </div>
        <nav class="sg-nav">
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/hire">Hire</a>
        </nav>
      </header>

      <div class="sg-grid">
        @for (guide of guides; track guide.id) {
          <a [routerLink]="['/study-guides', guide.id]" class="sg-card" [style.--accent-rgb]="guide.color">
            <div class="sg-card-icon" [style.background]="guide.color + '22'" [style.border-color]="guide.color + '44'">
              <span>{{ guide.icon }}</span>
            </div>
            <div class="sg-card-body">
              <h2>{{ guide.title }}</h2>
              <p>{{ guide.description }}</p>
              <div class="sg-card-meta">
                <span class="topic-count">{{ guide.topics.length }} topics</span>
                <span class="cta">Explore →</span>
              </div>
            </div>
            <div class="sg-card-shine"></div>
          </a>
        }
      </div>
    </main>
  `,
  styleUrl: './study-guides-page.scss',
})
export class StudyGuidesPage {
  private readonly svc = inject(StudyGuidesService);
  protected readonly guides = this.svc.getAll();
}
