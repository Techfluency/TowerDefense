/**
 * Tests for game type definitions and event constants.
 *
 * Verifies that all cross-system event names are defined, unique,
 * and match their expected string values. This prevents event name
 * typos and ensures all events are documented.
 */
import { describe, it, expect } from 'vitest';
import { GAME_EVENTS } from '../../src/types/game-types';

describe('GAME_EVENTS', () => {
  it('should define all cross-system event names', () => {
    /* Original BOLT-001 scaffold events. */
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

  it('should define new BOLT-001 input and combat events', () => {
    /* New events added by BOLT-001 engineering. */
    expect(GAME_EVENTS.ENEMY_DAMAGED).toBe('ENEMY_DAMAGED');
    expect(GAME_EVENTS.TOWER_FIRED).toBe('TOWER_FIRED');
    expect(GAME_EVENTS.ENEMY_HIT).toBe('ENEMY_HIT');
    expect(GAME_EVENTS.TILE_CLICKED).toBe('TILE_CLICKED');
    expect(GAME_EVENTS.TILE_HOVER_CHANGED).toBe('TILE_HOVER_CHANGED');
    expect(GAME_EVENTS.INPUT_CANCEL).toBe('INPUT_CANCEL');
  });

  it('should have unique event names (no accidental duplicates)', () => {
    const values = Object.values(GAME_EVENTS);
    const uniqueValues = new Set(values);

    /* If two events accidentally share the same string value, listeners
     * for one event would fire on the other. This must never happen. */
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should define BOLT-003 enemy spawned event', () => {
    expect(GAME_EVENTS.ENEMY_SPAWNED).toBe('ENEMY_SPAWNED');
  });

  it('should have exactly 22 events defined', () => {
    /* 12 original + 6 BOLT-001 + 1 BOLT-002 + 1 BOLT-003 (ENEMY_SPAWNED) + 1 BOLT-007 (TOWER_REPAIRED) + 1 BOLT-011 (AUTO_TILE_READY). */
    expect(Object.keys(GAME_EVENTS).length).toBe(22);
  });

  it('should use SUBJECT_ACTION naming pattern', () => {
    /* All event names should follow the SUBJECT_ACTION pattern with
     * underscores between words -- no camelCase or kebab-case. */
    for (const value of Object.values(GAME_EVENTS)) {
      expect(value).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    }
  });
});
