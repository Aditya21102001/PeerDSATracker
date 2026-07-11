import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Public landing page, mounted at the app root and gated by guestGuard — a signed-in visitor
 * is bounced straight to /dashboard, so this is only ever seen by logged-out users.
 *
 * It exists to explain what the app is before asking for a signup, and to route newcomers to
 * either the signup form or the how-it-works guide (which is itself public).
 */
@Component({
  selector: 'app-welcome-page',
  imports: [RouterLink],
  template: `
    <main class="welcome">
      <section class="hero">
        <h1>⚡ The Grind ⚡</h1>
        <p class="tagline">Conquer the Striver A2Z sheet — and actually keep coming back.</p>
        <p class="sub">
          A gamified tracker for 474 DSA problems: mark your progress, keep a daily streak alive,
          earn XP and badges, revise with spaced repetition, and race your peers up the leaderboard.
        </p>

        <div class="cta">
          <a routerLink="/signup" class="btn">Start grinding — it's free</a>
          <a routerLink="/guide" class="btn btn-ghost">How it works</a>
        </div>

        <p class="foot">
          Already have an account? <a routerLink="/signin">Sign in</a>
        </p>
      </section>

      <!-- Reuses the stat-strip idiom from the sign-in card so the two public pages rhyme. -->
      <dl class="stats" aria-label="At a glance">
        <div><dt>474</dt><dd>Problems</dd></div>
        <div><dt>18</dt><dd>Steps</dd></div>
        <div><dt>13</dt><dd>Badges</dd></div>
        <div><dt>∞</dt><dd>Peers</dd></div>
      </dl>

      <section class="features" aria-label="Features">
        <h2 class="sr-only">What you get</h2>
        <ul>
          <li class="card">
            <span class="ico" aria-hidden="true">🗺️</span>
            <h3>Track the whole sheet</h3>
            <p>Every problem across 18 steps. Mark it Solved, Attempted, or Revisit, and star the ones worth coming back to.</p>
          </li>
          <li class="card">
            <span class="ico" aria-hidden="true">🔥</span>
            <h3>Build a streak</h3>
            <p>Solve at least one problem a day and watch the streak climb. A GitHub-style heatmap shows every active day.</p>
          </li>
          <li class="card">
            <span class="ico" aria-hidden="true">⭐</span>
            <h3>Earn XP &amp; badges</h3>
            <p>Easy 10, Medium 20, Hard 40. Level up every 500 XP and unlock badges for streaks, solves, and milestones.</p>
          </li>
          <li class="card">
            <span class="ico" aria-hidden="true">🔁</span>
            <h3>Never forget a solution</h3>
            <p>Queue a problem for spaced repetition. It resurfaces on a proven interval ladder so it actually sticks.</p>
          </li>
          <li class="card">
            <span class="ico" aria-hidden="true">🏆</span>
            <h3>Compete with peers</h3>
            <p>Follow friends and see who's ahead on a global board and a private peers-only board.</p>
          </li>
          <li class="card">
            <span class="ico" aria-hidden="true">🔗</span>
            <h3>Bring your stats</h3>
            <p>Link LeetCode and Codeforces to see those numbers alongside your sheet progress.</p>
          </li>
        </ul>
      </section>

      <section class="closer card">
        <h2>Ready when you are.</h2>
        <p>Sign up in seconds and the 474 problems are waiting on your first login.</p>
        <div class="cta">
          <a routerLink="/signup" class="btn">Create an account</a>
          <a routerLink="/guide" class="btn btn-quiet">Read the guide first</a>
        </div>
      </section>
    </main>
  `,
  styleUrl: './welcome-page.scss',
})
export class WelcomePage {}
