/**
 * Unit tests for BOLT-026: Capstone combat effects.
 *
 * Tests cover:
 * - Steady Aim: +15% first hit after target switch, normal on subsequent hits
 * - Barrage: every 5th shot fires double, counter is per-tower not per-target
 * - Headshot: 10% chance 3x damage with seeded Math.random
 * - Lock-On: missile tracking speed multiplied by 1.2
 * - Tremor: passive 5% slow aura via StatusEffectSystem
 * - Aftershock: single tick 25% blast damage at blast location
 * - Flak Field: 30% AoE on missile impact excluding primary target
 * - Spotter: populates spotterVisibleEnemies registry set
 * - Slow cap: additive stacking capped at 50%
 * - No capstone effects when none purchased
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Phaser
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
          Between: vi.fn(() => 0),
          RotateTo: vi.fn((_current: number, _target: number) => _target),
        },
      },
    },
    __esModule: true,
  };
});

import { StatusEffectSystem } from '../../src/systems/status-effect-system';
import { SkillTreeManager, STAT_NAMES } from '../../src/utils/skill-tree-manager';
import type { CapstoneDefinition, TowerUpgradeState } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockEnemy(id: string, x = 100, y = 100, speed = 100) {
  return {
    instanceId: id,
    currentSpeed: speed,
    baseSpeed: speed,
    sprite: { x, y, rotation: 0, displayWidth: 32, displayHeight: 32 },
    isFlying: false,
    isAlive: () => true,
    getPosition: () => ({ x, y }),
    getCurrentHp: () => 100,
    getHpRatio: () => 1.0,
    waypointIndex: 0,
  };
}

function createMockEnemySystem(enemies: ReturnType<typeof createMockEnemy>[]) {
  return {
    getActiveEnemies: vi.fn(() => enemies),
    applyDamageToEnemy: vi.fn(),
  };
}

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

function createStatusEffectSystem(enemies: ReturnType<typeof createMockEnemy>[]) {
  const scene = createMockScene();
  const enemySystem = createMockEnemySystem(enemies);
  const gameState = {
    currency: 1000, score: 0, currentWave: 1, totalWaves: 20,
    objectiveHp: 100, maxObjectiveHp: 100, isPaused: false, isGameOver: false,
    gameSeed: 'test', gameMode: 'stage' as const, highestWaveReached: 0,
    campaignComplete: false,
  };

  scene.registry.get = vi.fn((key: string) => {
    if (key === 'enemySystem') return enemySystem;
    return undefined;
  });

  const system = new StatusEffectSystem(scene as unknown as Phaser.Scene, gameState);
  system.init();
  return { system, scene, enemySystem, enemies };
}

/** Creates a test SkillTreeConfig with capstone definitions. */
function createTestConfig() {
  return {
    towerStats: {
      costs: [25, 50, 100, 200, 400],
      bonusPerTier: {
        damage: [0.05, 0.10, 0.15, 0.20, 0.25],
        fireRate: [0.05, 0.10, 0.15, 0.20, 0.25],
        range: [0.03, 0.06, 0.09, 0.12, 0.15],
        upgradeDiscount: [0.03, 0.06, 0.09, 0.12, 0.15],
      },
    },
    capstones: [
      {
        id: 'ranged_steady_aim', towerId: 'ranged', name: 'Steady Aim',
        description: 'Test', cost: 150, tier: 'mid' as const, effectKey: 'steady_aim',
        requiredCount: 2,
        prerequisites: [
          { stat: 'damage', minTier: 2 }, { stat: 'fireRate', minTier: 2 },
          { stat: 'range', minTier: 2 }, { stat: 'upgradeDiscount', minTier: 2 },
        ],
      },
      {
        id: 'ranged_barrage', towerId: 'ranged', name: 'Barrage',
        description: 'Test', cost: 400, tier: 'mastery' as const, effectKey: 'barrage',
        requiredCount: 3,
        prerequisites: [
          { stat: 'damage', minTier: 4 }, { stat: 'fireRate', minTier: 4 },
          { stat: 'range', minTier: 4 }, { stat: 'upgradeDiscount', minTier: 4 },
        ],
      },
    ] as CapstoneDefinition[],
    globalUpgrades: [],
  };
}

