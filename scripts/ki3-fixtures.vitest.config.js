import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated vitest config for (re)generating the frozen KI-3 stress
// fixtures — a provenance tool, never part of `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/ki3-fixtures.runner.mjs'],
    testTimeout: 900000,
    hookTimeout: 900000,
  },
});
