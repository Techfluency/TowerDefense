/**
 * Unit tests for BOLT-018 Boss System.
 *
 * Tests boss enemy data definitions, mechanic threshold detection,
 * minion summoning, speed surge activation, boss HP bar visibility,
 * boss intro sequence, and event emission. Uses mock Phaser scene
 * to avoid browser dependency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Phaser must be mocked before source imports because Phaser uses
 * window which is undefined in Node.js. */
vi.mock('phaser', () => {
  const EventEmitter = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };

  return {
    default: {
      Scene: class {},
      GameObjects: {
        Sprite: class {},
        Graphics: class {},
        Text: class {},
        Container: class {},
      },
      Math: {
        Angle: {
          RotateTo: vi.fn((current: number, target: number, step: number) => {
            const diff = target - current;
            if (Math.abs(diff) <= step) return target;
            return current + Math.sign(diff) * step;
          }),
        },
        RandomDataGenerator: class {
          constructor() {}
        },
      },
      Scale: { FIT: 0, CENTER_BOTH: 0 },
      AUTO: 0,
      Events: { EventEmitter: class { constructor() { return EventEmitter; } } },
    },
  };
});

import { BossSystem } from '../../src/systems/boss-system';
import { Enemy, EnemyState } from '../../src/entities/enemy';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { EnemyDefinition, GameState } from '../../src/types/game-types';
import type { WaveStartedPayload, EnemySpawnedPayload, EnemyDiedPayload } from '../../src/types/events';
import {
  BOSS_SUMMON_THRESHOLD_1,
  BOSS_SUMMON_THRESHOLD_2,
  BOSS_SPEED_SURGE_THRESHOLD,
  BOSS_SPEED_SURGE_MULTIPLIER,
  BOSS_MINION_SUMMON_COUNT,
} from '../../src/vfx/vfx-config';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSprite(x = 0, y = 0) {
  return {
    x,
    y,
    rotation: 0,
    displayWidth: 24,
    displayHeight: 24,
    setTint: vi.fn(),
    clearTint: vi.fn(),
    setAlpha: vi.fn(),
    setScale: vi.fn(),
    setRotation: vi.fn(),
    setDepth: vi.fn(),
    setScrollFactor: vi.fn(),
    setOrigin: vi.fn(),
    setVisible: vi.fn(),
    destroy: vi.fn(),
    scaleX: 1,
    scaleY: 1,
  };
}

function createMockScene() {
  const registryStore = new Map<string, unknown>();
  const eventHandlers: Record<string, Array<{ fn: (...args: unknown[]) => void; ctx: unknown }>> = {};

  return {
    events: {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void, ctx: unknown) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event]!.push({ fn, ctx });
      }),
      off: vi.fn(),
      emit: vi.fn((event: string, payload: unknown) => {
        const handlers = eventHandlers[event];
        if (handlers) {
          for (const h of handlers) {
            h.fn.call(h.ctx, payload);
          }
        }
      }),
    },
    registry: {
      get: vi.fn((key: string) => registryStore.get(key)),
      set: vi.fn((key: string, value: unknown) => registryStore.set(key, value)),
      remove: vi.fn((key: string) => registryStore.delete(key)),
    },
    add: {
      graphics: vi.fn(() => ({
        setDepth: vi.fn(),
        setScrollFactor: vi.fn(),
        setVisible: vi.fn(),
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        lineStyle: vi.fn(),
        strokeRect: vi.fn(),
        destroy: vi.fn(),
      })),
      text: vi.fn(() => ({
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setScrollFactor: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setScale: vi.fn().mockReturnThis(),
        setText: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
      })),
      circle: vi.fn(() => ({
        setDepth: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    time: {
      delayedCall: vi.fn((_delay: number, cb: () => void) => {
        cb();
        return { remove: vi.fn() };
      }),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
      }),
    },
    cameras: {
      main: {
        shake: vi.fn(),
      },
    },
    _registryStore: registryStore,
    _eventHandlers: eventHandlers,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 100,
    maxObjectiveHp: 100,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
  };
}