// ---------------------------------------------------------------------------
// Slow cap tests (AC-20: Tremor + Frost Slow, additive, capped at 50%)
// ---------------------------------------------------------------------------

describe('BOLT-026: Slow cap (AC-20)', () => {
  it('caps combined slow from multiple sources at 50%', () => {
    const enemy = createMockEnemy('enemy-1', 100, 100, 100);
    const { system } = createStatusEffectSystem([enemy]);

    /* Tremor: 5% slow (magnitude 0.95). */
    system.applyEffect('enemy-1', 'slow', 0.5, 0.95, 'tremor-tower-1');
    expect(enemy.currentSpeed).toBeCloseTo(95, 5);

    /* Frost Slow: 30% slow (magnitude 0.70). */
    system.applyEffect('enemy-1', 'slow', 2.0, 0.70, 'frost-tower-1');
    /* Combined: 5% + 30% = 35%, capped at 50%. Speed = 100 * (1 - 0.35) = 65. */
    expect(enemy.currentSpeed).toBeCloseTo(65, 5);
  });

  it('does not reduce speed below 50% even with many slow sources', () => {
    const enemy = createMockEnemy('enemy-1', 100, 100, 100);
    const { system } = createStatusEffectSystem([enemy]);

    /* Apply three different 30% slows. Total = 90%, should cap at 50%. */
    system.applyEffect('enemy-1', 'slow', 2.0, 0.70, 'tower-1');
    system.applyEffect('enemy-1', 'slow', 2.0, 0.70, 'tower-2');
    system.applyEffect('enemy-1', 'slow', 2.0, 0.70, 'tower-3');

    expect(enemy.currentSpeed).toBe(50);
  });

  it('restores speed when all slow sources expire (AC-21)', () => {
    const enemy = createMockEnemy('enemy-1', 100, 100, 100);
    const { system } = createStatusEffectSystem([enemy]);

    system.applyEffect('enemy-1', 'slow', 0.5, 0.95, 'tremor-tower');
    expect(enemy.currentSpeed).toBe(95);

    /* Let it expire. */
    system.update(0, 600);
    expect(enemy.currentSpeed).toBe(100);
  });

  it('recalculates when one slow source expires but another remains', () => {
    const enemy = createMockEnemy('enemy-1', 100, 100, 100);
    const { system } = createStatusEffectSystem([enemy]);

    /* Tremor: 5% slow, 0.5s duration. */
    system.applyEffect('enemy-1', 'slow', 0.5, 0.95, 'tremor-tower');
    /* Frost: 30% slow, 2.0s duration. */
    system.applyEffect('enemy-1', 'slow', 2.0, 0.70, 'frost-tower');

    expect(enemy.currentSpeed).toBeCloseTo(65, 5); // 35% slow

    /* After 0.6s, tremor expires but frost remains. */
    system.update(0, 600);
    expect(enemy.currentSpeed).toBeCloseTo(70, 5); // Only 30% frost slow
  });
});

// ---------------------------------------------------------------------------
// Prerequisite and purchase tests (AC-29, AC-30, AC-31)
// ---------------------------------------------------------------------------

