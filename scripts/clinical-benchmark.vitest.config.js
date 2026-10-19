import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated vitest config for the Clinical Usability Benchmark — measurement
// only, never part of `npm test`. Driven by scripts/clinical-benchmark.mjs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/clinical-benchmark.runner.mjs'],
    testTimeout: 600000,
  },
});
