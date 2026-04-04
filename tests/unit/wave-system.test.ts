/**
 * Unit tests for WaveSystem.
 *
 * Tests state machine transitions, spawn queue processing, event emission,
 * early start behavior, game-over halt, pool exhaustion retry, upcoming
 * composition, and wave completion detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveSystem, WaveState } from '../../src/systems/wave-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState, WaveDefinition } from '../../src/types/game-types';
import type { WaveStartedPayload, WaveCompletedPayload, AllWavesCompletedPayload } from '../../src/types/events';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

/** Creates a mock Phaser scene with events, registry. */
function createMockScene() {
  const registryStore = new Map<string, unknown>();
  const eventListeners = new Map<string, Array<{ fn: Function; ctx: unknown }>>();

  return {
    events: {
      on: vi.fn((event: string, fn: Function, ctx: unknown) => {
        if (!eventListeners.has(event)) {
          eventListeners.set(event, []);
        }
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
    gameMode: 'stage',
    highestWaveReached: 0,
    campaignComplete: false,
  };
}

/** Creates a mock ConfigManager that returns the provided wave definitions. */
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

/** Creates a mock EnemySystem that tracks spawn calls. */
function createMockEnemySystem(poolExhausted = false) {
  let spawnCount = 0;
  return {
    spawnEnemy: vi.fn((archetypeId: string, _waveNumber: number) => {
      if (poolExhausted) return null;
      spawnCount++;
      return { instanceId: `enemy-${spawnCount}`, definition: { id: archetypeId } };
    }),
    getActiveEnemies: vi.fn(() => []),
    _getSpawnCount: () => spawnCount,
  };
}

/** Simple 3-wave test dataset. */
function createTestWaves(): WaveDefinition[] {
  return [
    {
      waveNumber: 1,
      groups: [{ enemyId: 'runner', count: 3, spawnIntervalMs: 500, delayMs: 0 }],
      prepTimeMs: 5000,
      isBossWave: false,
    },
    {
      waveNumber: 2,
      groups: [
        { enemyId: 'runner', count: 2, spawnIntervalMs: 500, delayMs: 0 },
        { enemyId: 'tank', count: 1, spawnIntervalMs: 1000, delayMs: 1000 },
      ],
      prepTimeMs: 8000,
      isBossWave: false,
    },
    {
      waveNumber: 3,
      groups: [{ enemyId: 'tank', count: 2, spawnIntervalMs: 1000, delayMs: 0 }],
      prepTimeMs: 10000,
      isBossWave: true,
    },
  ];
}

/** Triggers the MAP_READY listener on the wave system by simulating the event. */
function triggerMapReady(scene: ReturnType<typeof createMockScene>) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.MAP_READY);
  if (listeners) {
    for (const { fn, ctx } of listeners) {
      fn.call(ctx);
    }
  }
}

/** Triggers the ENEMY_DIED listener. */
function triggerEnemyDied(scene: ReturnType<typeof createMockScene>) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.ENEMY_DIED);
  if (listeners) {
    for (const { fn, ctx } of listeners) {
      fn.call(ctx, { enemyId: 'e', enemyType: 'runner', position: { x: 0, y: 0 }, reward: 5, scoreReward: 10 });
    }
  }
}

/** Triggers the ENEMY_REACHED_OBJECTIVE listener. */
function triggerEnemyBreakthrough(scene: ReturnType<typeof createMockScene>) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.ENEMY_REACHED_OBJECTIVE);
  if (listeners) {
    for (const { fn, ctx } of listeners) {
      fn.call(ctx, { enemyId: 'e', enemyType: 'runner', damage: 10 });
    }
  }
}

