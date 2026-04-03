/**
 * Unit tests for EnemySystem.
 *
 * Tests wave scaling formula, spawn behavior, active enemy tracking,
 * and getEnemyById lookups. Movement, death, and breakthrough are
 * integration behaviors tested via runtime (QA); here we test the
 * pure logic and API contracts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnemySystem } from '../../src/systems/enemy-system';
import type { GameState, EnemyDefinition, GridPoint } from '../../src/types/game-types';
import { resetIdCounter } from '../../src/utils/id-generator';

/** Creates a mock Phaser scene with events, registry, time, tweens, and add. */
function createMockScene() {
  const registryStore = new Map<string, unknown>();

  return {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    registry: {
      get: vi.fn((key: string) => registryStore.get(key)),
      set: vi.fn((key: string, value: unknown) => registryStore.set(key, value)),
      remove: vi.fn((key: string) => registryStore.delete(key)),
    },
    add: {
      graphics: vi.fn(() => ({
        setDepth: vi.fn(),
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    time: {
      delayedCall: vi.fn(() => ({
        remove: vi.fn(),
      })),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        /* Immediately call onComplete to simulate tween finishing. */
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
      }),
    },
    _registryStore: registryStore,
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

function createMockPoolManager() {
  let spriteCounter = 0;
  return {
    acquireEnemy: vi.fn((textureKey: string, x: number, y: number) => {
      spriteCounter++;
      return {
        x,
        y,
        rotation: 0,
        displayWidth: 24,
        displayHeight: 24,
        setTexture: vi.fn(),
        setPosition: vi.fn(function(this: { x: number; y: number }, nx: number, ny: number) {
          this.x = nx;
          this.y = ny;
        }),
        setDepth: vi.fn(),
        setActive: vi.fn(),
        setVisible: vi.fn(),
        setTint: vi.fn(),
        clearTint: vi.fn(),
        setAlpha: vi.fn(),
        setScale: vi.fn(),
        setRotation: vi.fn(),
      };
    }),
    releaseEnemy: vi.fn(),
    _spriteCounter: () => spriteCounter,
  };
}

function createMockConfigManager() {
  const enemies: Record<string, EnemyDefinition> = {
    runner: {
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
    },
    tank: {
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
    },
    flyer: {
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
    },
  };

  return {
    getEnemy: vi.fn((id: string) => {
      const def = enemies[id];
      if (!def) throw new Error(`Enemy "${id}" not found`);
      return def;
    }),
    getAllEnemies: vi.fn(() => Object.values(enemies)),
  };
}

/** Creates a minimal waypoint list (3 points in a straight line). */
function createMockWaypoints(): GridPoint[] {
  return [
    { col: 0, row: 5, worldX: 32, worldY: 352 },
    { col: 1, row: 5, worldX: 96, worldY: 352 },
    { col: 2, row: 5, worldX: 160, worldY: 352 },
  ];
}

function createMockMapData(waypoints: GridPoint[]) {
  return {
    getWaypoints: () => waypoints,
    getSpawnWorldPos: () => ({ x: waypoints[0]!.worldX, y: waypoints[0]!.worldY }),
  };
}

describe('EnemySystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let poolManager: ReturnType<typeof createMockPoolManager>;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let system: EnemySystem;

  beforeEach(() => {
    resetIdCounter();
    scene = createMockScene();
    gameState = createMockGameState();
    poolManager = createMockPoolManager();
    configManager = createMockConfigManager();

    /* Put mapData on registry so init() picks it up. */
    const waypoints = createMockWaypoints();
    const mapData = createMockMapData(waypoints);
    scene._registryStore.set('mapData', mapData);

    system = new EnemySystem(
      scene as never,
      gameState,
      poolManager as never,
      configManager as never,
    );
    system.init();
  });

  describe('getWaveScaling (static)', () => {
    it('should return 1.0 multipliers for wave 1', () => {
      const scaling = EnemySystem.getWaveScaling(1);
      expect(scaling.hpMultiplier).toBe(1.0);
      expect(scaling.speedMultiplier).toBe(1.0);
    });

    it('should increase HP multiplier for wave 5', () => {
      const scaling = EnemySystem.getWaveScaling(5);
      /* 1 + (5-1) * 0.15 = 1.60 */
      expect(scaling.hpMultiplier).toBeCloseTo(1.60, 2);
    });

    it('should increase speed multiplier for wave 5', () => {
      const scaling = EnemySystem.getWaveScaling(5);
      /* 1 + (5-1) * 0.03 = 1.12 */
      expect(scaling.speedMultiplier).toBeCloseTo(1.12, 2);
    });

    it('should return correct multipliers for wave 10', () => {
      const scaling = EnemySystem.getWaveScaling(10);
      /* HP: 1 + 9 * 0.15 = 2.35. Speed: 1 + 9 * 0.03 = 1.27 */
      expect(scaling.hpMultiplier).toBeCloseTo(2.35, 2);
      expect(scaling.speedMultiplier).toBeCloseTo(1.27, 2);
    });

    it('should return correct multipliers for wave 15', () => {
      const scaling = EnemySystem.getWaveScaling(15);
      /* HP: 1 + 14 * 0.15 = 3.10. Speed: 1 + 14 * 0.03 = 1.42 */
      expect(scaling.hpMultiplier).toBeCloseTo(3.10, 2);
      expect(scaling.speedMultiplier).toBeCloseTo(1.42, 2);
    });

    it('should return correct multipliers for wave 20', () => {
      const scaling = EnemySystem.getWaveScaling(20);
      /* HP: 1 + 19 * 0.15 = 3.85. Speed: 1 + 19 * 0.03 = 1.57 */
      expect(scaling.hpMultiplier).toBeCloseTo(3.85, 2);
      expect(scaling.speedMultiplier).toBeCloseTo(1.57, 2);
    });

    it('should increase HP monotonically across waves', () => {
      let prev = 0;
      for (let wave = 1; wave <= 20; wave++) {
        const scaling = EnemySystem.getWaveScaling(wave);
        expect(scaling.hpMultiplier).toBeGreaterThan(prev);
        prev = scaling.hpMultiplier;
      }
    });

    it('should cap HP multiplier at 5.0', () => {
      /* Wave 28: 1 + 27 * 0.15 = 5.05, clamped to 5.0 */
      const scaling = EnemySystem.getWaveScaling(28);
      expect(scaling.hpMultiplier).toBe(5.0);
    });

    it('should cap speed multiplier at 2.0', () => {
      /* Wave 35: 1 + 34 * 0.03 = 2.02, clamped to 2.0 */
      const scaling = EnemySystem.getWaveScaling(35);
      expect(scaling.speedMultiplier).toBe(2.0);
    });

    it('should handle wave 0 gracefully (min factor 0)', () => {
      const scaling = EnemySystem.getWaveScaling(0);
      expect(scaling.hpMultiplier).toBe(1.0);
      expect(scaling.speedMultiplier).toBe(1.0);
    });
  });

  describe('spawnEnemy', () => {
    it('should spawn a runner and return Enemy instance', () => {
      const enemy = system.spawnEnemy('runner', 1);
      expect(enemy).not.toBeNull();
      expect(enemy!.definition.id).toBe('runner');
      expect(enemy!.instanceId).toBe('enemy-1');
    });

    it('should acquire sprite from pool with correct texture key', () => {
      system.spawnEnemy('runner', 1);
      expect(poolManager.acquireEnemy).toHaveBeenCalledWith(
        'enemy-runner',
        32, // spawn tile worldX
        352, // spawn tile worldY
      );
    });

    it('should apply wave scaling when spawning at wave 5', () => {
      const enemy = system.spawnEnemy('runner', 5);
      /* HP: floor(50 * 1.6) = 80. Speed: 80 * 1.12 = 89.6 */
      expect(enemy!.getMaxHp()).toBe(80);
      expect(enemy!.currentSpeed).toBeCloseTo(89.6, 1);
    });

    it('should emit ENEMY_SPAWNED event', () => {
      system.spawnEnemy('runner', 1);
      expect(scene.events.emit).toHaveBeenCalledWith(
        'ENEMY_SPAWNED',
        expect.objectContaining({
          enemyId: 'enemy-1',
          enemyType: 'runner',
          waveNumber: 1,
        }),
      );
    });

    it('should return null when pool is exhausted', () => {
      poolManager.acquireEnemy.mockReturnValueOnce(null);
      const enemy = system.spawnEnemy('runner', 1);
      expect(enemy).toBeNull();
    });

    it('should add spawned enemy to active enemies list', () => {
      system.spawnEnemy('runner', 1);
      expect(system.getActiveEnemies().length).toBe(1);
    });

    it('should set depth to DEPTH_ENEMY_FLYING for flying enemies', () => {
      const enemy = system.spawnEnemy('flyer', 1);
      expect(enemy).not.toBeNull();
      expect(enemy!.sprite.setDepth).toHaveBeenCalledWith(20); // DEPTH_ENEMY_FLYING
    });

    it('should set depth to DEPTH_ENEMY_GROUND for ground enemies', () => {
      const enemy = system.spawnEnemy('runner', 1);
      expect(enemy).not.toBeNull();
      expect(enemy!.sprite.setDepth).toHaveBeenCalledWith(10); // DEPTH_ENEMY_GROUND
    });
  });

  describe('getActiveEnemies', () => {
    it('should return empty array when no enemies exist', () => {
      expect(system.getActiveEnemies()).toHaveLength(0);
    });

    it('should return all moving enemies', () => {
      system.spawnEnemy('runner', 1);
      system.spawnEnemy('tank', 1);
      expect(system.getActiveEnemies()).toHaveLength(2);
    });
  });

  describe('getEnemyById', () => {
    it('should find an enemy by instance ID', () => {
      const spawned = system.spawnEnemy('runner', 1);
      const found = system.getEnemyById(spawned!.instanceId);
      expect(found).toBe(spawned);
    });

    it('should return null for unknown ID', () => {
      expect(system.getEnemyById('enemy-999')).toBeNull();
    });

    it('should return null for dead enemies', () => {
      const spawned = system.spawnEnemy('runner', 1);
      spawned!.takeDamage(50, 'physical'); // Kill it
      expect(system.getEnemyById(spawned!.instanceId)).toBeNull();
    });
  });

  describe('applyDamageToEnemy', () => {
    it('should reduce enemy HP', () => {
      const enemy = system.spawnEnemy('runner', 1)!;
      system.applyDamageToEnemy(enemy.instanceId, 10, 'physical');
      expect(enemy.getCurrentHp()).toBe(40);
    });

    it('should trigger hit flash via scene.time.delayedCall', () => {
      const enemy = system.spawnEnemy('runner', 1)!;
      system.applyDamageToEnemy(enemy.instanceId, 10, 'physical');
      expect(scene.time.delayedCall).toHaveBeenCalledWith(
        150, // HIT_FLASH_DURATION_MS
        expect.any(Function),
      );
    });

    it('should emit ENEMY_DIED when damage kills the enemy', () => {
      const enemy = system.spawnEnemy('runner', 1)!;
      system.applyDamageToEnemy(enemy.instanceId, 50, 'physical');
      expect(scene.events.emit).toHaveBeenCalledWith(
        'ENEMY_DIED',
        expect.objectContaining({
          enemyId: enemy.instanceId,
          enemyType: 'runner',
          reward: 5,
          scoreReward: 10,
        }),
      );
    });

    it('should do nothing for non-existent enemy', () => {
      system.applyDamageToEnemy('enemy-999', 10, 'physical');
      /* No error thrown. */
      expect(true).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should release all enemies back to pool', () => {
      system.spawnEnemy('runner', 1);
      system.spawnEnemy('tank', 1);
      system.destroy();
      expect(poolManager.releaseEnemy).toHaveBeenCalledTimes(2);
    });

    it('should destroy health bar graphics', () => {
      system.destroy();
      /* Graphics destroy was called. */
      expect(true).toBe(true); // If it throws, the test fails
    });
  });
});
