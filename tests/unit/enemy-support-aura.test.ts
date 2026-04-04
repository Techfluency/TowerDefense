/**
 * Unit tests for BOLT-017 Support Unit aura mechanics.
 *
 * Tests the Support enemy's speed aura: application to nearby enemies,
 * removal on death, non-stacking behavior, self-exclusion, and distance
 * checks. Uses mock scene/pool/config to isolate the aura logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnemySystem } from '../../src/systems/enemy-system';
import { EnemyState } from '../../src/entities/enemy';
import type { GameState, EnemyDefinition, GridPoint } from '../../src/types/game-types';
import { resetIdCounter } from '../../src/utils/id-generator';

/** Creates a mock Phaser scene with the minimal API surface needed. */
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

/**
 * Creates a mock pool manager that places sprites at specified coordinates.
 * The X/Y are important for aura radius testing.
 */
function createMockPoolManager() {
  return {
    acquireEnemy: vi.fn((_textureKey: string, x: number, y: number) => ({
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
    })),
    releaseEnemy: vi.fn(),
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
    support: {
      id: 'support',
      name: 'Support Unit',
      baseHp: 50,
      baseSpeed: 70,
      armor: 0,
      breakthroughDamage: 10,
      currencyReward: 25,
      scoreReward: 40,
      movementType: 'ground',
      spriteKey: 'enemy-support',
      damageTypeMultipliers: {},
      aura: {
        radiusPx: 128,
        speedMultiplier: 1.3,
      },
    },
    shielded: {
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

function createMockWaypoints(): GridPoint[] {
  return [
    { col: 0, row: 5, worldX: 32, worldY: 352 },
    { col: 1, row: 5, worldX: 96, worldY: 352 },
    { col: 2, row: 5, worldX: 160, worldY: 352 },
    { col: 3, row: 5, worldX: 224, worldY: 352 },
    { col: 4, row: 5, worldX: 288, worldY: 352 },
    { col: 5, row: 5, worldX: 352, worldY: 352 },
  ];
}

function createMockMapData(waypoints: GridPoint[]) {
  return {
    getWaypoints: () => waypoints,
    getSpawnWorldPos: () => ({ x: waypoints[0]!.worldX, y: waypoints[0]!.worldY }),
  };
}

describe('Support Aura System (BOLT-017)', () => {
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

  describe('support unit properties', () => {
    it('should spawn support unit with aura config', () => {
      const support = system.spawnEnemy('support', 14);
      expect(support).not.toBeNull();
      expect(support!.hasAura()).toBe(true);
      expect(support!.getAuraRadius()).toBe(128);
      expect(support!.getAuraSpeedMultiplier()).toBe(1.3);
    });

    it('should not have aura on non-support enemies', () => {
      const runner = system.spawnEnemy('runner', 1);
      expect(runner!.hasAura()).toBe(false);
      expect(runner!.getAuraRadius()).toBe(0);
      expect(runner!.getAuraSpeedMultiplier()).toBe(1.0);
    });
  });

  describe('aura speed buff application', () => {
    it('should buff nearby runners when support is close', () => {
      /* All enemies spawn at the same location (waypoint 0).
       * Distance = 0 which is within 128px radius. */
      const support = system.spawnEnemy('support', 14)!;
      const runner = system.spawnEnemy('runner', 14)!;

      /* Run one update cycle to trigger aura processing. */
      system.update(0, 16); // ~1 frame at 60fps

      /* Runner's base speed at wave 14: 80 * speedMultiplier.
       * After aura: baseSpeed * 1.3. */
      expect(runner.activeAuraSources.size).toBe(1);
      expect(runner.activeAuraSources.has(support.instanceId)).toBe(true);
      expect(runner.currentSpeed).toBeCloseTo(runner.baseSpeed * 1.3, 1);
    });

    it('should not buff the support unit itself', () => {
      const support = system.spawnEnemy('support', 14)!;

      system.update(0, 16);

      /* Support should not appear in its own aura sources. */
      expect(support.activeAuraSources.size).toBe(0);
      expect(support.currentSpeed).toBe(support.baseSpeed);
    });

    it('should not buff enemies outside the aura radius', () => {
      const support = system.spawnEnemy('support', 14)!;
      const runner = system.spawnEnemy('runner', 14)!;

      /* Move runner far away (beyond 128px radius). */
      runner.sprite.x = 500;
      runner.sprite.y = 500;

      system.update(0, 16);

      expect(runner.activeAuraSources.size).toBe(0);
      expect(runner.currentSpeed).toBe(runner.baseSpeed);
    });

    it('should not stack speed from multiple support units', () => {
      /* Two supports and one runner, all at same location. */
      system.spawnEnemy('support', 14);
      system.spawnEnemy('support', 14);
      const runner = system.spawnEnemy('runner', 14)!;

      system.update(0, 16);

      /* Runner should have 2 aura sources but only 1.3x speed, not 1.3 * 1.3. */
      expect(runner.activeAuraSources.size).toBe(2);
      expect(runner.currentSpeed).toBeCloseTo(runner.baseSpeed * 1.3, 1);
    });
  });

  describe('aura removal on support death', () => {
    it('should remove speed buff when support dies', () => {
      const support = system.spawnEnemy('support', 14)!;
      const runner = system.spawnEnemy('runner', 14)!;

      /* Apply aura. */
      system.update(0, 16);
      expect(runner.currentSpeed).toBeCloseTo(runner.baseSpeed * 1.3, 1);

      /* Kill the support unit. Death tween completes immediately in mock. */
      system.applyDamageToEnemy(support.instanceId, 500, 'physical');

      /* Run another update -- aura should be cleared. */
      system.update(0, 16);

      /* Runner should return to base speed since no supporters are alive. */
      expect(runner.activeAuraSources.size).toBe(0);
      expect(runner.currentSpeed).toBe(runner.baseSpeed);
    });

    it('should keep buff if only one of two supports dies', () => {
      const support1 = system.spawnEnemy('support', 14)!;
      system.spawnEnemy('support', 14);
      const runner = system.spawnEnemy('runner', 14)!;

      system.update(0, 16);
      expect(runner.activeAuraSources.size).toBe(2);

      /* Kill first support. Wave 14 scaling: HP = floor(50 * 2.95) = 147. */
      system.applyDamageToEnemy(support1.instanceId, 500, 'physical');
      system.update(0, 16);

      /* Runner still has one support -- speed buff should remain. */
      expect(runner.activeAuraSources.size).toBe(1);
      expect(runner.currentSpeed).toBeCloseTo(runner.baseSpeed * 1.3, 1);
    });
  });

  describe('aura events on support death', () => {
    it('should emit ENEMY_DIED when support is killed', () => {
      const support = system.spawnEnemy('support', 14)!;
      system.applyDamageToEnemy(support.instanceId, 500, 'physical');

      expect(scene.events.emit).toHaveBeenCalledWith(
        'ENEMY_DIED',
        expect.objectContaining({
          enemyId: support.instanceId,
          enemyType: 'support',
          reward: 25,
          scoreReward: 40,
        }),
      );
    });
  });

  describe('shielded unit spawning', () => {
    it('should spawn shielded unit with shield config', () => {
      const enemy = system.spawnEnemy('shielded', 12);
      expect(enemy).not.toBeNull();
      expect(enemy!.hasShield()).toBe(true);
      expect(enemy!.getShieldHp()).toBe(40);
    });

    it('should emit ENEMY_SHIELD_BROKEN when shield depletes', () => {
      const enemy = system.spawnEnemy('shielded', 12)!;

      /* Deal enough damage to break the shield (40 HP).
       * 50 raw - 3 armor = 47 final. Shield absorbs 40. */
      system.applyDamageToEnemy(enemy.instanceId, 50, 'physical');

      expect(scene.events.emit).toHaveBeenCalledWith(
        'ENEMY_SHIELD_BROKEN',
        expect.objectContaining({
          enemyId: enemy.instanceId,
          enemyType: 'shielded',
        }),
      );
    });

    it('should NOT emit ENEMY_SHIELD_BROKEN for partial shield damage', () => {
      const enemy = system.spawnEnemy('shielded', 12)!;

      /* Small damage: 10 raw - 3 armor = 7 final. Shield absorbs 7 of 40. */
      system.applyDamageToEnemy(enemy.instanceId, 10, 'physical');

      /* Check that ENEMY_SHIELD_BROKEN was NOT emitted. */
      const shieldBrokenCalls = (scene.events.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'ENEMY_SHIELD_BROKEN',
      );
      expect(shieldBrokenCalls.length).toBe(0);
    });
  });
});
