/**
 * Unit tests for BOLT-019: StatusEffectSystem.
 *
 * Tests cover:
 * - Slow effect: applies speed reduction, restores on expiry, refresh behavior
 * - Burn effect: deals DPS over time, expires correctly
 * - Effect clearing on enemy death
 * - Non-stacking behavior (same type refreshes duration, not magnitude)
 * - Multiple effect types on the same enemy
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Phaser (required before importing any source that transitively uses Phaser)
// ---------------------------------------------------------------------------

vi.mock('phaser', () => {
  const EventEmitter = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  return {
    default: {
      Events: { EventEmitter: vi.fn(() => EventEmitter) },
      Scene: vi.fn(),
      Math: {
        Angle: {
          Between: vi.fn(),
          RotateTo: vi.fn((_current: number, _target: number) => _target),
        },
      },
    },
    __esModule: true,
  };
});

import { StatusEffectSystem } from '../../src/systems/status-effect-system';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a minimal mock enemy for status effect tests. */
function createMockEnemy(id: string, speed = 100) {
  return {
    instanceId: id,
    currentSpeed: speed,
    baseSpeed: speed,
    sprite: { x: 100, y: 100 },
    isFlying: false,
    isAlive: () => true,
    getPosition: () => ({ x: 100, y: 100 }),
    getCurrentHp: () => 100,
  };
}

/** Creates a mock EnemySystem with getActiveEnemies and applyDamageToEnemy. */
function createMockEnemySystem(enemies: ReturnType<typeof createMockEnemy>[]) {
  return {
    getActiveEnemies: vi.fn(() => enemies),
    applyDamageToEnemy: vi.fn(),
  };
}

/** Creates a minimal mock scene for StatusEffectSystem. */
function createMockScene() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    events: {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      off: vi.fn(),
      emit: vi.fn((event: string, ...args: unknown[]) => {
        (listeners[event] ?? []).forEach(h => h(...args));
      }),
    },
    registry: {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    },
    __listeners: listeners,
  };
}

/** Creates a StatusEffectSystem with injected mocks. */
function createSystem(enemies: ReturnType<typeof createMockEnemy>[]) {
  const scene = createMockScene();
  const enemySystem = createMockEnemySystem(enemies);
  const gameState = { currency: 1000, score: 0, currentWave: 1, totalWaves: 20, objectiveHp: 100, maxObjectiveHp: 100, isPaused: false, isGameOver: false, gameSeed: 'test', gameMode: 'stage' as const, highestWaveReached: 0, campaignComplete: false };

  /* Make registry.get return the mock enemy system. */
  scene.registry.get = vi.fn((key: string) => {
    if (key === 'enemySystem') return enemySystem;
    return undefined;
  });

  const system = new StatusEffectSystem(scene as unknown as Phaser.Scene, gameState);
  system.init();

  return { system, scene, enemySystem, enemies };
}

// ---------------------------------------------------------------------------
// Slow effect tests
// ---------------------------------------------------------------------------

