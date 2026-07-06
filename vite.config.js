import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // The layout-fuzz harness (scripts/) is a measurement tool, not part of
    // the pass/fail unit suite — it is EXPECTED to surface failures while we
    // baseline the current engine, so it must never run under `npm test`.
    // It has its own config (scripts/fuzz.vitest.config.js).
    exclude: ['**/node_modules/**', '**/dist/**', 'scripts/**'],
  },
})
