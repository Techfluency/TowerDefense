/**
 * Unit tests for BOLT-017 Enemy shield mechanics.
 *
 * Tests the Shielded enemy archetype's damage absorption, shield break
 * detection, shield regeneration, and interaction with the existing damage
 * formula (armor, damage type multipliers, minimum damage).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Enemy, EnemyState } from '../../src/entities/enemy';
import type { EnemyDefinition } from '../../src/types/game-types';

/** Creates a mock Phaser sprite with position properties. */
function createMockSprite(x = 0, y = 0) {
  return {
    x,
    y,
    rotation: 0,
    displayWidth: 24,
    displayHeight: 24,
    setTint: () => {},
    clearTint: () => {},
    setAlpha: () => {},
    setScale: () => {},
    setRotation: () => {},
  };
}

/** Creates a shielded enemy definition matching enemies.json. */
function createShieldedDef(): EnemyDefinition {
  return {
    id: 'shielded',
    name: 'Shielded Unit',
    baseHp: 80,
    baseSpeed: 60,
    armor: 3,
    breakthroughDamage: 20,
    currencyReward: 20,
    scoreReward: 30,
    movementType: 'ground',
    spriteKey: 'enemy-shielded',
    damageTypeMultipliers: {},
    shield: {
      maxShieldHp: 40,
      regenDelaySec: 3,
      regenRatePerSec: 10,
    },
  };
}

/** Creates a runner (no shield) for comparison testing. */
function createRunnerDef(): EnemyDefinition {
  return {
    id: 'runner',
    name: 'Runner',
    baseHp: 50,
    baseSpeed: 80,
    armor: 0,
    breakthroughDamage: 10,
    currencyReward: 5,
    scoreReward: 10,
    movementType: 'ground',
    spriteKey: 'enemy-runner',
    damageTypeMultipliers: {},
  };
}

function createEnemy(def: EnemyDefinition, hpMult = 1.0, speedMult = 1.0): Enemy {
  const sprite = createMockSprite(100, 200);
  return new Enemy('enemy-1', def, sprite as never, hpMult, speedMult, 1);
}

