import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Redirects HOME at a throwaway directory before any test module loads, so
    // no test can read or rewrite the real `~/.claude-code-gui`. Read the file
    // before removing this line — it explains what breaks without it.
    setupFiles: ['./vitest.setup.ts'],
    // Several tests spawn real child processes (git / find / reg / which …).
    // Under parallel load the default 5s timeout is occasionally exceeded,
    // producing flaky failures; give headroom so they stay deterministic.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
