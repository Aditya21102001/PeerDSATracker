/** Production. Swapped in by the `fileReplacements` in angular.json. */
export const environment = {
  production: true,

  // No mailer for the older emailed-link reset flow, so the "Forgot?" link would go nowhere.
  // Recovery in production goes through the one-time code flow (/code) instead, which does have
  // a working transport. Flip this the day ResetLinkDeliverer sends real mail, alongside
  // RESET_ENABLED=true on the backend.
  resetEnabled: false,

  /**
   * Google sign-in starts directly against the backend, NOT through Vercel's /api rewrite.
   *
   * Spring keeps the pending authorization request in a session cookie between the redirect out
   * to Google and the callback back. Starting the flow through Vercel would set that cookie on the
   * Vercel domain, while Google returns the browser straight to the backend's own domain — where
   * the cookie is not sent, and the callback fails on a state mismatch. Both hops have to be the
   * same origin, so both are the backend's.
   *
   * Whatever value is here must ALSO be registered in the Google Cloud console as
   * `<this origin>/login/oauth2/code/google`.
   */
  apiOrigin: 'https://peerdsatracker.onrender.com',
};
