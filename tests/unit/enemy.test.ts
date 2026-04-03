/**
 * Unit tests for the Enemy entity class.
 *
 * Tests damage formula (multipliers, armor, minimum damage), state machine
 * transitions, HP ratio calculations, and edge cases. Uses mock sprites
 * to avoid Phaser browser dependency.
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
    setPosition: (newX: number, newY: number) => {
      (mockRef as { x: number; y: number }).x = newX;
      (mockRef as { x: number; y: number }).y = newY;
    },
  };
  // Self-reference for setPosition
  const mockRef = arguments.callee;
}

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

function createTankDef(): EnemyDefinition {
  return {
    id: 'tank',
    name: 'Tank',
    baseHp: 200,
    baseSpeed: 45,
    armor: 5,
    breakthroughDamage: 25,
    currencyReward: 15,
    scoreReward: 25,
    movementType: 'ground',
    spriteKey: 'enemy-tank',
    damageTypeMultipliers: {},
  };
}

function createFlyerDef(): EnemyDefinition {
  return {
    id: 'flyer',
    name: 'Sky Drone',
    baseHp: 40,
    baseSpeed: 70,
    armor: 0,
    breakthroughDamage: 15,
    currencyReward: 10,
    scoreReward: 20,
    movementType: 'flying',
    spriteKey: 'enemy-flyer',
    damageTypeMultipliers: {},
  };
}

function createEnemyWithDef(
  def: EnemyDefinition,
  hpMult = 1.0,
  speedMult = 1.0,
  waveNum = 1,
): Enemy {
  const sprite = createMockSprite(100, 200);
  return new Enemy('enemy-1', def, sprite as never, hpMult, speedMult, waveNum);
}

describe('Enemy', () => {
  let runner: Enemy;
  let tank: Enemy;

  beforeEach(() => {
    runner = createEnemyWithDef(createRunnerDef());
    tank = createEnemyWithDef(createTankDef());
  });

  describe('constructor', () => {
    it('should initialize with full HP based on definition and multiplier', () => {
      expect(runner.getCurrentHp()).toBe(50);
      expect(runner.getMaxHp()).toBe(50);
      expect(runner.getHpRatio()).toBe(1.0);
    });

    it('should apply HP multiplier from wave scaling', () => {
      const scaled = createEnemyWithDef(createRunnerDef(), 2.0);
      /* floor(50 * 2.0) = 100 */
      expect(scaled.getMaxHp()).toBe(100);
      expect(scaled.getCurrentHp()).toBe(100);
    });

    it('should apply speed multiplier from wave scaling', () => {
      const scaled = createEnemyWithDef(createRunnerDef(), 1.0, 1.5);
      expect(scaled.currentSpeed).toBe(120); // 80 * 1.5
    });

    it('should floor HP when multiplier produces fractional values', () => {
      const scaled = createEnemyWithDef(createRunnerDef(), 1.15);
      /* floor(50 * 1.15) = floor(57.5) = 57 */
      expect(scaled.getMaxHp()).toBe(57);
    });

    it('should start in MOVING state', () => {
      expect(runner.state).toBe(EnemyState.MOVING);
    });

    it('should set isFlying based on movementType', () => {
      expect(runner.isFlying).toBe(false);
      const flyer = createEnemyWithDef(createFlyerDef());
      expect(flyer.isFlying).toBe(true);
    });

    it('should store instanceId and definition', () => {
      expect(runner.instanceId).toBe('enemy-1');
      expect(runner.definition.id).toBe('runner');
    });

    it('should store waveNumber', () => {
      const enemy = createEnemyWithDef(createRunnerDef(), 1.0, 1.0, 5);
      expect(enemy.waveNumber).toBe(5);
    });
  });

  describe('takeDamage -- damage formula', () => {
    it('should deal raw damage with no armor and no multiplier', () => {
      const result = runner.takeDamage(10, 'physical');
      /* 10 * 1.0 - 0 = 10 */
      expect(result.actualDamage).toBe(10);
      expect(result.died).toBe(false);
      expect(runner.getCurrentHp()).toBe(40);
    });

    it('should subtract armor from damage', () => {
      const result = tank.takeDamage(10, 'physical');
      /* 10 * 1.0 - 5 = 5 */
      expect(result.actualDamage).toBe(5);
      expect(tank.getCurrentHp()).toBe(195);
    });

    it('should apply damage type multiplier', () => {
      const def = createRunnerDef();
      def.damageTypeMultipliers = { explosive: 2.0 };
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(10, 'explosive');
      /* 10 * 2.0 - 0 = 20 */
      expect(result.actualDamage).toBe(20);
      expect(enemy.getCurrentHp()).toBe(30);
    });

    it('should use 1.0 multiplier for unknown damage types', () => {
      const def = createRunnerDef();
      def.damageTypeMultipliers = { explosive: 2.0 };
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(10, 'energy');
      /* 10 * 1.0 - 0 = 10 (energy not in multipliers map) */
      expect(result.actualDamage).toBe(10);
    });

    it('should enforce minimum 1 damage even with high armor', () => {
      /* Tank has 5 armor. 3 raw damage: 3 * 1.0 - 5 = -2, clamped to 1 */
      const result = tank.takeDamage(3, 'physical');
      expect(result.actualDamage).toBe(1);
      expect(tank.getCurrentHp()).toBe(199);
    });

    it('should floor fractional damage to integer', () => {
      const def = createRunnerDef();
      def.damageTypeMultipliers = { physical: 1.5 };
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(7, 'physical');
      /* 7 * 1.5 - 0 = 10.5, floor = 10 */
      expect(result.actualDamage).toBe(10);
    });

    it('should handle resistance multiplier (< 1.0)', () => {
      const def = createRunnerDef();
      def.damageTypeMultipliers = { physical: 0.5 };
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(10, 'physical');
      /* 10 * 0.5 - 0 = 5 */
      expect(result.actualDamage).toBe(5);
    });

    it('should return died=true when HP reaches zero', () => {
      const result = runner.takeDamage(50, 'physical');
      expect(result.died).toBe(true);
      expect(runner.getCurrentHp()).toBe(0);
      expect(runner.state).toBe(EnemyState.DYING);
    });

    it('should return died=true when damage exceeds remaining HP', () => {
      const result = runner.takeDamage(100, 'physical');
      expect(result.died).toBe(true);
      expect(runner.getCurrentHp()).toBe(0); // Clamped to 0, not negative
    });

    it('should not deal damage to already dead enemy', () => {
      runner.takeDamage(50, 'physical'); // Kill it
      const result = runner.takeDamage(10, 'physical');
      expect(result.actualDamage).toBe(0);
      expect(result.died).toBe(false);
    });

    it('should use default physical type when no damageType specified', () => {
      const result = runner.takeDamage(10);
      expect(result.actualDamage).toBe(10);
    });

    it('should handle empty damageTypeMultipliers as all 1.0', () => {
      const def = createRunnerDef();
      def.damageTypeMultipliers = {};
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(15, 'explosive');
      expect(result.actualDamage).toBe(15);
    });

    it('should handle undefined damageTypeMultipliers as all 1.0', () => {
      const def = createRunnerDef();
      delete def.damageTypeMultipliers;
      const enemy = createEnemyWithDef(def);

      const result = enemy.takeDamage(15, 'explosive');
      expect(result.actualDamage).toBe(15);
    });
  });

  describe('state queries', () => {
    it('isAlive returns true for newly spawned enemy', () => {
      expect(runner.isAlive()).toBe(true);
    });

    it('isAlive returns false after death', () => {
      runner.takeDamage(50, 'physical');
      expect(runner.isAlive()).toBe(false);
    });

    it('isAlive returns false for BREAKTHROUGH state', () => {
      runner.state = EnemyState.BREAKTHROUGH;
      expect(runner.isAlive()).toBe(false);
    });

    it('getPosition returns sprite position', () => {
      const pos = runner.getPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    });

    it('getHpRatio returns 1.0 at full health', () => {
      expect(runner.getHpRatio()).toBe(1.0);
    });

    it('getHpRatio returns correct ratio after damage', () => {
      runner.takeDamage(25, 'physical');
      expect(runner.getHpRatio()).toBe(0.5);
    });

    it('getHpRatio returns 0 when dead', () => {
      runner.takeDamage(50, 'physical');
      expect(runner.getHpRatio()).toBe(0);
    });

    it('getMovementType returns ground for ground enemy', () => {
      expect(runner.getMovementType()).toBe('ground');
    });

    it('getMovementType returns flying for flying enemy', () => {
      const flyer = createEnemyWithDef(createFlyerDef());
      expect(flyer.getMovementType()).toBe('flying');
    });
  });

  describe('state machine transitions', () => {
    it('starts in MOVING', () => {
      expect(runner.state).toBe(EnemyState.MOVING);
    });

    it('transitions to DYING when HP reaches zero', () => {
      runner.takeDamage(50, 'physical');
      expect(runner.state).toBe(EnemyState.DYING);
    });

    it('can be set to DEAD externally after tween', () => {
      runner.takeDamage(50, 'physical');
      runner.state = EnemyState.DEAD;
      expect(runner.state).toBe(EnemyState.DEAD);
      expect(runner.isAlive()).toBe(false);
    });

    it('can be set to BREAKTHROUGH externally', () => {
      runner.state = EnemyState.BREAKTHROUGH;
      expect(runner.state).toBe(EnemyState.BREAKTHROUGH);
      expect(runner.isAlive()).toBe(false);
    });
  });

  describe('archetype stat differences', () => {
    it('Tank has higher HP than Runner', () => {
      expect(tank.getMaxHp()).toBeGreaterThan(runner.getMaxHp());
    });

    it('Tank has slower speed than Runner', () => {
      expect(tank.currentSpeed).toBeLessThan(runner.currentSpeed);
    });

    it('Fast Unit has higher speed than Runner', () => {
      const fast = createEnemyWithDef({
        id: 'fast',
        name: 'Fast Scout',
        baseHp: 30,
        baseSpeed: 140,
        armor: 0,
        breakthroughDamage: 10,
        currencyReward: 8,
        scoreReward: 15,
        movementType: 'ground',
        spriteKey: 'enemy-fast',
        damageTypeMultipliers: {},
      });
      expect(fast.currentSpeed).toBeGreaterThan(runner.currentSpeed);
    });

    it('Fast Unit has lower HP than Runner', () => {
      const fast = createEnemyWithDef({
        id: 'fast',
        name: 'Fast Scout',
        baseHp: 30,
        baseSpeed: 140,
        armor: 0,
        breakthroughDamage: 10,
        currencyReward: 8,
        scoreReward: 15,
        movementType: 'ground',
        spriteKey: 'enemy-fast',
        damageTypeMultipliers: {},
      });
      expect(fast.getMaxHp()).toBeLessThan(runner.getMaxHp());
    });

    it('Tank armor reduces damage vs Runner no armor', () => {
      const runnerResult = runner.takeDamage(10, 'physical');
      const tankResult = tank.takeDamage(10, 'physical');
      /* Runner: 10 * 1.0 - 0 = 10. Tank: 10 * 1.0 - 5 = 5 */
      expect(tankResult.actualDamage).toBeLessThan(runnerResult.actualDamage);
    });
  });
});