/** Triggers the GAME_OVER listener. */
function triggerGameOver(scene: ReturnType<typeof createMockScene>, victory = false) {
  const listeners = scene._eventListeners.get(GAME_EVENTS.GAME_OVER);
  if (listeners) {
    for (const { fn, ctx } of listeners) {
      fn.call(ctx, { victory, finalScore: 0, wavesCompleted: 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WaveSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let enemySystem: ReturnType<typeof createMockEnemySystem>;
  let waveSystem: WaveSystem;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createMockGameState();
    configManager = createMockConfigManager(createTestWaves());
    enemySystem = createMockEnemySystem();

    /* Store enemySystem on registry before init (simulating Gameplay.ts setup). */
    scene._registryStore.set('enemySystem', enemySystem);

    waveSystem = new WaveSystem(
      scene as unknown as Phaser.Scene,
      gameState,
      configManager as unknown as import('../../src/utils/config-manager').ConfigManager,
    );
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('should start in IDLE state', () => {
      waveSystem.init();
      expect(waveSystem.getState()).toBe(WaveState.IDLE);
    });

    it('should register event listeners for MAP_READY, ENEMY_DIED, ENEMY_REACHED_OBJECTIVE, GAME_OVER', () => {
      waveSystem.init();

      const registeredEvents = scene.events.on.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain(GAME_EVENTS.MAP_READY);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_DIED);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_REACHED_OBJECTIVE);
      expect(registeredEvents).toContain(GAME_EVENTS.GAME_OVER);
    });

    it('should store itself on registry under waveSystem', () => {
      waveSystem.init();
      expect(scene.registry.set).toHaveBeenCalledWith('waveSystem', waveSystem);
    });

    it('should read waves from ConfigManager', () => {
      waveSystem.init();
      expect(configManager.getWaves).toHaveBeenCalledOnce();
    });

    it('should return 0 for getCurrentWave before MAP_READY', () => {
      waveSystem.init();
      expect(waveSystem.getCurrentWave()).toBe(0);
    });

    it('should return total waves from config', () => {
      waveSystem.init();
      expect(waveSystem.getTotalWaves()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // MAP_READY -> PREP transition
  // -------------------------------------------------------------------------

  describe('MAP_READY -> PREP', () => {
    it('should transition to PREP state on MAP_READY', () => {
      waveSystem.init();
      triggerMapReady(scene);
      expect(waveSystem.getState()).toBe(WaveState.PREP);
    });

    it('should set wave to 1 after MAP_READY', () => {
      waveSystem.init();
      triggerMapReady(scene);
      expect(waveSystem.getCurrentWave()).toBe(1);
    });

    it('should set prep time from wave definition', () => {
      waveSystem.init();
      triggerMapReady(scene);
      expect(waveSystem.getPrepTimeRemaining()).toBe(5000);
    });

    it('should handle defensive init check when mapData already on registry', () => {
      scene._registryStore.set('mapData', { getWaypoints: () => [] });
      waveSystem.init();
      /* mapData was on registry at init time, so MAP_READY logic runs immediately. */
      expect(waveSystem.getState()).toBe(WaveState.PREP);
    });
  });

  // -------------------------------------------------------------------------
  // PREP countdown
  // -------------------------------------------------------------------------

  describe('PREP countdown', () => {
    beforeEach(() => {
      waveSystem.init();
      triggerMapReady(scene);
    });

    it('should decrement prep time on update', () => {
      waveSystem.update(1000, 1000);
      expect(waveSystem.getPrepTimeRemaining()).toBe(4000);
    });

    it('should transition to ACTIVE when prep countdown expires', () => {
      /* Consume all 5000ms of prep time. */
      waveSystem.update(5000, 5000);
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);
    });

    it('should emit WAVE_STARTED when transitioning to ACTIVE', () => {
      waveSystem.update(5000, 5000);

      const emitCalls = scene.events.emit.mock.calls;
      const waveStartedCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      expect(waveStartedCall).toBeDefined();

      const payload = waveStartedCall![1] as WaveStartedPayload;
      expect(payload.waveNumber).toBe(1);
      expect(payload.totalWaves).toBe(3);
      expect(payload.isBossWave).toBe(false);
      expect(payload.earlyStart).toBe(false);
    });

    it('should return 0 for prep time when not in PREP state', () => {
      waveSystem.update(5000, 5000);
      expect(waveSystem.getPrepTimeRemaining()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Early start
  // -------------------------------------------------------------------------

  describe('triggerEarlyStart', () => {
    beforeEach(() => {
      waveSystem.init();
      triggerMapReady(scene);
    });

    it('should transition from PREP to ACTIVE immediately', () => {
      waveSystem.triggerEarlyStart();
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);
    });

    it('should set earlyStart flag in WAVE_STARTED payload', () => {
      waveSystem.triggerEarlyStart();

      const emitCalls = scene.events.emit.mock.calls;
      const waveStartedCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      const payload = waveStartedCall![1] as WaveStartedPayload;
      expect(payload.earlyStart).toBe(true);
    });

    it('should be a no-op when not in PREP state', () => {
      /* Transition to ACTIVE first. */
      waveSystem.update(5000, 5000);
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);

      /* Calling triggerEarlyStart in ACTIVE should do nothing. */
      waveSystem.triggerEarlyStart();
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);
    });

    it('should be a no-op when in IDLE state', () => {
      /* Before MAP_READY, system is IDLE via a fresh instance. */
      const freshScene = createMockScene();
      freshScene._registryStore.set('enemySystem', enemySystem);
      const freshWave = new WaveSystem(
        freshScene as unknown as Phaser.Scene,
        gameState,
        configManager as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      freshWave.init();

      freshWave.triggerEarlyStart();
      expect(freshWave.getState()).toBe(WaveState.IDLE);
    });
  });

  // -------------------------------------------------------------------------
  // ACTIVE spawning
  // -------------------------------------------------------------------------

  describe('ACTIVE spawning', () => {
    beforeEach(() => {
      waveSystem.init();
      triggerMapReady(scene);
      /* Skip prep. */
      waveSystem.triggerEarlyStart();
    });

    it('should spawn enemies via EnemySystem.spawnEnemy', () => {
      /* Wave 1: 3 runners at 500ms interval. First spawns immediately. */
      waveSystem.update(500, 500);
      expect(enemySystem.spawnEnemy).toHaveBeenCalled();
      expect(enemySystem.spawnEnemy.mock.calls[0]![0]).toBe('runner');
      expect(enemySystem.spawnEnemy.mock.calls[0]![1]).toBe(1);
    });

    it('should pass correct wave number to spawnEnemy', () => {
      waveSystem.update(500, 500);
      const waveNumberArg = enemySystem.spawnEnemy.mock.calls[0]![1];
      expect(waveNumberArg).toBe(1);
    });

    it('should spawn all enemies in the wave over time', () => {
      /* 3 runners at 500ms interval. Need 3 intervals total. */
      waveSystem.update(500, 500);   // 1st spawn
      waveSystem.update(1000, 500);  // 2nd spawn
      waveSystem.update(1500, 500);  // 3rd spawn
      expect(enemySystem.spawnEnemy).toHaveBeenCalledTimes(3);
    });

    it('should not spawn more enemies than defined in the group', () => {
      /* Simulate enough time for 10 spawns, but only 3 exist in wave. */
      waveSystem.update(5000, 5000);
      expect(enemySystem.spawnEnemy).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // Pool exhaustion retry
  // -------------------------------------------------------------------------

  describe('pool exhaustion', () => {
    it('should retry spawn on next frame when pool is exhausted', () => {
      const exhaustedEnemy = createMockEnemySystem(true);
      const freshScene = createMockScene();
      freshScene._registryStore.set('enemySystem', exhaustedEnemy);

      const freshWave = new WaveSystem(
        freshScene as unknown as Phaser.Scene,
        gameState,
        configManager as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      freshWave.init();
      triggerMapReady(freshScene);
      freshWave.triggerEarlyStart();

      /* First frame: spawnEnemy returns null. */
      freshWave.update(500, 500);
      expect(exhaustedEnemy.spawnEnemy).toHaveBeenCalled();

      /* Count should be 0 spawned since all returned null. Wave should NOT complete. */
      expect(freshWave.getState()).toBe(WaveState.ACTIVE);
    });
  });

  // -------------------------------------------------------------------------
  // Wave completion
  // -------------------------------------------------------------------------

  describe('wave completion', () => {
    beforeEach(() => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();
    });

    it('should transition to COMPLETE when all enemies spawned and resolved', () => {
      /* Spawn all 3 enemies. */
      waveSystem.update(500, 500);
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);

      /* Resolve all 3 enemies (simulate ENEMY_DIED events). */
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);

      /* Next update should detect completion. */
      waveSystem.update(2000, 500);
      expect(waveSystem.getState()).not.toBe(WaveState.ACTIVE);
    });

    it('should count breakthroughs toward completion', () => {
      /* Spawn all 3 enemies. */
      waveSystem.update(500, 500);
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);

      /* Mix of deaths and breakthroughs. */
      triggerEnemyDied(scene);
      triggerEnemyBreakthrough(scene);
      triggerEnemyDied(scene);

      waveSystem.update(2000, 500);
      expect(waveSystem.getState()).not.toBe(WaveState.ACTIVE);
    });

    it('should not complete if enemies still unspawned', () => {
      /* Only spawn 1 of 3 enemies. */
      waveSystem.update(500, 500);

      /* Resolve that 1 enemy. */
      triggerEnemyDied(scene);

      waveSystem.update(600, 100);
      /* Still ACTIVE because 2 more enemies need to spawn. */
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);
    });

    it('should not complete if spawned enemies still alive', () => {
      /* Spawn all 3 enemies. */
      waveSystem.update(500, 500);
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);

      /* Only resolve 2 of 3. */
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);

      waveSystem.update(2000, 500);
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);
    });

    it('should emit WAVE_COMPLETED on completion', () => {
      /* Spawn and resolve all enemies. */
      waveSystem.update(500, 500);
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);

      /* Transition to COMPLETE. */
      waveSystem.update(2000, 500);

      /* COMPLETE state processes in the next update. */
      waveSystem.update(2500, 500);

      const emitCalls = scene.events.emit.mock.calls;
      const completedCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_COMPLETED,
      );
      expect(completedCall).toBeDefined();

      const payload = completedCall![1] as WaveCompletedPayload;
      expect(payload.waveNumber).toBe(1);
      expect(payload.totalWaves).toBe(3);
      expect(payload.earlyStart).toBe(true);
      expect(typeof payload.timestamp).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-wave progression
  // -------------------------------------------------------------------------

  describe('wave progression', () => {
    it('should advance to PREP for the next wave after completion', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();

      /* Complete wave 1: spawn 3, resolve 3. */
      waveSystem.update(500, 500);
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);
      triggerEnemyDied(scene);

      /* Detect completion and process COMPLETE state. */
      waveSystem.update(2000, 500);
      waveSystem.update(2500, 500);

      /* Should now be in PREP for wave 2. */
      expect(waveSystem.getState()).toBe(WaveState.PREP);
      expect(waveSystem.getCurrentWave()).toBe(2);
      expect(waveSystem.getPrepTimeRemaining()).toBe(8000);
    });
  });

  // -------------------------------------------------------------------------
  // Final wave -> ALL_WAVES_COMPLETED
  // -------------------------------------------------------------------------

  describe('all waves completed', () => {
    it('should emit ALL_WAVES_COMPLETED after the final wave and go IDLE', () => {
      /* Use a single-wave config so we can complete the run quickly. */
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];

      const singleScene = createMockScene();
      singleScene._registryStore.set('enemySystem', enemySystem);
      const singleConfig = createMockConfigManager(singleWave);

      const ws = new WaveSystem(
        singleScene as unknown as Phaser.Scene,
        createMockGameState(),
        singleConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(singleScene);
      ws.triggerEarlyStart();

      /* Spawn and resolve the single enemy. */
      ws.update(500, 500);
      triggerEnemyDied(singleScene);

      /* Detect completion, process COMPLETE. */
      ws.update(1000, 500);
      ws.update(1500, 500);

      const emitCalls = singleScene.events.emit.mock.calls;
      const allComplete = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.ALL_WAVES_COMPLETED,
      );
      expect(allComplete).toBeDefined();

      const payload = allComplete![1] as AllWavesCompletedPayload;
      expect(payload.totalWaves).toBe(1);
      expect(typeof payload.timestamp).toBe('number');

      expect(ws.getState()).toBe(WaveState.IDLE);
    });
  });

  // -------------------------------------------------------------------------
  // GAME_OVER halt
  // -------------------------------------------------------------------------

  describe('GAME_OVER handling', () => {
    it('should transition to IDLE on GAME_OVER during PREP', () => {
      waveSystem.init();
      triggerMapReady(scene);
      expect(waveSystem.getState()).toBe(WaveState.PREP);

      triggerGameOver(scene);
      expect(waveSystem.getState()).toBe(WaveState.IDLE);
    });

    it('should transition to IDLE on GAME_OVER during ACTIVE', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();
      expect(waveSystem.getState()).toBe(WaveState.ACTIVE);

      triggerGameOver(scene);
      expect(waveSystem.getState()).toBe(WaveState.IDLE);
    });

    it('should stop spawning after GAME_OVER', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();

      /* Spawn 1 enemy. */
      waveSystem.update(500, 500);
      const spawnsBefore = enemySystem.spawnEnemy.mock.calls.length;

      /* Game over. */
      triggerGameOver(scene);

      /* Further updates should not spawn anything. */
      waveSystem.update(1000, 500);
      waveSystem.update(1500, 500);
      expect(enemySystem.spawnEnemy.mock.calls.length).toBe(spawnsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Upcoming composition
  // -------------------------------------------------------------------------

  describe('getUpcomingComposition', () => {
    it('should return wave 1 composition during PREP before wave 1', () => {
      waveSystem.init();
      triggerMapReady(scene);
      const comp = waveSystem.getUpcomingComposition();
      expect(comp).toEqual([{ enemyId: 'runner', count: 3 }]);
    });

    it('should return wave 2 composition during ACTIVE wave 1', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();

      const comp = waveSystem.getUpcomingComposition();
      /* Wave 2: runner/2 + tank/1. */
      expect(comp).toEqual([
        { enemyId: 'runner', count: 2 },
        { enemyId: 'tank', count: 1 },
      ]);
    });

    it('should return empty array when on final wave during ACTIVE', () => {
      /* Use single-wave config. */
      const singleScene = createMockScene();
      singleScene._registryStore.set('enemySystem', enemySystem);
      const singleConfig = createMockConfigManager([createTestWaves()[0]!]);
      const ws = new WaveSystem(
        singleScene as unknown as Phaser.Scene,
        createMockGameState(),
        singleConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(singleScene);
      ws.triggerEarlyStart();

      expect(ws.getUpcomingComposition()).toEqual([]);
    });

    it('should return empty array in IDLE state', () => {
      waveSystem.init();
      expect(waveSystem.getUpcomingComposition()).toEqual([]);
    });

    it('should merge groups with the same enemyId', () => {
      /* Create a wave where runner appears in two groups. */
      const mergeWaves: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [
            { enemyId: 'runner', count: 5, spawnIntervalMs: 500, delayMs: 0 },
            { enemyId: 'tank', count: 3, spawnIntervalMs: 1000, delayMs: 1000 },
            { enemyId: 'runner', count: 2, spawnIntervalMs: 500, delayMs: 2000 },
          ],
          prepTimeMs: 5000,
          isBossWave: false,
        },
      ];

      const mergeScene = createMockScene();
      mergeScene._registryStore.set('enemySystem', enemySystem);
      const mergeConfig = createMockConfigManager(mergeWaves);
      const ws = new WaveSystem(
        mergeScene as unknown as Phaser.Scene,
        createMockGameState(),
        mergeConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(mergeScene);

      /* During PREP for wave 1, upcoming = wave 1 composition. */
      const comp = ws.getUpcomingComposition();
      expect(comp).toEqual([
        { enemyId: 'runner', count: 7 },
        { enemyId: 'tank', count: 3 },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Boss wave flag
  // -------------------------------------------------------------------------

  describe('boss wave flag', () => {
    it('should include isBossWave=true in WAVE_STARTED for boss waves', () => {
      /* Wave 3 is the boss wave in our test data. We need to reach it. */
      const bossWaves: WaveDefinition[] = [
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
          isBossWave: true,
        },
      ];

      const bossScene = createMockScene();
      bossScene._registryStore.set('enemySystem', enemySystem);
      const bossConfig = createMockConfigManager(bossWaves);
      const ws = new WaveSystem(
        bossScene as unknown as Phaser.Scene,
        createMockGameState(),
        bossConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(bossScene);

      /* Complete wave 1 quickly. */
      ws.triggerEarlyStart();
      ws.update(500, 500);
      triggerEnemyDied(bossScene);
      ws.update(1000, 500);
      ws.update(1500, 500);

      /* Now in PREP for wave 2. Start it. */
      ws.triggerEarlyStart();

      const emitCalls = bossScene.events.emit.mock.calls;
      const wave2Start = emitCalls.filter(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      /* Second WAVE_STARTED should be for wave 2 (boss). */
      const bossPayload = wave2Start[1]![1] as WaveStartedPayload;
      expect(bossPayload.waveNumber).toBe(2);
      expect(bossPayload.isBossWave).toBe(true);
    });

    it('should include isBossWave=false for non-boss waves', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();

      const emitCalls = scene.events.emit.mock.calls;
      const startCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      const payload = startCall![1] as WaveStartedPayload;
      expect(payload.isBossWave).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Delayed groups
  // -------------------------------------------------------------------------

  describe('delayed groups', () => {
    it('should not spawn delayed group until delayMs elapses', () => {
      /* Use wave 2 which has a delayed tank group at 1000ms. */
      const delayWaves: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [
            { enemyId: 'runner', count: 2, spawnIntervalMs: 500, delayMs: 0 },
            { enemyId: 'tank', count: 1, spawnIntervalMs: 1000, delayMs: 2000 },
          ],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];

      const delayScene = createMockScene();
      const delayEnemy = createMockEnemySystem();
      delayScene._registryStore.set('enemySystem', delayEnemy);
      const delayConfig = createMockConfigManager(delayWaves);

      const ws = new WaveSystem(
        delayScene as unknown as Phaser.Scene,
        createMockGameState(),
        delayConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(delayScene);
      ws.triggerEarlyStart();

      /* After 500ms, only runners should have spawned. */
      ws.update(500, 500);
      const callsAt500 = delayEnemy.spawnEnemy.mock.calls;
      const tankCallsBefore = callsAt500.filter((c: unknown[]) => c[0] === 'tank');
      expect(tankCallsBefore.length).toBe(0);

      /* After 2500ms (past the 2000ms delay), tanks should start. */
      ws.update(1000, 500);
      ws.update(1500, 500);
      ws.update(2000, 500);
      ws.update(2500, 500);
      ws.update(3000, 500);
      const allCalls = delayEnemy.spawnEnemy.mock.calls;
      const tankCalls = allCalls.filter((c: unknown[]) => c[0] === 'tank');
      expect(tankCalls.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('should remove waveSystem from registry', () => {
      waveSystem.init();
      waveSystem.destroy();
      expect(scene.registry.remove).toHaveBeenCalledWith('waveSystem');
    });
  });

  // -------------------------------------------------------------------------
  // Endless mode stub
  // -------------------------------------------------------------------------

  describe('generateEndlessWave', () => {
    it('should throw when endless config is not loaded', () => {
      waveSystem.init();
      expect(() => waveSystem.generateEndlessWave(21)).toThrow(
        'Endless mode config not loaded',
      );
    });
  });

  // -------------------------------------------------------------------------
  // WAVE_STARTED upcoming composition for next wave
  // -------------------------------------------------------------------------

  describe('WAVE_STARTED upcomingComposition', () => {
    it('should include wave 2 composition in wave 1 WAVE_STARTED payload', () => {
      waveSystem.init();
      triggerMapReady(scene);
      waveSystem.triggerEarlyStart();

      const emitCalls = scene.events.emit.mock.calls;
      const startCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      const payload = startCall![1] as WaveStartedPayload;
      /* Wave 2: runner/2 + tank/1. */
      expect(payload.upcomingComposition).toEqual([
        { enemyId: 'runner', count: 2 },
        { enemyId: 'tank', count: 1 },
      ]);
    });

    it('should include empty array for final wave WAVE_STARTED payload', () => {
      const singleWave: WaveDefinition[] = [
        {
          waveNumber: 1,
          groups: [{ enemyId: 'runner', count: 1, spawnIntervalMs: 500, delayMs: 0 }],
          prepTimeMs: 1000,
          isBossWave: false,
        },
      ];
      const singleScene = createMockScene();
      singleScene._registryStore.set('enemySystem', enemySystem);
      const singleConfig = createMockConfigManager(singleWave);
      const ws = new WaveSystem(
        singleScene as unknown as Phaser.Scene,
        createMockGameState(),
        singleConfig as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      ws.init();
      triggerMapReady(singleScene);
      ws.triggerEarlyStart();

      const emitCalls = singleScene.events.emit.mock.calls;
      const startCall = emitCalls.find(
        (call: unknown[]) => call[0] === GAME_EVENTS.WAVE_STARTED,
      );
      const payload = startCall![1] as WaveStartedPayload;
      expect(payload.upcomingComposition).toEqual([]);
    });
  });
});
