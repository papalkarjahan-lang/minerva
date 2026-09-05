import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose — keeps the dev/build config free
// of test-only concerns. environment: 'node' is enough for now since the
// starter suite only covers utils.js's pure functions (no DOM/component
// rendering yet); switch to 'jsdom' if/when component tests are added.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
