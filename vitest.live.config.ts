import { defineConfig } from 'vitest/config'

/** Tests that hit the real Wikipedia API. Run with `npm run test:live`. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.live.test.ts'],
    testTimeout: 60_000,
  },
})
