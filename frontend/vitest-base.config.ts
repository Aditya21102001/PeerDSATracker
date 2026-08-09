import { defineConfig } from 'vitest/config';

/**
 * Runner configuration for `ng test`, referenced by `runnerConfig` in angular.json.
 *
 * Deliberately minimal — it sets concurrency and nothing else. The Angular builder supplies its
 * own environment, include globs and setup files, and overriding those here silently changed which
 * spec files were even discovered.
 *
 * Why constrain concurrency at all: the accessibility suite runs axe-core inside jsdom, which
 * builds a full rule engine over every rendered screen and is far heavier than an ordinary unit
 * test. Vitest's default fan-out is one worker per CPU core, and several jsdom+axe environments
 * resident at once will exhaust the machine before the suite finishes.
 *
 * That failure mode is worse than a slow suite. A killed worker reports "Worker exited
 * unexpectedly" while the summary still counts the surviving files as passed — so the run looks
 * green while having silently skipped whole spec files. A suite that quietly stops checking is
 * indistinguishable from one that found nothing wrong.
 */
export default defineConfig({
  test: {
    // Run spec files one at a time. The whole suite takes seconds either way, and this is what
    // keeps peak memory to a single jsdom environment.
    fileParallelism: false,
  },
});
