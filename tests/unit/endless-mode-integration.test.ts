/**
 * Integration tests for Endless Mode (BOLT-020).
 *
 * Tests WaveSystem behavior when transitioning from scripted waves to
 * procedural endless waves, CAMPAIGN_COMPLETE event emission,
 * GameState tracking, and wave-system public API in endless mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveSystem, WaveState } from '../../src/systems/wave-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState, WaveDefinition, EndlessConfig } from '../../src/types/game-types';
import type {
  WaveCompletedPayload,
  AllWavesCompletedPayload,
  CampaignCompletePayload,
  WaveStartedPayload,
} from '../../src/types/events';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockScene() {
  const registryStore = new Map<string, unknown>();
  const eventListeners = new Map<string, Array<{ fn: Function; ctx: unknown }>>();

  return {
    events: {
      on: vi.fn((event: string, fn: Function, ctx: unknown) => {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event)!.push({ fn, ctx });
      }),
      off: vi.fn(),
      emit: vi.fn(),
    },
    registry: {
      get: vi.fn((key: string) => registryStore.get(key)),
      set: vi.fn((key: string, value: unknown) => registryStore.set(key, value)),
      remove: vi.fn((key: string) => registryStore.delete(key)),
    },
    _registryStore: registryStore,
    _eventListeners: eventListeners,
  };
}

function createEndlessGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 100,
    maxObjectiveHp: 100,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'endless-test-seed',
    gameMode: 'endless',
    highestWaveReached: 0,
    campaignComplete: false,
  };
}

function createStageGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 100,
    maxObjectiveHp: 100,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'stage-test-seed',
    gameMode: 'stage',
    highestWaveReached: 0,
    campaignComplete: false,
  };
}

function createTestEndlessConfig(): EndlessConfig {
  return {
    scaledWaveStart: 2, // Endless starts at wave 2 (after 1 or 2 scripted waves)
    bossWaveInterval: 5,
    basePrepTimeMs: 5000,
    bossPrepTimeMs: 8000,
    baseEnemyCount: 5,
    enemyCountGrowthRate: 0.10,
    maxEnemyCount: 50,
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
      early: { runner: 50, tank: 50 },
      mid: { runner: 30, tank: 30, fast: 40 },
      late: { runner: 20, tank: 20, fast: 20, shielded: 40 },
    },
    weightTransitions: {
      earlyToMidWave: 10,
      midToLateWave: 20,
    },
    bossGroupMinions: {
      minCount: 2,
      maxCount: 5,
      countGrowthPerWave: 1,
    },
  };
}

function createMockConfigManager(waves: WaveDefinition[]) {
  return {
    getWaves: vi.fn(() => waves),
    getEnemy: vi.fn(),
    getTower: vi.fn(),
    getProjectile: vi.fn(),
    getMapConfig: vi.fn(),
    getAllTowers: vi.fn(),
    getAllEnemies: vi.fn(),
  };
}

function createMockEnemySystem() {
  let spawnCount = 0;
  return {
    spawnEnemy: vi.fn((_archetypeId: string, _waveNumber: number) => {
      spawnCount++;
      return { instanceId: `enemy-${spawnCount}`, definition: { id: _archetypeId } };
    }),
    getActiveEnemies: vi.fn(() => []),
  };
}

/** Creates a minimal 2-wave dataset for testing the transition. */
function createTwoWaves(): WaveDefinition[] {
  return [
    {
      waveNumber: 1,
      groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
      prepTimeMs: 1000,
      isBossWave: false,
    },
    {
      waveNumber: 2,
      groups: [{ enemyId: 'tank', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
      prepTimeMs: 1000,
      isBossWave: false,
    },
  ];
}

/** Helper to trigger MAP_READY event. */
function triggerMapReady(scene: ReturnType<typeof createMockScene>) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.MAP_READY);
  if (listeners) {
    for (const { fn, ctx } of listeners) fn.call(ctx);
  }
}

/** Helper to trigger enemy resolution events. */
function triggerEnemyDied(scene: ReturnType<typeof createMockScene>) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.ENEMY_DIED);
  if (listeners) {
    for (const { fn, ctx } of listeners) {
      fn.call(ctx, { enemyId: 'e', enemyType: 'runner', position: { x: 0, y: 0 }, reward: 5, scoreReward: 10 });
    }
  }
}

