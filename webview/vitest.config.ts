import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // CSS is excluded (replaced with empty strings) by default for speed.
    // streaming.css is opted back in so RTL-exception tests can assert real
    // computed styles (direction/unicode-bidi) on rendered code/katex nodes
    // instead of just checking class/data-attribute presence.
    // index.css is opted back in so ideThemeSync.css.test.ts can read it via
    // `?raw` and assert the IDE-theme-sync fallback chains (issue #267);
    // excluded, the import silently yields '' and the guards pass vacuously.
    css: {
      include: [/streaming\.css/, /index\.css/],
    },
    reporters: ['default', 'html'],
    outputFile: {
      html: './html/index.html',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 25,
        branches: 60,
        functions: 29,
        lines: 25,
      },
    },
  },
});
