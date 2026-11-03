import { defineConfig } from 'vitest/config'

/** Live tests against real provider APIs: `npm run test:live`. Not part of `npm test` or CI. */
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/live/**/*.live.ts'],
  },
})