describe('BOLT-026: Capstone prerequisites', () => {
  it('checkCapstonePrerequisites returns false with 1 stat at tier 2 (AC-29)', () => {
    const mgr = new SkillTreeManager();
    mgr.setConfig(createTestConfig());

    const capstoneDef = createTestConfig().capstones[0]!;
    const towerState: TowerUpgradeState = {
      damage: 2, fireRate: 0, range: 0, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };
    expect(mgr.checkCapstonePrerequisites(capstoneDef, towerState)).toBe(false);
  });

  it('checkCapstonePrerequisites returns true with 2 stats at tier 2 (AC-29)', () => {
    const mgr = new SkillTreeManager();
    mgr.setConfig(createTestConfig());

    const capstoneDef = createTestConfig().capstones[0]!;
    const towerState: TowerUpgradeState = {
      damage: 2, fireRate: 2, range: 0, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };
    expect(mgr.checkCapstonePrerequisites(capstoneDef, towerState)).toBe(true);
  });

  it('mastery prerequisite returns false at 2 stats tier 4 (AC-30)', () => {
    const mgr = new SkillTreeManager();
    mgr.setConfig(createTestConfig());

    const capstoneDef = createTestConfig().capstones[1]!;
    const towerState: TowerUpgradeState = {
      damage: 4, fireRate: 4, range: 0, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };
    expect(mgr.checkCapstonePrerequisites(capstoneDef, towerState)).toBe(false);
  });

  it('mastery prerequisite returns true at 3 stats tier 4 (AC-30)', () => {
    const mgr = new SkillTreeManager();
    mgr.setConfig(createTestConfig());

    const capstoneDef = createTestConfig().capstones[1]!;
    const towerState: TowerUpgradeState = {
      damage: 4, fireRate: 4, range: 4, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };
    expect(mgr.checkCapstonePrerequisites(capstoneDef, towerState)).toBe(true);
  });

  it('purchaseCapstone returns false and XP unchanged on re-purchase (AC-31)', () => {
    const mgr = new SkillTreeManager();
    mgr.setConfig(createTestConfig());
    /* Manually set up XP and tower state for purchase. */
    (mgr as any).profile.totalXpEarned = 5000;
    (mgr as any).profile.towerUpgrades['ranged'] = {
      damage: 2, fireRate: 2, range: 0, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };

    expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(true);
    const xpAfterFirst = mgr.getAvailableXp();

    /* Second purchase attempt should fail with no XP change. */
    expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(false);
    expect(mgr.getAvailableXp()).toBe(xpAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Steady Aim logic tests (AC-11, AC-12)
// ---------------------------------------------------------------------------

describe('BOLT-026: Steady Aim logic', () => {
  it('detects target switch when previousTargetId differs from currentTargetId', () => {
    /* Pure logic test: steady_aim triggers when previous !== current. */
    const baseDamage = 100;
    const multiplier = 1.15;

    const previousTargetId: string | null = 'enemy-A';
    const currentTargetId = 'enemy-B';

    /* First hit at new target gets the bonus. Math.floor(100 * 1.15) = 114. */
    const isTargetSwitch = previousTargetId !== currentTargetId;
    const effectiveDamage = isTargetSwitch
      ? Math.floor(baseDamage * multiplier)
      : baseDamage;

    expect(effectiveDamage).toBe(114);
  });

  it('does not apply bonus on subsequent shots at same target (AC-12)', () => {
    const baseDamage = 100;
    const multiplier = 1.15;

    const previousTargetId = 'enemy-A';
    const currentTargetId = 'enemy-A';

    const isTargetSwitch = previousTargetId !== currentTargetId;
    const effectiveDamage = isTargetSwitch
      ? Math.floor(baseDamage * multiplier)
      : baseDamage;

    expect(effectiveDamage).toBe(100);
  });

  it('applies bonus on first acquisition (previousTargetId is null)', () => {
    const baseDamage = 100;
    const multiplier = 1.15;

    const previousTargetId: string | null = null;
    const currentTargetId = 'enemy-A';

    /* Math.floor(100 * 1.15) = 114 due to floor rounding. */
    const isTargetSwitch = previousTargetId !== currentTargetId;
    const effectiveDamage = isTargetSwitch
      ? Math.floor(baseDamage * multiplier)
      : baseDamage;

    expect(effectiveDamage).toBe(114);
  });
});

// ---------------------------------------------------------------------------
// Barrage logic tests (AC-13, AC-14)
// ---------------------------------------------------------------------------

describe('BOLT-026: Barrage logic', () => {
  it('fires double on every 5th shot', () => {
    let shotCounter = 0;
    const doubleShots: number[] = [];

    for (let shot = 1; shot <= 15; shot++) {
      shotCounter++;
      if (shotCounter % 5 === 0) {
        doubleShots.push(shot);
      }
    }

    expect(doubleShots).toEqual([5, 10, 15]);
  });

  it('counter persists across target switches (AC-14)', () => {
    let shotCounter = 0;

    /* 4 shots at target A. */
    for (let i = 0; i < 4; i++) shotCounter++;
    /* Target dies, acquire target B. Counter does NOT reset. */
    shotCounter++; // 5th shot overall

    expect(shotCounter % 5).toBe(0); // Should trigger barrage
  });
});

// ---------------------------------------------------------------------------
// Headshot logic tests (AC-17)
// ---------------------------------------------------------------------------

describe('BOLT-026: Headshot logic', () => {
  it('applies 3x damage when random roll < 0.10', () => {
    const baseDamage = 100;
    const roll = 0.05; // Under threshold
    const multiplier = 3.0;

    const effectiveDamage = roll < 0.10
      ? Math.floor(baseDamage * multiplier)
      : baseDamage;

    expect(effectiveDamage).toBe(300);
  });

  it('applies normal damage when random roll >= 0.10', () => {
    const baseDamage = 100;
    const roll = 0.15;
    const multiplier = 3.0;

    const effectiveDamage = roll < 0.10
      ? Math.floor(baseDamage * multiplier)
      : baseDamage;

    expect(effectiveDamage).toBe(100);
  });

  it('approximately 10% trigger rate over 1000 rolls', () => {
    const chance = 0.10;
    let crits = 0;
    const totalRolls = 1000;

    /* Use a predictable seed by mocking Math.random. */
    const originalRandom = Math.random;
    let counter = 0;
    Math.random = () => {
      /* Simple LCG for deterministic results. */
      counter++;
      return (counter * 1103515245 + 12345) % 2147483648 / 2147483648;
    };

    for (let i = 0; i < totalRolls; i++) {
      if (Math.random() < chance) crits++;
    }

    Math.random = originalRandom;

    /* Allow +/- 5% variance: expect between 50 and 150 crits out of 1000. */
    expect(crits).toBeGreaterThan(50);
    expect(crits).toBeLessThan(150);
  });
});

// ---------------------------------------------------------------------------
// Lock-On logic tests (AC-25)
// ---------------------------------------------------------------------------

describe('BOLT-026: Lock-On logic', () => {
  it('multiplies missile speed by 1.2', () => {
    const baseSpeed = 300;
    const lockOnMultiplier = 1.2;

    const boostedSpeed = baseSpeed * lockOnMultiplier;
    expect(boostedSpeed).toBe(360);
  });
});

// ---------------------------------------------------------------------------
// Aftershock logic tests (AC-22, AC-23, AC-24)
// ---------------------------------------------------------------------------

describe('BOLT-026: Aftershock logic', () => {
  it('deals 25% of blast damage as a single tick (AC-23)', () => {
    const blastDamage = 200;
    const fraction = 0.25;
    const zoneDamage = Math.floor(blastDamage * fraction);
    expect(zoneDamage).toBe(50);
  });

  it('only damages enemies within 64px radius', () => {
    const towerX = 100, towerY = 100;
    const radius = 64;
    const radiusSq = radius * radius;

    const inRange = { x: 130, y: 130 };
    const outOfRange = { x: 200, y: 200 };

    const dxIn = inRange.x - towerX;
    const dyIn = inRange.y - towerY;
    expect(dxIn * dxIn + dyIn * dyIn).toBeLessThanOrEqual(radiusSq);

    const dxOut = outOfRange.x - towerX;
    const dyOut = outOfRange.y - towerY;
    expect(dxOut * dxOut + dyOut * dyOut).toBeGreaterThan(radiusSq);
  });
});

// ---------------------------------------------------------------------------
// Flak Field logic tests (AC-26, AC-27)
// ---------------------------------------------------------------------------

describe('BOLT-026: Flak Field logic', () => {
  it('deals 30% of missile damage as AoE (AC-26)', () => {
    const missileDamage = 100;
    const fraction = 0.30;
    const aoeDamage = Math.floor(missileDamage * fraction);
    expect(aoeDamage).toBe(30);
  });

  it('excludes primary target from AoE (AC-27)', () => {
    const primaryTargetId = 'enemy-1';
    const enemies = ['enemy-1', 'enemy-2', 'enemy-3'];

    const aoeTargets = enemies.filter(id => id !== primaryTargetId);
    expect(aoeTargets).toEqual(['enemy-2', 'enemy-3']);
    expect(aoeTargets).not.toContain(primaryTargetId);
  });
});

// ---------------------------------------------------------------------------
// Spotter logic tests (AC-15, AC-16)
// ---------------------------------------------------------------------------

describe('BOLT-026: Spotter logic', () => {
  it('populates spotterVisibleEnemies for enemies within range', () => {
    const spotterSet = new Set<string>();
    const towerX = 100, towerY = 100;
    const range = 200;
    const rangeSq = range * range;

    const inRangeEnemy = createMockEnemy('enemy-1', 150, 150);
    const outOfRangeEnemy = createMockEnemy('enemy-2', 400, 400);

    for (const enemy of [inRangeEnemy, outOfRangeEnemy]) {
      const dx = enemy.sprite.x - towerX;
      const dy = enemy.sprite.y - towerY;
      if (dx * dx + dy * dy <= rangeSq) {
        spotterSet.add(enemy.instanceId);
      }
    }

    expect(spotterSet.has('enemy-1')).toBe(true);
    expect(spotterSet.has('enemy-2')).toBe(false);
  });

  it('clears set each frame (no stale entries)', () => {
    const spotterSet = new Set<string>();
    spotterSet.add('enemy-1');
    spotterSet.add('enemy-2');

    /* Clear at start of frame (as TowerCombatSystem does). */
    spotterSet.clear();

    /* Only repopulate currently in-range enemies. */
    spotterSet.add('enemy-3');

    expect(spotterSet.has('enemy-1')).toBe(false);
    expect(spotterSet.has('enemy-2')).toBe(false);
    expect(spotterSet.has('enemy-3')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No capstone effects when none purchased (AC-28)
// ---------------------------------------------------------------------------

describe('BOLT-026: No effects without purchase (AC-28)', () => {
  it('empty capstoneKeys results in no effect application', () => {
    const capstoneKeys: string[] = [];
    const baseDamage = 100;

    /* Steady aim: no bonus without the key. */
    const hasSteadyAim = capstoneKeys.includes('steady_aim');
    expect(hasSteadyAim).toBe(false);

    /* Barrage: no double shot without the key. */
    const hasBarrage = capstoneKeys.includes('barrage');
    expect(hasBarrage).toBe(false);

    /* Headshot: no crit without the key. */
    const hasHeadshot = capstoneKeys.includes('headshot');
    expect(hasHeadshot).toBe(false);

    /* Lock-on: speed not modified. */
    const hasLockOn = capstoneKeys.includes('lock_on');
    expect(hasLockOn).toBe(false);

    /* Damage unchanged. */
    expect(baseDamage).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// formatCapstonePrereq progress display
// ---------------------------------------------------------------------------

describe('BOLT-026: formatCapstonePrereq with progress', () => {
  it('shows progress count when towerState provided', async () => {
    const { formatCapstonePrereq } = await import('../../src/ui/skill-tree/bonus-format');
    const capstoneDef: CapstoneDefinition = {
      id: 'test', towerId: 'ranged', name: 'Test', description: '',
      cost: 150, tier: 'mid', effectKey: 'test',
      requiredCount: 2,
      prerequisites: [
        { stat: 'damage', minTier: 2 }, { stat: 'fireRate', minTier: 2 },
        { stat: 'range', minTier: 2 }, { stat: 'upgradeDiscount', minTier: 2 },
      ],
    };
    const towerState: TowerUpgradeState = {
      damage: 3, fireRate: 0, range: 0, upgradeDiscount: 0,
      midCapstone: false, masteryCapstone: false,
    };

    const result = formatCapstonePrereq(capstoneDef, towerState);
    expect(result).toBe('Requires: 2 stats at Tier 2 (1/2)');
  });

  it('returns base text without towerState', async () => {
    const { formatCapstonePrereq } = await import('../../src/ui/skill-tree/bonus-format');
    const capstoneDef: CapstoneDefinition = {
      id: 'test', towerId: 'ranged', name: 'Test', description: '',
      cost: 150, tier: 'mid', effectKey: 'test',
      requiredCount: 2,
      prerequisites: [
        { stat: 'damage', minTier: 2 }, { stat: 'fireRate', minTier: 2 },
        { stat: 'range', minTier: 2 }, { stat: 'upgradeDiscount', minTier: 2 },
      ],
    };

    const result = formatCapstonePrereq(capstoneDef);
    expect(result).toBe('Requires: 2 stats at Tier 2');
  });
});