/** Completes the current wave by spawning and resolving all enemies. */
function completeCurrentWave(
  ws: WaveSystem,
  scene: ReturnType<typeof createMockScene>,
  enemyCount: number,
) {
  /* Spawn all enemies by advancing time well past their spawn intervals. */
  ws.update(10000, 10000);

  /* Resolve all spawned enemies. */
  for (let i = 0; i < enemyCount; i++) {
    triggerEnemyDied(scene);
  }

  /* Trigger COMPLETE state detection and processing. */
  ws.update(20000, 10000);
  ws.update(30000, 10000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Endless Mode - WaveSystem Integration', () => {
  let scene: ReturnType<typeof createMockScene>;
  let endlessConfig: EndlessConfig;
  let enemySystem: ReturnType<typeof createMockEnemySystem>;

  beforeEach(() => {
    scene = createMockScene();
    endlessConfig = createTestEndlessConfig();
    enemySystem = createMockEnemySystem();

    scene._registryStore.set('enemySystem', enemySystem);
    scene._registryStore.set('endlessConfig', endlessConfig);
  });

  // -----------------------------------------------------------------------
  // Stage mode: unchanged behavior
  // -----------------------------------------------------------------------

  describe('stage mode (unchanged behavior)', () => {
    it('should emit ALL_WAVES_COMPLETED after final wave in stage mode', () => {
      const gameState = createStageGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete wave 1. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Complete wave 2 (final wave). */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Should emit ALL_WAVES_COMPLETED, not CAMPAIGN_COMPLETE. */
      const emitCalls = scene.events.emit.mock.calls;
      const allComplete = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.ALL_WAVES_COMPLETED,
      );
      const campaignComplete = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.CAMPAIGN_COMPLETE,
      );

      expect(allComplete).toBeDefined();
      expect(campaignComplete).toBeUndefined();
      expect(ws.getState()).toBe(WaveState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // Endless mode: campaign -> endless transition
  // -----------------------------------------------------------------------

  describe('endless mode transition', () => {
    it('should emit CAMPAIGN_COMPLETE instead of ALL_WAVES_COMPLETED', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete wave 1. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Complete wave 2 (final scripted wave). */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      const emitCalls = scene.events.emit.mock.calls;
      const campaignComplete = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.CAMPAIGN_COMPLETE,
      );
      const allComplete = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.ALL_WAVES_COMPLETED,
      );

      expect(campaignComplete).toBeDefined();
      expect(allComplete).toBeUndefined(); // Should NOT emit ALL_WAVES_COMPLETED

      const payload = campaignComplete![1] as CampaignCompletePayload;
      expect(payload.totalScriptedWaves).toBe(2);
      expect(typeof payload.timestamp).toBe('number');
    });

    it('should transition to PREP for wave 3 (first endless wave)', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete both scripted waves. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Should be in PREP for wave 3 (first procedural wave). */
      expect(ws.getState()).toBe(WaveState.PREP);
      expect(ws.getCurrentWave()).toBe(3);
    });

    it('should set gameState.campaignComplete to true', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      expect(gameState.campaignComplete).toBe(true);
    });

    it('should report isEndlessMode() as true after transition', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      expect(ws.isEndlessMode()).toBe(false);

      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      expect(ws.isEndlessMode()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Highest wave tracking
  // -----------------------------------------------------------------------

  describe('highest wave tracking', () => {
    it('should update highestWaveReached on wave completion', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      expect(gameState.highestWaveReached).toBe(1);

      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      expect(gameState.highestWaveReached).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getTotalWaves in endless mode
  // -----------------------------------------------------------------------

  describe('getTotalWaves in endless mode', () => {
    it('should return wave count during campaign phase', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();

      expect(ws.getTotalWaves()).toBe(2);
    });

    it('should return -1 after transitioning to endless', () => {
      const gameState = createEndlessGameState();
      const config = createMockConfigManager(createTwoWaves());

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      expect(ws.getTotalWaves()).toBe(-1);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple endless waves
  // -----------------------------------------------------------------------

  describe('multiple endless waves', () => {
    it('should enter ACTIVE state for the first endless wave', () => {
      const gameState = createEndlessGameState();
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];
      const config = createMockConfigManager(singleWave);

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete scripted wave 1. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Now in endless mode. Wave 2 should be procedurally generated. */
      expect(ws.isEndlessMode()).toBe(true);
      expect(ws.getCurrentWave()).toBe(2);
      expect(ws.getState()).toBe(WaveState.PREP);

      /* Start the first endless wave and verify it enters ACTIVE state. */
      ws.triggerEarlyStart();
      expect(ws.getState()).toBe(WaveState.ACTIVE);

      /* Verify enemies are spawned from the procedural wave. */
      ws.update(50000, 50000);
      expect(enemySystem.spawnEnemy).toHaveBeenCalled();

      /* Verify the wave system reports wave 2 as current. */
      expect(ws.getCurrentWave()).toBe(2);
    });

    it('should complete an endless wave when all enemies are resolved', () => {
      const gameState = createEndlessGameState();
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];
      const config = createMockConfigManager(singleWave);

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete scripted wave 1 to enter endless mode. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);
      expect(ws.isEndlessMode()).toBe(true);

      /* Start endless wave 2. */
      ws.triggerEarlyStart();
      ws.update(100000, 100000);

      /* Count how many spawns happened (that's the number we need to resolve). */
      const spawnCallsBeforeWave2 = 1; // Wave 1 had 1 enemy
      const totalSpawns = enemySystem.spawnEnemy.mock.calls.length;
      const wave2Spawns = totalSpawns - spawnCallsBeforeWave2;

      /* Resolve exactly the right number of enemies. */
      for (let i = 0; i < wave2Spawns; i++) {
        triggerEnemyDied(scene);
      }

      /* Process completion. */
      ws.update(200000, 100000);
      ws.update(300000, 100000);

      /* Should have completed wave 2 and moved to wave 3. */
      expect(gameState.highestWaveReached).toBeGreaterThanOrEqual(2);
      expect(ws.getCurrentWave()).toBeGreaterThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // CAMPAIGN_COMPLETE emitted only once
  // -----------------------------------------------------------------------

  describe('CAMPAIGN_COMPLETE emission', () => {
    it('should emit CAMPAIGN_COMPLETE exactly once', () => {
      const gameState = createEndlessGameState();
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];
      const config = createMockConfigManager(singleWave);

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete wave 1 -> transitions to endless. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Complete endless wave 2. */
      ws.triggerEarlyStart();
      ws.update(50000, 50000);
      for (let i = 0; i < 20; i++) triggerEnemyDied(scene);
      ws.update(60000, 10000);
      ws.update(70000, 10000);

      const emitCalls = scene.events.emit.mock.calls;
      const campaignCompleteCount = emitCalls.filter(
        (call: unknown[]) => call[0] === GAME_EVENTS.CAMPAIGN_COMPLETE,
      ).length;

      expect(campaignCompleteCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Wave started payload in endless mode
  // -----------------------------------------------------------------------

  describe('WAVE_STARTED payload in endless mode', () => {
    it('should report waveNumber in endless mode WAVE_STARTED events', () => {
      const gameState = createEndlessGameState();
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];
      const config = createMockConfigManager(singleWave);

      const ws = new WaveSystem(
        scene as unknown as Phaser.Scene,
        gameState,
        config as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(scene);

      /* Complete scripted wave 1. */
      ws.triggerEarlyStart();
      completeCurrentWave(ws, scene, 1);

      /* Start endless wave 2. */
      ws.triggerEarlyStart();

      /* Find the wave 2 WAVE_STARTED event. */
      const emitCalls = scene.events.emit.mock.calls;
      const waveStartedCalls = emitCalls.filter(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );

      /* There should be at least 2 WAVE_STARTED events (wave 1 + wave 2). */
      expect(waveStartedCalls.length).toBeGreaterThanOrEqual(2);

      const endlessPayload = waveStartedCalls[waveStartedCalls.length - 1]![1] as WaveStartedPayload;
      expect(endlessPayload.waveNumber).toBe(2);
    });
  });
});
