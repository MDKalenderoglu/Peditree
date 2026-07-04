import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // `process` is referenced defensively (typeof-guarded) in
      // pedigreeBuilderFromWizard.js's dev-only post-build validation —
      // it is never actually relied upon to exist at runtime in the
      // browser bundle, but ESLint needs to know it's a legitimate global
      // to check `typeof` against, not a typo.
      globals: { ...globals.browser, process: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
