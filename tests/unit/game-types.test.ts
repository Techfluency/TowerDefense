/**
 * Example unit test demonstrating the canonical test pattern.
 *
 * This test verifies the game type definitions and event constants.
 * It serves as the reference pattern for all future tests:
 *
 * 1. Import the module under test (NOT Phaser -- unit tests never import Phaser).
 * 2. Use describe() to group related tests by module or feature.
 * 3. Use it() with a descriptive name that reads as a sentence.
 * 4. Assert expected behavior. When testing types, verify the runtime
 *    shape of exported constants since TypeScript types are erased.
 *
 * Testing strategy:
 * - Unit tests live in tests/unit/ and test pure logic with no Phaser dependency.
 * - Integration tests live in tests/integration/ and may mock Phaser APIs.
 * - Visual tests are NOT in this repo -- QA runs them via Playwright.
 */
import { describe, it, expect } from 'vitest';
import { GAME_EVENTS } from '../../src/types/game-types';

describe('GAME_EVENTS', () => {
  it('should define all cross-system event names', () => {
    /* Every inter-system event must be defined here. If a new event is
     * added to GAME_EVENTS, this test should be updated to include it.
     * This prevents event name typos and ensures all events are documented. */
    expect(GAME_EVENTS.ENEMY_DIED).toBe('ENEMY_DIED');
    expect(GAME_EVENTS.ENEMY_REACHED_OBJECTIVE).toBe('ENEMY_REACHED_OBJECTIVE');
    expect(GAME_EVENTS.WAVE_STARTED).toBe('WAVE_STARTED');
    expect(GAME_EVENTS.WAVE_COMPLETED).toBe('WAVE_COMPLETED');
    expect(GAME_EVENTS.ALL_WAVES_COMPLETED).toBe('ALL_WAVES_COMPLETED');
    expect(GAME_EVENTS.TOWER_PLACED).toBe('TOWER_PLACED');
    expect(GAME_EVENTS.TOWER_REMOVED).toBe('TOWER_REMOVED');
    expect(GAME_EVENTS.TOWER_UPGRADED).toBe('TOWER_UPGRADED');
    expect(GAME_EVENTS.CURRENCY_CHANGED).toBe('CURRENCY_CHANGED');
    expect(GAME_EVENTS.SCORE_CHANGED).toBe('SCORE_CHANGED');
    expect(GAME_EVENTS.GAME_PAUSED).toBe('GAME_PAUSED');
    expect(GAME_EVENTS.GAME_OVER).toBe('GAME_OVER');
  });

  it('should have unique event names (no accidental duplicates)', () => {
    const values = Object.values(GAME_EVENTS);
    const uniqueValues = new Set(values);

    /* If two events accidentally share the same string value, listeners
     * for one event would fire on the other. This must never happen. */
    expect(uniqueValues.size).toBe(values.length);
  });
});
