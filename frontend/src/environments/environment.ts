/** Development. Replaced by environment.prod.ts in the production build. */
export const environment = {
  production: false,

  /**
   * Password reset needs a mailer the backend does not have yet: reset links are
   * written to the application log. Enabled locally so the flow can be exercised;
   * turned off in production, where the backend also 404s /forgot and /reset.
   */
  resetEnabled: true,
};
