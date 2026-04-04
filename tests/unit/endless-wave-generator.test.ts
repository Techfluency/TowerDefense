/**
 * Unit tests for EndlessWaveGenerator (BOLT-020).
 *
 * Tests procedural wave generation determinism, difficulty scaling,
 * archetype weight interpolation, boss wave generation, enemy count
 * scaling, and spawn interval decay.
 */
import { describe, it, expect } from 'vitest';
import {
  generateEndlessWave,
  getInterpolatedWeights,
  getEndlessScaling,
  createSeededRng,
  deriveWaveSeed,
} from '../../src/systems/endless-wave-generator';
import type { EndlessConfig } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

/** Standard endless config matching endless-config.json defaults. */
function createTestConfig(): EndlessConfig {
  return {
    scaledWaveStart: 21,
    bossWaveInterval: 5,
    basePrepTimeMs: 15000,
    bossPrepTimeMs: 20000,
    baseEnemyCount: 20,
    enemyCountGrowthRate: 0.10,
    maxEnemyCount: 100,
    hpMultiplierPerWave: 0.15,
    speedMultiplierPerWave: 0.03,
    maxHpMultiplier: 999,
    maxSpeedMultiplier: 3.0,
    armorBonusPerWave: 0.5,
    maxArmorBonus: 30,
    baseSpawnIntervalMs: 600,
    minSpawnIntervalMs: 200,
    spawnIntervalDecayPerWave: 5,
    archetypeWeights: {
      early: {
        runner: 30, tank: 15, fast: 20, swarm: 20,
        flyer: 5, shielded: 5, support: 5,
      },
      mid: {
        runner: 20, tank: 15, fast: 15, swarm: 15,
        flyer: 10, shielded: 15, support: 10,
      },
      late: {
        runner: 10, tank: 15, fast: 15, swarm: 10,
        flyer: 15, shielded: 20, support: 15,
      },
    },
    weightTransitions: {
      earlyToMidWave: 30,
      midToLateWave: 50,
    },
    bossGroupMinions: {
      minCount: 8,
      maxCount: 15,
      countGrowthPerWave: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Seeded RNG Tests
// ---------------------------------------------------------------------------

describe('createSeededRng', () => {
  it('should produce deterministic output for the same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('should produce different output for different seeds', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    let allSame = true;
    for (let i = 0; i < 5; i++) {
      if (rng1() !== rng2()) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('should produce values in [0, 1) range', () => {
    const rng = createSeededRng(12345);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('deriveWaveSeed', () => {
  it('should produce different seeds for different wave numbers', () => {
    const seed1 = deriveWaveSeed('test-seed', 21);
    const seed2 = deriveWaveSeed('test-seed', 22);
    expect(seed1).not.toBe(seed2);
  });

  it('should produce different seeds for different game seeds', () => {
    const seed1 = deriveWaveSeed('seed-a', 21);
    const seed2 = deriveWaveSeed('seed-b', 21);
    expect(seed1).not.toBe(seed2);
  });

  it('should produce the same seed for identical inputs', () => {
    const seed1 = deriveWaveSeed('my-seed', 25);
    const seed2 = deriveWaveSeed('my-seed', 25);
    expect(seed1).toBe(seed2);
  });
});

// ---------------------------------------------------------------------------
// Endless Scaling Tests
// ---------------------------------------------------------------------------

describe('getEndlessScaling', () => {
  const config = createTestConfig();

  it('should return 1.0 multipliers for wave 1', () => {
    const scaling = getEndlessScaling(1, config);
    expect(scaling.hpMultiplier).toBe(1.0);
    expect(scaling.speedMultiplier).toBe(1.0);
  });

  it('should scale HP by 0.15 per wave beyond wave 1', () => {
    /* Wave 21: 1 + 20 * 0.15 = 4.0 */
    const scaling = getEndlessScaling(21, config);
    expect(scaling.hpMultiplier).toBeCloseTo(4.0, 2);
  });

  it('should scale speed by 0.03 per wave beyond wave 1', () => {
    /* Wave 21: 1 + 20 * 0.03 = 1.6 */
    const scaling = getEndlessScaling(21, config);
    expect(scaling.speedMultiplier).toBeCloseTo(1.6, 2);
  });

  it('should not exceed maxSpeedMultiplier', () => {
    /* Very high wave -- speed should cap at 3.0. */
    const scaling = getEndlessScaling(200, config);
    expect(scaling.speedMultiplier).toBe(3.0);
  });

  it('should continue increasing HP for high waves', () => {
    /* Wave 50: 1 + 49 * 0.15 = 8.35 */
    const scaling50 = getEndlessScaling(50, config);
    expect(scaling50.hpMultiplier).toBeCloseTo(8.35, 2);

    /* Wave 100 should be even higher. */
    const scaling100 = getEndlessScaling(100, config);
    expect(scaling100.hpMultiplier).toBeGreaterThan(scaling50.hpMultiplier);
  });
});

// ---------------------------------------------------------------------------
// Weight Interpolation Tests
// ---------------------------------------------------------------------------

describe('getInterpolatedWeights', () => {
  const config = createTestConfig();

  it('should return early weights at scaledWaveStart', () => {
    const weights = getInterpolatedWeights(21, config);
    /* At wave 21 (start), should be 100% early weights. */
    expect(weights.runner).toBeCloseTo(30, 0);
    expect(weights.swarm).toBeCloseTo(20, 0);
  });

  it('should interpolate between early and mid weights', () => {
    /* Wave 25.5 is halfway between 21 (start) and 30 (earlyToMid). */
    const midpoint = (21 + 30) / 2;
    const weights = getInterpolatedWeights(midpoint, config);

    /* Runner: early=30, mid=20. Midpoint should be ~25. */
    expect(weights.runner).toBeCloseTo(25, 0);
  });

  it('should use mid weights at earlyToMidWave', () => {
    const weights = getInterpolatedWeights(30, config);
    /* At wave 30, should be close to mid weights. */
    expect(weights.runner).toBeCloseTo(20, 0);
    expect(weights.shielded).toBeCloseTo(15, 0);
  });

  it('should interpolate between mid and late weights', () => {
    /* Wave 40 is halfway between 30 (earlyToMid) and 50 (midToLate). */
    const weights = getInterpolatedWeights(40, config);
    /* Shielded: mid=15, late=20. Midpoint should be ~17.5. */
    expect(weights.shielded).toBeCloseTo(17.5, 0);
  });

  it('should use full late weights past midToLateWave', () => {
    const weights = getInterpolatedWeights(60, config);
    expect(weights.runner).toBeCloseTo(10, 0);
    expect(weights.shielded).toBeCloseTo(20, 0);
    expect(weights.support).toBeCloseTo(15, 0);
  });
});

// ---------------------------------------------------------------------------
// Wave Generation Tests
// ---------------------------------------------------------------------------

describe('generateEndlessWave', () => {
  const config = createTestConfig();

  it('should generate a valid WaveDefinition for wave 21', () => {
    const wave = generateEndlessWave(21, 'test-seed', config);

    expect(wave.waveNumber).toBe(21);
    expect(wave.isBossWave).toBe(false);
    expect(wave.prepTimeMs).toBe(config.basePrepTimeMs);
    expect(wave.groups.length).toBeGreaterThan(0);
  });

  it('should produce deterministic waves with the same seed', () => {
    const wave1 = generateEndlessWave(25, 'same-seed', config);
    const wave2 = generateEndlessWave(25, 'same-seed', config);

    expect(wave1.groups.length).toBe(wave2.groups.length);
    for (let i = 0; i < wave1.groups.length; i++) {
      expect(wave1.groups[i]!.enemyId).toBe(wave2.groups[i]!.enemyId);
      expect(wave1.groups[i]!.count).toBe(wave2.groups[i]!.count);
      expect(wave1.groups[i]!.spawnIntervalMs).toBe(wave2.groups[i]!.spawnIntervalMs);
      expect(wave1.groups[i]!.delayMs).toBe(wave2.groups[i]!.delayMs);
    }
  });

  it('should produce different waves with different seeds', () => {
    const wave1 = generateEndlessWave(25, 'seed-a', config);
    const wave2 = generateEndlessWave(25, 'seed-b', config);

    /* Different seeds should produce at least one different group. */
    const groupsMatch = wave1.groups.every((g, i) =>
      wave2.groups[i] && g.enemyId === wave2.groups[i]!.enemyId &&
      g.count === wave2.groups[i]!.count,
    );
    expect(groupsMatch).toBe(false);
  });

  it('should produce different waves for different wave numbers', () => {
    const wave21 = generateEndlessWave(21, 'same-seed', config);
    const wave22 = generateEndlessWave(22, 'same-seed', config);

    /* Different wave numbers should produce different compositions. */
    const allSameEnemyIds = wave21.groups.every((g, i) =>
      wave22.groups[i] && g.enemyId === wave22.groups[i]!.enemyId,
    );
    /* At least the group count or some enemyId should differ. */
    const differ = wave21.groups.length !== wave22.groups.length || !allSameEnemyIds;
    expect(differ).toBe(true);
  });

  it('should use only valid enemy archetype IDs', () => {
    const validArchetypes = ['runner', 'tank', 'fast', 'swarm', 'flyer', 'shielded', 'support', 'boss'];

    for (let wave = 21; wave <= 40; wave++) {
      const def = generateEndlessWave(wave, 'test', config);
      for (const group of def.groups) {
        expect(validArchetypes).toContain(group.enemyId);
      }
    }
  });

  it('should increase total enemy count over time', () => {
    const wave21 = generateEndlessWave(21, 'test', config);
    const wave30 = generateEndlessWave(30, 'test', config);

    const count21 = wave21.groups.reduce((sum, g) => sum + g.count, 0);
    const count30 = wave30.groups.reduce((sum, g) => sum + g.count, 0);

    expect(count30).toBeGreaterThan(count21);
  });

  it('should not exceed maxEnemyCount', () => {
    /* Wave 100 should still be capped at maxEnemyCount. */
    const wave = generateEndlessWave(100, 'test', config);
    const totalCount = wave.groups.reduce((sum, g) => sum + g.count, 0);
    expect(totalCount).toBeLessThanOrEqual(config.maxEnemyCount + 1 + config.bossGroupMinions.maxCount);
  });

  it('should have positive spawn intervals for all groups', () => {
    for (let w = 21; w <= 50; w++) {
      const wave = generateEndlessWave(w, 'test', config);
      for (const group of wave.groups) {
        expect(group.spawnIntervalMs).toBeGreaterThan(0);
        expect(group.count).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Boss Wave Tests
// ---------------------------------------------------------------------------

describe('boss wave generation', () => {
  const config = createTestConfig();

  it('should flag wave 25 as a boss wave (every 5 waves)', () => {
    const wave = generateEndlessWave(25, 'test', config);
    expect(wave.isBossWave).toBe(true);
  });

  it('should flag wave 30 as a boss wave', () => {
    const wave = generateEndlessWave(30, 'test', config);
    expect(wave.isBossWave).toBe(true);
  });

  it('should NOT flag wave 26 as a boss wave', () => {
    const wave = generateEndlessWave(26, 'test', config);
    expect(wave.isBossWave).toBe(false);
  });

  it('should include a boss enemy in boss waves', () => {
    const wave = generateEndlessWave(25, 'test', config);
    const bossGroup = wave.groups.find(g => g.enemyId === 'boss');
    expect(bossGroup).toBeDefined();
    expect(bossGroup!.count).toBe(1);
  });

  it('should use bossPrepTimeMs for boss waves', () => {
    const wave = generateEndlessWave(25, 'test', config);
    expect(wave.prepTimeMs).toBe(config.bossPrepTimeMs);
  });

  it('should use basePrepTimeMs for normal waves', () => {
    const wave = generateEndlessWave(22, 'test', config);
    expect(wave.prepTimeMs).toBe(config.basePrepTimeMs);
  });

  it('should have boss group as the first group with delayMs=0', () => {
    const wave = generateEndlessWave(25, 'test', config);
    expect(wave.groups[0]!.enemyId).toBe('boss');
    expect(wave.groups[0]!.delayMs).toBe(0);
  });

  it('should include escort/minion groups after the boss', () => {
    const wave = generateEndlessWave(25, 'test', config);
    /* Boss waves should have more than just the boss group. */
    expect(wave.groups.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Spawn Interval Decay Tests
// ---------------------------------------------------------------------------

describe('spawn interval decay', () => {
  const config = createTestConfig();

  it('should use shorter spawn intervals for later waves', () => {
    const wave21 = generateEndlessWave(21, 'fixed-seed', config);
    const wave50 = generateEndlessWave(50, 'fixed-seed', config);

    /* Get average spawn interval for non-boss groups. */
    const avgInterval = (wave: typeof wave21) => {
      const nonBoss = wave.groups.filter(g => g.enemyId !== 'boss');
      if (nonBoss.length === 0) return 0;
      return nonBoss.reduce((sum, g) => sum + g.spawnIntervalMs, 0) / nonBoss.length;
    };

    /* Later waves should have generally shorter intervals. */
    expect(avgInterval(wave50)).toBeLessThanOrEqual(avgInterval(wave21));
  });

  it('should never go below minSpawnIntervalMs', () => {
    /* Very late wave -- intervals should be at the floor. */
    const wave = generateEndlessWave(200, 'test', config);
    for (const group of wave.groups) {
      expect(group.spawnIntervalMs).toBeGreaterThanOrEqual(config.minSpawnIntervalMs);
    }
  });
});