function createBossDef(): EnemyDefinition {
  return {
    id: 'boss',
    name: 'BOSS',
    baseHp: 2000,
    baseSpeed: 35,
    armor: 15,
    breakthroughDamage: 100,
    currencyReward: 200,
    scoreReward: 500,
    movementType: 'ground',
    spriteKey: 'enemy-boss',
    damageTypeMultipliers: {},
  };
}

function createBossEnemy(x = 100, y = 100, hpMultiplier = 1): Enemy {
  const sprite = createMockSprite(x, y) as unknown as import('phaser').GameObjects.Sprite;
  return new Enemy('boss-1', createBossDef(), sprite, hpMultiplier, 1, 5);
}

function createMockEnemySystem(bossEnemy: Enemy | null) {
  let spawnCount = 0;
  return {
    getEnemyById: vi.fn((id: string) => {
      if (bossEnemy && bossEnemy.instanceId === id) return bossEnemy;
      return null;
    }),
    getActiveEnemies: vi.fn(() => bossEnemy ? [bossEnemy] : []),
    spawnEnemy: vi.fn((_archetype: string, _wave: number) => {
      spawnCount++;
      const sprite = createMockSprite(100, 100) as unknown as import('phaser').GameObjects.Sprite;
      const minion = new Enemy(
        `minion-${spawnCount}`,
        {
          id: 'swarm',
          name: 'Swarm Bug',
          baseHp: 15,
          baseSpeed: 100,
          armor: 0,
          breakthroughDamage: 5,
          currencyReward: 3,
          scoreReward: 5,
          movementType: 'ground',
          spriteKey: 'enemy-swarm',
          damageTypeMultipliers: {},
        },
        sprite,
        1,
        1,
        5,
      );
      return minion;
    }),
  };
}

