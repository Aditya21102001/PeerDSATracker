/** Production. Swapped in by the `fileReplacements` in angular.json. */
export const environment = {
  production: true,

  // No mailer in production. Keeping this true would show a "Forgot?" link whose
  // reset email never arrives. Flip it the day a mailer exists, alongside
  // RESET_ENABLED=true on the backend.
  resetEnabled: false,
};
