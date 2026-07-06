import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated vitest config for the layout-fuzz harness ONLY. Kept separate
// from vite.config.js so the fuzz runner (which is a MEASUREMENT tool and is
// expected to surface failures) never runs as part of the normal `npm test`
// pass/fail suite. Driven by scripts/layout-fuzz.mjs (the CLI wrapper).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/layout-fuzz.runner.mjs'],
    // The harness records failures in a report; it must not fail the process
    // itself, so no assertion-based gating and a generous timeout for large
    // --cases runs.
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
