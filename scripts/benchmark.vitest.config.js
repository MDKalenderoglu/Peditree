import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated vitest config for the layout-engine benchmark (measurement only,
// never part of `npm test`). Driven by scripts/layout-benchmark.mjs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/layout-benchmark.runner.mjs'],
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
