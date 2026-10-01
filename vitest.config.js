import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose — keeps the dev/build config free
// of test-only concerns. environment: 'node' still covers everything here
// (grown well past the original utils.js starter suite to ~587 tests across
// utils.js/maxAddons.js/interactions.js and every edge function's logic.ts,
// deliberately pure-logic-only by convention — see e.g. maxAddons.test.js
// and any supabase/functions/*/logic.test.ts) since none of it touches the
// DOM; switch to 'jsdom' if/when real component-render tests are added.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
