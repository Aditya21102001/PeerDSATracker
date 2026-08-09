import { Component, computed, input } from '@angular/core';
import { TopicMastery } from '../../core/models/api.models';

@Component({
  selector: 'app-mastery-chart',
  template: `
    <figure class="mastery">
      <figcaption>
        <span class="cap">Topic mastery</span>
        <span class="scale" aria-hidden="true">
          <span>weak</span>
          @for (s of [1, 2, 3, 4, 5]; track s) {
            <i [attr.data-band]="s"></i>
          }
          <span>strong</span>
        </span>
      </figcaption>

      <!--
        A table, not a div soup. The rows ARE tabular data, so this gives screen-reader users
        real row/column navigation and gives everyone a text fallback for the bars — which is
        also what discharges the validator's contrast warning on the palest step.
      -->
      <table>
        <caption class="sr-only">
          Mastery by topic, strongest first. Each row gives the percentage and the number of
          problems solved out of the total for that topic.
        </caption>
        <thead>
          <tr>
            <th scope="col">Topic</th>
            <th scope="col">Mastery</th>
            <th scope="col" class="num">Solved</th>
          </tr>
        </thead>
        <tbody>
          @for (t of rows(); track t.topic) {
            <tr>
              <th scope="row">{{ t.topic }}</th>
              <td>
                <span class="track">
                  <!-- Length is the encoding; colour only reinforces it. -->
                  <span class="fill" [attr.data-band]="band(t.mastery)" [style.width.%]="pct(t.mastery)"></span>
                </span>
                <span class="value">{{ pct(t.mastery) }}%</span>
              </td>
              <td class="num">{{ t.solved }}/{{ t.total }}</td>
            </tr>
          }
        </tbody>
      </table>
    </figure>
  `,
  styleUrl: './mastery-chart.scss',
})
/**
 * Mastery per topic, as a sorted bar chart.
 *
 * <p>Form follows the data's job: this is one magnitude per category, which is a bar — not a
 * grid heatmap (that is for a two-dimensional matrix) and not a pie. Sorting strongest-first is
 * what makes it answer the actual question, "where am I weakest", by putting the answer at the
 * bottom where the eye lands last and stays.
 *
 * <p><b>Length carries the value; colour only reinforces it.</b> The five-step ramp is a single
 * hue, light to dark, validated with the dataviz validator against both surfaces — monotone
 * lightness, visible step gaps, and a light end that still clears 2:1 so the weakest bar cannot
 * dissolve into the card behind it. A traffic-light red/amber/green ramp was rejected: those are
 * reserved status colours, and a rainbow across a continuous magnitude is unreadable to anyone
 * with a colour-vision deficiency.
 *
 * <p>Every row states its percentage and its solved/total as text, so nothing here is conveyed by
 * colour alone.
 */
export class MasteryChart {
  /** Unsorted topics; typically the weakest and strongest lists concatenated. */
  readonly topics = input.required<TopicMastery[]>();

  /** How many rows to show. Beyond this the panel stops being scannable. */
  readonly limit = input(8);

  protected readonly rows = computed(() =>
    [...this.topics()]
      // Strongest first, so the weak tail collects at the bottom and reads as one block.
      .sort((a, b) => b.mastery - a.mastery)
      .slice(0, this.limit()),
  );

  /** Mastery arrives as 0..1 from the analytics service. */
  protected pct(mastery: number): number {
    return Math.round(Math.max(0, Math.min(1, mastery)) * 100);
  }

  /** Which of the five ramp steps this value sits in. */
  protected band(mastery: number): number {
    return Math.min(5, Math.floor(this.pct(mastery) / 20) + 1);
  }
}