describe('StatusEffectSystem - Slow effect', () => {
  it('reduces enemy speed when applied', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-1');

    /* Enemy speed should be reduced by 30% (100 * 0.7 = 70). */
    expect(enemy.currentSpeed).toBe(70);
  });

  it('restores enemy speed when slow expires', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 1.0, 0.7, 'tower-1');
    expect(enemy.currentSpeed).toBe(70);

    /* Simulate 1.1 seconds passing (effect expires). */
    system.update(0, 1100);

    expect(enemy.currentSpeed).toBe(100);
  });

  it('refreshes duration on reapplication without stacking', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-1');
    expect(enemy.currentSpeed).toBe(70);

    /* After 1 second, reapply (refreshes duration). */
    system.update(0, 1000);
    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-2');

    /* Speed should still be 70, not 70*0.7=49 (no stacking). */
    expect(enemy.currentSpeed).toBe(70);

    /* After 1 more second, effect should still be active (was refreshed). */
    system.update(0, 1000);
    expect(system.hasEffect('enemy-1', 'slow')).toBe(true);
  });

  it('reports effect is active via hasEffect', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    expect(system.hasEffect('enemy-1', 'slow')).toBe(false);
    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-1');
    expect(system.hasEffect('enemy-1', 'slow')).toBe(true);
  });

  it('returns effects via getEffects', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-1');
    const effects = system.getEffects('enemy-1');
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('slow');
    expect(effects[0].magnitude).toBe(0.7);
  });

  it('clearEffects restores speed', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 5.0, 0.7, 'tower-1');
    expect(enemy.currentSpeed).toBe(70);

    system.clearEffects('enemy-1');
    expect(enemy.currentSpeed).toBe(100);
    expect(system.hasEffect('enemy-1', 'slow')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Burn effect tests
// ---------------------------------------------------------------------------

describe('StatusEffectSystem - Burn effect', () => {
  it('applies burn damage over time', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system, enemySystem } = createSystem([enemy]);

    /* 20 DPS for 1 second. */
    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-1');

    /* Simulate 0.5 seconds (should have applied ~2 burn ticks). */
    system.update(0, 500);

    /* applyDamageToEnemy should have been called with per-tick damage. */
    expect(enemySystem.applyDamageToEnemy).toHaveBeenCalled();
    const calls = enemySystem.applyDamageToEnemy.mock.calls;
    /* Each tick does 20/4 = 5 damage. At 0.5s, should be ~2 ticks. */
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('enemy-1');
    expect(calls[0][1]).toBe(5); // 20 DPS / 4 ticks per second = 5
    expect(calls[0][2]).toBe('fire');
  });

  it('expires after duration', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-1');
    expect(system.hasEffect('enemy-1', 'burn')).toBe(true);

    system.update(0, 1100);
    expect(system.hasEffect('enemy-1', 'burn')).toBe(false);
  });

  it('refreshes duration on reapplication', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-1');
    system.update(0, 800);
    /* Reapply at 0.8s -- should extend duration by another full second. */
    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-1');
    system.update(0, 500);

    /* Should still be active (0.5s into the refreshed 1.0s duration). */
    expect(system.hasEffect('enemy-1', 'burn')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple effects on same enemy
// ---------------------------------------------------------------------------

describe('StatusEffectSystem - Multiple effects', () => {
  it('allows slow and burn on the same enemy simultaneously', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 2.0, 0.7, 'tower-1');
    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-2');

    expect(system.hasEffect('enemy-1', 'slow')).toBe(true);
    expect(system.hasEffect('enemy-1', 'burn')).toBe(true);
    expect(enemy.currentSpeed).toBe(70);

    const effects = system.getEffects('enemy-1');
    expect(effects).toHaveLength(2);
  });

  it('burn expires independently of slow', () => {
    const enemy = createMockEnemy('enemy-1', 100);
    const { system } = createSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 3.0, 0.7, 'tower-1');
    system.applyEffect('enemy-1', 'burn', 1.0, 20, 'tower-2');

    system.update(0, 1100);

    /* Burn expired (1s), slow still active (3s). */
    expect(system.hasEffect('enemy-1', 'slow')).toBe(true);
    expect(system.hasEffect('enemy-1', 'burn')).toBe(false);
    expect(enemy.currentSpeed).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('StatusEffectSystem - Edge cases', () => {
  it('returns empty effects for unknown enemy', () => {
    const { system } = createSystem([]);
    expect(system.getEffects('nonexistent')).toEqual([]);
    expect(system.hasEffect('nonexistent', 'slow')).toBe(false);
  });

  it('clearEffects on unknown enemy is a no-op', () => {
    const { system } = createSystem([]);
    expect(() => system.clearEffects('nonexistent')).not.toThrow();
  });

  it('applies effect even if enemy not in active list (deferred)', () => {
    const { system } = createSystem([]);
    /* Effect is tracked even though the enemy is not found --
     * speed reduction is a no-op but the effect entry exists. */
    system.applyEffect('ghost-enemy', 'slow', 2.0, 0.7, 'tower-1');
    expect(system.hasEffect('ghost-enemy', 'slow')).toBe(true);
  });
});