describe('Enemy Shield Mechanics (BOLT-017)', () => {
  let shielded: Enemy;

  beforeEach(() => {
    shielded = createEnemy(createShieldedDef());
  });

  // -------------------------------------------------------------------------
  // Shield initialization
  // -------------------------------------------------------------------------

  describe('shield initialization', () => {
    it('should have shield active on spawn', () => {
      expect(shielded.hasShield()).toBe(true);
      expect(shielded.isShieldActive()).toBe(true);
    });

    it('should start with full shield HP', () => {
      expect(shielded.getShieldHp()).toBe(40);
      expect(shielded.getMaxShieldHp()).toBe(40);
      expect(shielded.getShieldRatio()).toBe(1.0);
    });

    it('should have correct shield config values', () => {
      expect(shielded.getShieldRegenDelay()).toBe(3);
      expect(shielded.getShieldRegenRate()).toBe(10);
    });

    it('should have correct body HP separate from shield', () => {
      expect(shielded.getCurrentHp()).toBe(80);
      expect(shielded.getMaxHp()).toBe(80);
    });

    it('should report no shield for non-shielded enemies', () => {
      const runner = createEnemy(createRunnerDef());
      expect(runner.hasShield()).toBe(false);
      expect(runner.isShieldActive()).toBe(false);
      expect(runner.getShieldHp()).toBe(0);
      expect(runner.getMaxShieldHp()).toBe(0);
      expect(runner.getShieldRatio()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Shield damage absorption
  // -------------------------------------------------------------------------

  describe('shield damage absorption', () => {
    it('should absorb damage into shield first', () => {
      /* 10 raw, 3 armor: floor(10 * 1.0 - 3) = 7 final. Shield takes 7. */
      const result = shielded.takeDamage(10, 'physical');
      expect(result.shieldDamage).toBe(7);
      expect(result.actualDamage).toBe(7);
      expect(result.shieldBroken).toBe(false);
      expect(shielded.getShieldHp()).toBe(33); // 40 - 7
      expect(shielded.getCurrentHp()).toBe(80); // Body HP untouched
    });

    it('should not damage body HP while shield is active', () => {
      shielded.takeDamage(10, 'physical'); // 7 to shield
      shielded.takeDamage(10, 'physical'); // 7 to shield
      expect(shielded.getCurrentHp()).toBe(80); // Still full body HP
      expect(shielded.getShieldHp()).toBe(26); // 40 - 14
    });

    it('should overflow damage to body HP when shield breaks', () => {
      /* Shield has 40 HP. Deal 50 raw, 3 armor: final = 47.
       * Shield absorbs 40, overflow 7 goes to body. */
      const result = shielded.takeDamage(50, 'physical');
      expect(result.shieldDamage).toBe(40);
      expect(result.shieldBroken).toBe(true);
      expect(shielded.getShieldHp()).toBe(0);
      expect(shielded.getCurrentHp()).toBe(73); // 80 - 7 overflow
    });

    it('should break shield exactly at zero with no overflow', () => {
      /* Shield: 40. Need exactly 40 final damage.
       * 43 raw, 3 armor: floor(43 * 1.0 - 3) = 40. */
      const result = shielded.takeDamage(43, 'physical');
      expect(result.shieldDamage).toBe(40);
      expect(result.shieldBroken).toBe(true);
      expect(shielded.getShieldHp()).toBe(0);
      expect(shielded.getCurrentHp()).toBe(80); // No overflow
    });

    it('should damage body HP directly when shield is already broken', () => {
      /* Break the shield first. */
      shielded.takeDamage(50, 'physical'); // Shield breaks, 7 overflow to body
      expect(shielded.getShieldHp()).toBe(0);

      /* Now damage should go straight to body. */
      const result = shielded.takeDamage(10, 'physical');
      expect(result.shieldDamage).toBe(0);
      expect(result.shieldBroken).toBe(false);
      expect(shielded.getCurrentHp()).toBe(66); // 73 - 7
    });

    it('should apply armor reduction before shield absorption', () => {
      /* 5 raw, 3 armor: max(1, floor(5 * 1.0 - 3)) = max(1, 2) = 2.
       * Shield takes 2, not 5. */
      const result = shielded.takeDamage(5, 'physical');
      expect(result.actualDamage).toBe(2);
      expect(result.shieldDamage).toBe(2);
      expect(shielded.getShieldHp()).toBe(38);
    });

    it('should enforce minimum 1 damage even against shield', () => {
      /* 1 raw, 3 armor: max(1, floor(1 - 3)) = max(1, -2) = 1.
       * Shield takes 1. */
      const result = shielded.takeDamage(1, 'physical');
      expect(result.actualDamage).toBe(1);
      expect(result.shieldDamage).toBe(1);
      expect(shielded.getShieldHp()).toBe(39);
    });

    it('should apply damage type multiplier before shield absorption', () => {
      const def = createShieldedDef();
      def.damageTypeMultipliers = { explosive: 2.0 };
      const enemy = createEnemy(def);

      /* 10 raw * 2.0 explosive - 3 armor = 17. Shield takes 17. */
      const result = enemy.takeDamage(10, 'explosive');
      expect(result.actualDamage).toBe(17);
      expect(result.shieldDamage).toBe(17);
      expect(enemy.getShieldHp()).toBe(23);
    });
  });

  // -------------------------------------------------------------------------
  // Shield status tracking
  // -------------------------------------------------------------------------

  describe('shield status tracking', () => {
    it('should update shield ratio correctly', () => {
      shielded.takeDamage(10, 'physical'); // 7 to shield
      expect(shielded.getShieldRatio()).toBeCloseTo(33 / 40, 4);
    });

    it('should return 0 shield ratio when shield is broken', () => {
      shielded.takeDamage(50, 'physical');
      expect(shielded.getShieldRatio()).toBe(0);
    });

    it('should mark shieldWasBroken flag permanently after first break', () => {
      expect(shielded.shieldWasBroken).toBe(false);
      shielded.takeDamage(50, 'physical');
      expect(shielded.shieldWasBroken).toBe(true);
    });

    it('should reset damage timer on every hit', () => {
      expect(shielded.timeSinceLastDamage).toBe(Infinity);
      shielded.takeDamage(5, 'physical');
      expect(shielded.timeSinceLastDamage).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Shield regeneration
  // -------------------------------------------------------------------------

  describe('shield regeneration', () => {
    it('should regenerate shield HP via regenShield()', () => {
      /* Break the shield. */
      shielded.takeDamage(50, 'physical');
      expect(shielded.getShieldHp()).toBe(0);

      /* Regen 5 HP. */
      const justReactivated = shielded.regenShield(5);
      expect(justReactivated).toBe(true); // Shield went from 0 to 5
      expect(shielded.getShieldHp()).toBe(5);
      expect(shielded.isShieldActive()).toBe(true);
    });

    it('should cap shield HP at max', () => {
      /* Partially damage shield. */
      shielded.takeDamage(10, 'physical'); // 7 to shield, now at 33
      /* Try to regen more than max. */
      shielded.regenShield(100);
      expect(shielded.getShieldHp()).toBe(40); // Capped at max
    });

    it('should return false if shield is already at max', () => {
      const result = shielded.regenShield(10);
      expect(result).toBe(false);
    });

    it('should return false when no shield config exists', () => {
      const runner = createEnemy(createRunnerDef());
      const result = runner.regenShield(10);
      expect(result).toBe(false);
    });

    it('should return true only on 0-to-positive transition', () => {
      shielded.takeDamage(50, 'physical'); // Break shield
      const first = shielded.regenShield(5);
      expect(first).toBe(true); // 0 -> 5

      const second = shielded.regenShield(5);
      expect(second).toBe(false); // 5 -> 10 (not from zero)
    });
  });

  // -------------------------------------------------------------------------
  // Shield + death interaction
  // -------------------------------------------------------------------------

  describe('shield and death interaction', () => {
    it('should kill enemy when shield and body HP are both depleted', () => {
      /* Shield: 40, Body: 80. Total effective HP: 120 (before armor).
       * Need 40 + 80 = 120 final damage after armor to kill. */
      const result1 = shielded.takeDamage(50, 'physical'); // 47 final: 40 shield + 7 body
      expect(result1.died).toBe(false);
      expect(shielded.getCurrentHp()).toBe(73);

      const result2 = shielded.takeDamage(80, 'physical'); // 77 final: all to body
      expect(result2.died).toBe(true);
      expect(shielded.state).toBe(EnemyState.DYING);
    });

    it('should not take damage when already dead', () => {
      /* Kill the enemy. */
      shielded.takeDamage(50, 'physical'); // Break shield + some body
      shielded.takeDamage(100, 'physical'); // Kill body

      const result = shielded.takeDamage(10, 'physical');
      expect(result.actualDamage).toBe(0);
      expect(result.shieldDamage).toBe(0);
      expect(result.shieldBroken).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Non-shielded enemy backward compatibility
  // -------------------------------------------------------------------------

  describe('non-shielded enemy backward compat', () => {
    it('should return shieldBroken=false and shieldDamage=0 for runners', () => {
      const runner = createEnemy(createRunnerDef());
      const result = runner.takeDamage(10, 'physical');
      expect(result.shieldBroken).toBe(false);
      expect(result.shieldDamage).toBe(0);
      expect(result.actualDamage).toBe(10);
      expect(runner.getCurrentHp()).toBe(40);
    });
  });
});