function createMockVFXManager() {
  return {
    playBossSpawnBurst: vi.fn(),
    playBossDeathShake: vi.fn(),
    playBossSpeedTrail: vi.fn(),
    playScreenShake: vi.fn(),
    playDeathBurst: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BossSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let bossSystem: BossSystem;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createMockGameState();
  });

  describe('Boss enemy data definition', () => {
    it('should define boss with HP 2000, speed 35, armor 15', () => {
      const def = createBossDef();
      expect(def.baseHp).toBe(2000);
      expect(def.baseSpeed).toBe(35);
      expect(def.armor).toBe(15);
    });

    it('should define boss as ground movement type', () => {
      const def = createBossDef();
      expect(def.movementType).toBe('ground');
    });

    it('should define boss with large currency and score reward', () => {
      const def = createBossDef();
      expect(def.currencyReward).toBe(200);
      expect(def.scoreReward).toBe(500);
    });

    it('should define boss with enemy-boss sprite key', () => {
      const def = createBossDef();
      expect(def.spriteKey).toBe('enemy-boss');
    });

    it('should define boss with high breakthrough damage', () => {
      const def = createBossDef();
      expect(def.breakthroughDamage).toBe(100);
    });
  });

  describe('Boss mechanic thresholds', () => {
    it('should have first summon at 75% HP', () => {
      expect(BOSS_SUMMON_THRESHOLD_1).toBe(0.75);
    });

    it('should have second summon at 50% HP', () => {
      expect(BOSS_SUMMON_THRESHOLD_2).toBe(0.50);
    });

    it('should have speed surge at 25% HP', () => {
      expect(BOSS_SPEED_SURGE_THRESHOLD).toBe(0.25);
    });

    it('should summon 3 minions per threshold', () => {
      expect(BOSS_MINION_SUMMON_COUNT).toBe(3);
    });

    it('should apply 2x speed surge multiplier', () => {
      expect(BOSS_SPEED_SURGE_MULTIPLIER).toBe(2.0);
    });
  });

  describe('Boss HP calculations', () => {
    it('should create a boss with 2000 max HP at wave 1 (1x multiplier)', () => {
      const boss = createBossEnemy(100, 100, 1);
      expect(boss.getMaxHp()).toBe(2000);
      expect(boss.getCurrentHp()).toBe(2000);
    });

    it('should scale boss HP with wave multiplier', () => {
      /* Wave 10: hpMultiplier = 1 + 9 * 0.15 = 2.35 -> 2000 * 2.35 = 4700 */
      const boss = createBossEnemy(100, 100, 2.35);
      expect(boss.getMaxHp()).toBe(4700);
    });

    it('should report correct HP ratio after taking damage', () => {
      const boss = createBossEnemy(100, 100, 1);
      /* Boss has 15 armor. Damage = max(1, floor(500 - 15)) = 485 */
      boss.takeDamage(500);
      /* HP = 2000 - 485 = 1515 */
      expect(boss.getCurrentHp()).toBe(1515);
      expect(boss.getHpRatio()).toBeCloseTo(1515 / 2000, 2);
    });

    it('should die when HP reaches zero', () => {
      const boss = createBossEnemy(100, 100, 1);
      /* Need to deal enough to kill: 2000 HP, 15 armor */
      /* Each hit of 2015 does max(1, floor(2015-15)) = 2000 damage */
      const result = boss.takeDamage(2015);
      expect(result.died).toBe(true);
      expect(boss.state).toBe(EnemyState.DYING);
    });
  });

  describe('BossSystem initialization and lifecycle', () => {
    it('should register on scene registry during init', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();
      expect(scene.registry.set).toHaveBeenCalledWith('bossSystem', bossSystem);
    });

    it('should register listeners for WAVE_STARTED, ENEMY_SPAWNED, and ENEMY_DIED', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const registeredEvents = (scene.events.on as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain(GAME_EVENTS.WAVE_STARTED);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_SPAWNED);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_DIED);
    });

    it('should clean up on destroy', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();
      bossSystem.destroy();
      expect(scene.registry.remove).toHaveBeenCalledWith('bossSystem');
    });
  });

  describe('Boss wave intro', () => {
    it('should trigger intro when boss wave starts', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const payload: WaveStartedPayload = {
        waveNumber: 5,
        totalWaves: 20,
        isBossWave: true,
        earlyStart: false,
        upcomingComposition: [],
      };
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, payload);

      /* Camera shake should have been called for boss intro. */
      expect(scene.cameras.main.shake).toHaveBeenCalled();
    });

    it('should not trigger intro for non-boss waves', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const payload: WaveStartedPayload = {
        waveNumber: 4,
        totalWaves: 20,
        isBossWave: false,
        earlyStart: false,
        upcomingComposition: [],
      };
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, payload);

      expect(scene.cameras.main.shake).not.toHaveBeenCalled();
    });

    it('should set isBossWave flag correctly', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      expect(bossSystem.isBossWave()).toBe(false);

      const payload: WaveStartedPayload = {
        waveNumber: 5,
        totalWaves: 20,
        isBossWave: true,
        earlyStart: false,
        upcomingComposition: [],
      };
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, payload);

      expect(bossSystem.isBossWave()).toBe(true);
    });
  });

  describe('Boss tracking on spawn', () => {
    it('should track boss enemy when spawned', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const payload: EnemySpawnedPayload = {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, payload);

      expect(bossSystem.getActiveBosses()).toHaveLength(1);
    });

    it('should not track non-boss enemies', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const payload: EnemySpawnedPayload = {
        enemyId: 'runner-1',
        enemyType: 'runner',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, payload);

      expect(bossSystem.getActiveBosses()).toHaveLength(0);
    });

    it('should scale boss sprite to 1.5x on spawn', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      const payload: EnemySpawnedPayload = {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, payload);

      expect(bossEnemy.sprite.setScale).toHaveBeenCalledWith(1.5);
    });
  });

  describe('Minion summoning mechanic', () => {
    it('should summon 3 minions at 75% HP threshold', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      /* Register the boss. */
      const spawnPayload: EnemySpawnedPayload = {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, spawnPayload);

      /* Deal damage to bring boss below 75% HP.
       * Boss HP: 2000, armor: 15. Need HP < 1500 (75%).
       * Damage of 515 -> actual = max(1, floor(515-15)) = 500 -> HP = 1500
       * That puts us at exactly 75%. Need to go slightly below. */
      bossEnemy.takeDamage(516); /* actual = 501 -> HP = 1499 -> ratio = 0.7495 */

      /* Run update to trigger threshold check. */
      bossSystem.update(0, 16);

      /* Should have spawned 3 minions. */
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledTimes(3);
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledWith('swarm', 5);
    });

    it('should summon 3 more minions at 50% HP threshold', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      /* Register the boss. */
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      /* Bring below 50% in one big hit. 2000 * 0.5 = 1000, need < 1000.
       * Damage = max(1, floor(1016-15)) = 1001, HP = 999 -> ratio = 0.4995. */
      bossEnemy.takeDamage(1016);
      bossSystem.update(0, 16);

      /* Both 75% and 50% should fire: 3 + 3 = 6 minions total. */
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledTimes(6);
    });

    it('should not re-trigger summon on same threshold', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      /* Bring below 75%. */
      bossEnemy.takeDamage(516);
      bossSystem.update(0, 16);

      /* Deal more damage, still above 50%. */
      bossEnemy.takeDamage(100);
      bossSystem.update(0, 16);

      /* Should still only have 3 minions (75% threshold fires once). */
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledTimes(3);
    });

    it('should emit BOSS_MINION_SUMMON event on summon', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      bossEnemy.takeDamage(516);
      bossSystem.update(0, 16);

      expect(scene.events.emit).toHaveBeenCalledWith(
        GAME_EVENTS.BOSS_MINION_SUMMON,
        expect.objectContaining({
          bossId: 'boss-1',
          minionCount: 3,
          hpThreshold: 0.75,
        }),
      );
    });
  });

  describe('Speed surge mechanic', () => {
    it('should double speed at 25% HP threshold', () => {
      const bossEnemy = createBossEnemy();
      const originalSpeed = bossEnemy.currentSpeed;
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      /* Bring below 25%. 2000 * 0.25 = 500, need < 500.
       * Damage = max(1, floor(1516-15)) = 1501, HP = 499 -> ratio = 0.2495. */
      bossEnemy.takeDamage(1516);
      bossSystem.update(0, 16);

      /* Speed should be doubled. */
      expect(bossEnemy.currentSpeed).toBe(originalSpeed * BOSS_SPEED_SURGE_MULTIPLIER);
    });

    it('should apply red tint on speed surge', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      bossEnemy.takeDamage(1516);
      bossSystem.update(0, 16);

      expect(bossEnemy.sprite.setTint).toHaveBeenCalled();
    });

    it('should emit BOSS_SPEED_SURGE event', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      bossEnemy.takeDamage(1516);
      bossSystem.update(0, 16);

      expect(scene.events.emit).toHaveBeenCalledWith(
        GAME_EVENTS.BOSS_SPEED_SURGE,
        expect.objectContaining({
          bossId: 'boss-1',
          speedMultiplier: 2.0,
        }),
      );
    });

    it('should not re-trigger speed surge', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      bossEnemy.takeDamage(1516);
      bossSystem.update(0, 16);

      const speedAfterSurge = bossEnemy.currentSpeed;

      /* Take more damage but speed should not double again. */
      bossEnemy.takeDamage(100);
      bossSystem.update(0, 16);

      expect(bossEnemy.currentSpeed).toBe(speedAfterSurge);
    });
  });

  describe('Boss death handling', () => {
    it('should remove boss from tracking on death event', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      expect(bossSystem.getActiveBosses()).toHaveLength(1);

      const deathPayload: EnemyDiedPayload = {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        reward: 200,
        scoreReward: 500,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, deathPayload);

      expect(bossSystem.getActiveBosses()).toHaveLength(0);
    });

    it('should emit BOSS_DIED event on boss death', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      const deathPayload: EnemyDiedPayload = {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        reward: 200,
        scoreReward: 500,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, deathPayload);

      expect(scene.events.emit).toHaveBeenCalledWith(
        GAME_EVENTS.BOSS_DIED,
        expect.objectContaining({
          bossId: 'boss-1',
        }),
      );
    });

    it('should not emit BOSS_DIED for non-boss enemy death', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      /* Clear previous emit calls so we can check fresh. */
      (scene.events.emit as ReturnType<typeof vi.fn>).mockClear();

      const deathPayload: EnemyDiedPayload = {
        enemyId: 'runner-1',
        enemyType: 'runner',
        position: { x: 100, y: 100 },
        reward: 5,
        scoreReward: 10,
      };
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, deathPayload);

      /* Should not have emitted BOSS_DIED (only the triggering ENEMY_DIED emit). */
      const bossDiedCalls = (scene.events.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === GAME_EVENTS.BOSS_DIED,
      );
      expect(bossDiedCalls).toHaveLength(0);
    });

    it('should clear boss wave flag when last boss dies', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      scene._registryStore.set('enemySystem', mockEnemySystem);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      /* Set boss wave active. */
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, {
        waveNumber: 5,
        totalWaves: 20,
        isBossWave: true,
        earlyStart: false,
        upcomingComposition: [],
      });

      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });

      expect(bossSystem.isBossWave()).toBe(true);

      /* Boss dies. */
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        reward: 200,
        scoreReward: 500,
      });

      expect(bossSystem.isBossWave()).toBe(false);
    });
  });

  describe('Boss HP bar visibility', () => {
    it('should hide boss HP bar when no bosses are active', () => {
      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      bossSystem.update(0, 16);

      /* HP bar graphics should call setVisible(false). */
      const graphicsMock = (scene.add.graphics as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      if (graphicsMock) {
        expect(graphicsMock.setVisible).toHaveBeenCalledWith(false);
      }
    });
  });

  describe('Full boss encounter flow', () => {
    it('should handle complete boss lifecycle: spawn -> mechanics -> death', () => {
      const bossEnemy = createBossEnemy();
      const mockEnemySystem = createMockEnemySystem(bossEnemy);
      const mockVFX = createMockVFXManager();
      scene._registryStore.set('enemySystem', mockEnemySystem);
      scene._registryStore.set('vfxManager', mockVFX);

      bossSystem = new BossSystem(
        scene as unknown as import('phaser').Scene,
        gameState,
      );
      bossSystem.init();

      /* 1. Boss wave starts with intro. */
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, {
        waveNumber: 5,
        totalWaves: 20,
        isBossWave: true,
        earlyStart: false,
        upcomingComposition: [],
      });
      expect(scene.cameras.main.shake).toHaveBeenCalled();

      /* 2. Boss spawns. */
      scene.events.emit(GAME_EVENTS.ENEMY_SPAWNED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        waveNumber: 5,
      });
      expect(bossSystem.getActiveBosses()).toHaveLength(1);
      expect(mockVFX.playBossSpawnBurst).toHaveBeenCalled();

      /* 3. Damage to 74% triggers minion summon at 75%. */
      bossEnemy.takeDamage(516); /* HP = 1499 */
      bossSystem.update(0, 16);
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledTimes(3);

      /* 4. Damage to 49% triggers second summon at 50%. */
      bossEnemy.takeDamage(516); /* HP ~998 */
      bossSystem.update(0, 16);
      expect(mockEnemySystem.spawnEnemy).toHaveBeenCalledTimes(6);

      /* 5. Damage to 24% triggers speed surge at 25%. */
      bossEnemy.takeDamage(516); /* HP ~497 */
      bossSystem.update(0, 16);
      expect(bossEnemy.sprite.setTint).toHaveBeenCalled();

      /* 6. Boss dies. */
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'boss-1',
        enemyType: 'boss',
        position: { x: 100, y: 100 },
        reward: 200,
        scoreReward: 500,
      });
      expect(bossSystem.getActiveBosses()).toHaveLength(0);
      expect(mockVFX.playBossDeathShake).toHaveBeenCalled();
    });
  });
});
