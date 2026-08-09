import { Component, input } from '@angular/core';

export interface MailSummaryItem {
  title: string;
  senderName: string;
  senderEmail: string;
  timestamp: string;
  subject: string;
  summary: string;
  highlights: string[];
  footer?: string;
  accent?: string;
}

@Component({
  selector: 'app-mail-summary-card',
  imports: [],
  template: `
    <article class="mail-card">
      <div class="mail-head">
        <div class="mail-meta">
          <span class="mail-icon" aria-hidden="true">{{ item().accent ?? '✉️' }}</span>
          <div>
            <h3>{{ item().subject }}</h3>
            <p class="sender">{{ item().senderName }} · {{ item().senderEmail }}</p>
          </div>
        </div>
        <span class="stamp">{{ item().timestamp }}</span>
      </div>

      <div class="mail-body">
        <p class="title">{{ item().title }}</p>
        <p class="summary">{{ item().summary }}</p>

        @if (item().highlights.length) {
          <ul class="highlights">
            @for (highlight of item().highlights; track highlight) {
              <li>{{ highlight }}</li>
            }
          </ul>
        }

        @if (item().footer) {
          <p class="footer">{{ item().footer }}</p>
        }
      </div>
    </article>
  `,
  styleUrl: './mail-summary-card.scss',
})
export class MailSummaryCard {
  readonly item = input.required<MailSummaryItem>();
}
