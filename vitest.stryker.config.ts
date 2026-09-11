import { defineConfig } from 'vitest/config';

// Config used only by Stryker mutation runs. It excludes the seeded property
// fuzzer (test/invariants.test.ts) and the domain-edge scans
// (test/horizon.test.ts, plus the extended vectors that scan to the horizon,
// skipped via DTREXP_SKIP_HORIZON): under per-test mutation instrumentation
// they would be re-executed for every mutant, which is prohibitively slow and
// adds no mutation signal the deterministic suites don't already provide. All
// of them still run in the normal `vitest` / CI suite.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['test/**/*.{test,spec}.ts'],
    env: { DTREXP_SKIP_HORIZON: '1' },
    exclude: ['test/invariants.test.ts', 'test/horizon.test.ts', 'node_modules/**']
  }
});
