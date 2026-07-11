import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';

/**
 * A public how-it-works page, linked from the welcome page and the dashboard nav. It has no
 * guard, so both logged-out visitors and signed-in users can read it — the header CTA adapts
 * to which they are (Dashboard vs. Get started) via {@link AuthStore.isAuthenticated}.
 *
 * The numbers here (XP values, the interval ladder, XP-per-level) mirror the backend and must
 * be kept in step with GamificationService and RevisionSchedule if those ever change.
 */
@Component({
  selector: 'app-guide-page',
  imports: [RouterLink],
  template: `
    <main class="guide">
      <header>
        <h1>How The Grind works</h1>
        <nav>
          @if (isAuthenticated()) {
            <a routerLink="/dashboard">Dashboard</a>
            <a routerLink="/sheet">Sheet</a>
          } @else {
            <a routerLink="/">Home</a>
            <a routerLink="/signup" class="btn btn-sm">Get started</a>
          }
        </nav>
      </header>

      <p class="lede">
        Everything here is built around one loop: solve a problem, mark it, and let the app turn
        that into XP, a streak, and a revision plan. Here's each piece.
      </p>

      <ol class="toc" aria-label="Contents">
        <li><a href="#start">Getting started</a></li>
        <li><a href="#sheet">The sheet &amp; statuses</a></li>
        <li><a href="#xp">XP, levels &amp; badges</a></li>
        <li><a href="#streak">Streaks &amp; the heatmap</a></li>
        <li><a href="#revision">Revision</a></li>
        <li><a href="#notes">Notes</a></li>
        <li><a href="#code">Write &amp; run code</a></li>
        <li><a href="#peers">Peers &amp; leaderboards</a></li>
        <li><a href="#platforms">Linked platforms</a></li>
      </ol>

      <section id="start" class="card">
        <h2>1. Getting started</h2>
        <p>
          Create an account, and your copy of the Striver A2Z sheet — 474 problems across 18 steps
          — is ready on first login. Open <strong>Sheet</strong> from the dashboard to begin. There
          is nothing to install and nothing to configure.
        </p>
      </section>

      <section id="sheet" class="card">
        <h2>2. The sheet &amp; statuses</h2>
        <p>Each problem carries one status, which you set as you work:</p>
        <ul class="defs">
          <li><span class="pill" data-level="EASY">Solved</span> You cracked it. This is the only status that earns XP and feeds your streak.</li>
          <li><span class="tag">Attempted</span> You had a go but didn't finish. No XP — just a marker to come back.</li>
          <li><span class="tag">Revisit</span> Worth another look. Pairs naturally with the revision queue.</li>
          <li><span class="tag star">★ Star</span> A bookmark, independent of status. Star anything you want to find fast.</li>
        </ul>
        <p class="muted">
          Filter the list by step, difficulty, text, or status — including <em>Unsolved</em> and
          <em>Starred</em> — to zero in on what's next.
        </p>
      </section>

      <section id="xp" class="card">
        <h2>3. XP, levels &amp; badges</h2>
        <p>Marking a problem <strong>Solved</strong> awards XP by difficulty:</p>
        <ul class="xp-row">
          <li><span class="pill" data-level="EASY">Easy</span> 10 XP</li>
          <li><span class="pill" data-level="MEDIUM">Medium</span> 20 XP</li>
          <li><span class="pill" data-level="HARD">Hard</span> 40 XP</li>
        </ul>
        <p>
          You gain a level every <strong>500 XP</strong>; the full sheet is worth 10,680 XP.
          <strong>Badges</strong> unlock automatically as you hit milestones for total solves,
          streak length, and XP — and once earned, a badge is never taken away. Un-marking a solve
          cleanly refunds its XP, so nothing drifts.
        </p>
      </section>

      <section id="streak" class="card">
        <h2>4. Streaks &amp; the heatmap</h2>
        <p>
          Solve at least one problem in a day and your <strong>streak</strong> grows by one; miss a
          day and it resets to zero. The dashboard <strong>heatmap</strong> shows every active day,
          GitHub-style — darker cells mean more solved. A day with no activity simply stays blank.
        </p>
        <p class="muted">
          "Day" follows the server's configured time zone, so late-night solves land on the day you
          meant them to.
        </p>
      </section>

      <section id="revision" class="card">
        <h2>5. Revision (spaced repetition)</h2>
        <p>
          Schedule any problem for revision and it comes back to you on a fixed interval ladder:
        </p>
        <p class="ladder"><span>1</span><span>3</span><span>7</span><span>16</span><span>35</span><span>90</span><small>days</small></p>
        <p>
          When a review is due, mark <strong>Got it</strong> to climb one rung (wait longer next
          time) or <strong>Forgot</strong> to drop back to a 1-day interval. Scheduling never
          changes a problem's solved status — the two are independent. The <strong>Revision</strong>
          page splits everything into what's due now and what's coming up.
        </p>
      </section>

      <section id="notes" class="card">
        <h2>6. Notes</h2>
        <p>
          Keep one note per problem — your approach, the edge cases, why you got it wrong. Find them
          all on the <strong>Notes</strong> page. Clearing a note deletes it.
        </p>
      </section>

      <section id="code" class="card">
        <h2>7. Write &amp; run code</h2>
        <p>
          Every problem has a <strong>Code</strong> editor (from the sheet, or the Code link on a
          note). Pick a language — Python, C++, Java, JavaScript, C, or Go — write your solution, and
          hit <strong>Run</strong> to execute it against optional standard input; you'll see stdout,
          any errors, and the exit code. <strong>Save</strong> keeps a draft per language, so it's
          waiting for you next time.
        </p>
        <p class="muted">
          Code runs in a secure sandbox, not in your browser, so the first run after an idle spell
          can take a few seconds while it warms up.
        </p>
      </section>

      <section id="peers" class="card">
        <h2>8. Peers &amp; leaderboards</h2>
        <p>
          Search for other users and <strong>follow</strong> them. The <strong>Leaderboard</strong>
          has two views: a <em>global</em> board ranked by XP, and a <em>peers</em> board of just you
          and the people you follow. Ranks are real global positions, so they stay meaningful as you
          page through.
        </p>
      </section>

      <section id="platforms" class="card">
        <h2>9. Linked platforms</h2>
        <p>
          On <strong>Platforms</strong> you can link your LeetCode and Codeforces handles to see
          those stats next to your sheet progress. Codeforces has an official API and is reliable;
          LeetCode is best-effort, and a failed sync never touches your sheet. These external numbers
          are shown side by side — they're never merged into your streak or XP, which you earn here.
        </p>
      </section>

      <section class="closer">
        @if (isAuthenticated()) {
          <a routerLink="/sheet" class="btn">Open the sheet</a>
        } @else {
          <a routerLink="/signup" class="btn">Start grinding</a>
          <a routerLink="/signin" class="btn btn-quiet">Sign in</a>
        }
      </section>
    </main>
  `,
  styleUrl: './guide-page.scss',
})
export class GuidePage {
  private readonly auth = inject(AuthStore);

  /** Drives the header/footer CTAs: Dashboard/Open the sheet when signed in, Get started when not. */
  protected readonly isAuthenticated = this.auth.isAuthenticated;
}
