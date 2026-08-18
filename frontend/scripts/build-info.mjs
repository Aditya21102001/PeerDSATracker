/**
 * Generates src/build-info.ts, the build's own identity: which commit, packaged when.
 *
 * Runs from the `prebuild`/`prestart`/`pretest`/`prewatch` npm hooks, so `npm run build` and
 * friends pick it up with nothing to remember. That is also the catch -- `npx ng build` skips npm
 * lifecycle hooks entirely and will fail to resolve the import. Use the npm scripts.
 *
 * The output is gitignored on purpose. Committing it would mean a timestamp changing in every
 * working tree that ran a build, and a stale value shipping whenever someone forgot to rebuild it.
 *
 * On Vercel the commit comes from VERCEL_GIT_COMMIT_SHA, which is set during the build; locally it
 * comes from git. Neither is guaranteed (a source tarball has no .git), and a missing commit is not
 * worth failing a build over -- the footer just shows the timestamp alone.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Empty string, never a throw: this is decoration, not a build input. */
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const sha = process.env.VERCEL_GIT_COMMIT_SHA || git('rev-parse', 'HEAD');
const branch =
  process.env.VERCEL_GIT_COMMIT_REF || git('rev-parse', '--abbrev-ref', 'HEAD');

const info = {
  // Short form is what a person reads; the long sha is what `git show` wants, and 7 characters
  // are ambiguous in a big repo -- so keep both and let the footer choose.
  commit: sha,
  commitShort: sha.slice(0, 7),
  branch,
  /**
   * When this bundle was built. On Vercel that is within seconds of the deploy going live, which
   * is what the footer calls "deployed". Stored as an ISO instant and formatted in the browser, so
   * it reads in the viewer's timezone rather than the build machine's.
   */
  builtAt: new Date().toISOString(),
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'build-info.ts');

writeFileSync(
  out,
  `/**
 * GENERATED FILE -- do not edit, do not commit. Rewritten by scripts/build-info.mjs on every
 * \`npm run build\` / \`npm start\`. See that script for why this is not checked in.
 */
export const buildInfo = ${JSON.stringify(info, null, 2)} as const;
`,
  'utf8',
);

console.log(`build-info: ${info.commitShort || '(no git)'} @ ${info.builtAt}`);
