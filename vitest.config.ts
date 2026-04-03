/**
 * Vitest configuration for the tower defense game.
 *
 * Testing strategy for games:
 * 1. Unit tests: pure logic (pathfinding, damage calc, economy, wave scaling).
 *    These have zero Phaser dependency and run fast.
 * 2. Integration tests: cross-system event flows (enemy death -> currency award).
 *    These mock Phaser APIs but test real system interactions.
 * 3. Visual tests: NOT run in CI. Phaser WebGL needs a real browser.
 *    Visual correctness is verified by QA via Playwright.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* Run tests from the tests/ directory, matching *.test.ts files. */
    include: ['tests/**/*.test.ts'],

    /* Use the Node environment -- no DOM needed for pure logic tests.
     * Tests that need Phaser APIs mock them via vi.mock(). */
    environment: 'node',

    /* Coverage configuration using V8 provider. */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      /* Exclude entry points, config files, and type-only files from coverage.
       * These are either trivial or contain no testable logic. */
      exclude: [
        'src/main.ts',
        'src/config/**',
        'src/types/**',
        'src/scenes/**',
      ],
      reporter: ['text', 'lcov'],
    },

    /* Global test timeout -- game logic tests should be fast.
     * If a test takes >5 seconds, something is wrong. */
    testTimeout: 5000,
  },
});
