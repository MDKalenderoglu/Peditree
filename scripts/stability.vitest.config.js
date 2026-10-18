import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated vitest config for the edit-stability measurement (KI-2) —
// measurement only, never part of `npm test`. Driven by scripts/layout-stability.mjs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/layout-stability.runner.mjs'],
    testTimeout: 1800000,
    hookTimeout: 1800000,
  },
});
