/** Development. Replaced by environment.prod.ts in the production build. */
export const environment = {
  production: false,

  /**
   * Password reset needs a mailer the backend does not have yet: reset links are
   * written to the application log. Enabled locally so the flow can be exercised;
   * turned off in production, where the backend also 404s /forgot and /reset.
   *
   * Note this is the *older* emailed-link flow. Sign-in by one-time code (/code) is separate,
   * always routed, and does have a working transport.
   */
  resetEnabled: true,

  /**
   * Origin to start a Google sign-in against. Empty means "same origin", which in development is
   * `ng serve` on :4300 proxying /oauth2 and /login/oauth2 through to the backend.
   *
   * Both hops MUST land on the same origin. Spring stores the pending authorization request in a
   * servlet session cookie between the redirect out to Google and the callback back; if the start
   * goes through one origin and Google returns the browser to another, that cookie is missing and
   * the sign-in fails with a state mismatch. Proxying only the first hop is exactly that bug,
   * which is why production points straight at the backend instead of through Vercel's rewrite.
   */
  apiOrigin: '',
};
