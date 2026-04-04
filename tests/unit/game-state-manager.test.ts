/**
 * Unit tests for GameStateManager (BOLT-009).
 *
 * Tests: objective HP decrement, defeat trigger, victory trigger,
 * pause toggle, escape priority chain, speed multiplier, session-best score.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Mock Phaser before importing system files -- Phaser requires browser APIs. */
vi.mock('phaser', () => {
  class MockRectangle {
    x: number; y: number; width: number; height: number;
    constructor(x = 0, y = 0, w = 0, h = 0) { this.x = x; this.y = y; this.width = w; this.height = h; }
    static Contains = vi.fn(() => true);
  }
  class MockPoint {
    x: number; y: number;
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  }
  return {
    default: {
      Scene: class {},
      GameObjects: { Sprite: class {}, Group: class {}, Container: class {}, Graphics: class {}, Text: class {} },
      Geom: { Rectangle: MockRectangle, Point: MockPoint },
      Math: { RandomDataGenerator: class {} },
      Time: { TimerEvent: class {} },
    },
  };
});

import { GameStateManager } from '../../src/systems/game-state-manager';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState } from '../../src/types/game-types';
import type {
  EnemyReachedObjectivePayload,
  AllWavesCompletedPayload,
  GameOverPayload,
  GamePausedPayload,
} from '../../src/types/events';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

type ListenerEntry = { event: string; callback: Function; context: unknown };

function createMockScene() {
  const listeners: ListenerEntry[] = [];
  const registryStore: Record<string, unknown> = {};

  return {
    events: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        listeners.push({ event, callback, context });
      }),
      off: vi.fn(),
      emit: vi.fn(),
    },
    registry: {
      get: vi.fn((key: string) => registryStore[key]),
      set: vi.fn((key: string, val: unknown) => { registryStore[key] = val; }),
      remove: vi.fn((key: string) => { delete registryStore[key]; }),
    },
    add: {
      graphics: vi.fn(() => ({
        fillStyle: vi.fn().mockReturnThis(),
        fillRect: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        lineBetween: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setInteractive: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        on: vi.fn(),
      })),
      text: vi.fn(() => ({
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setInteractive: vi.fn().mockReturnThis(),
        setColor: vi.fn().mockReturnThis(),
        setFontSize: vi.fn().mockReturnThis(),
        setText: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        on: vi.fn(),
      })),
      container: vi.fn(() => ({
        setDepth: vi.fn().mockReturnThis(),
        setSize: vi.fn().mockReturnThis(),
        setInteractive: vi.fn().mockReturnThis(),
        add: vi.fn(),
        addAt: vi.fn(),
        getAt: vi.fn(() => ({
          setFontSize: vi.fn().mockReturnThis(),
          setColor: vi.fn().mockReturnThis(),
        })),
        destroy: vi.fn(),
        on: vi.fn(),
      })),
    },
    time: {
      delayedCall: vi.fn((_delay: number, callback: Function) => {
        callback(); // Execute immediately for testing.
        return { destroy: vi.fn() };
      }),
    },
    scene: {
      start: vi.fn(),
    },
    _listeners: listeners,
    _registryStore: registryStore,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 150,
    score: 0,
    currentWave: 5,
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

/** Helper to fire an event by name, triggering the registered listener. */
function fireEvent(scene: ReturnType<typeof createMockScene>, event: string, payload?: unknown) {
  const entry = scene._listeners.find((l) => l.event === event);
  if (entry) {
    entry.callback.call(entry.context, payload);
  }
}

/** Mock EconomySystem for registry. */
function createMockEconomySystem(totalKills = 50, finalScore = 1000, wavesCompleted = 5) {
  return {
    getRunStats: () => ({ totalKills, finalScore, wavesCompleted }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameStateManager', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let gsm: GameStateManager;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createMockGameState();
    scene._registryStore['economySystem'] = createMockEconomySystem();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gsm = new GameStateManager(scene as any, gameState);
    gsm.init();
  });

  // --- Objective HP Decrement ---

  it('should decrement objective HP on ENEMY_REACHED_OBJECTIVE', () => {
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(gameState.objectiveHp).toBe(75);
  });

  it('should clamp objective HP to 0 (never negative)', () => {
    gameState.objectiveHp = 10;
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(gameState.objectiveHp).toBe(0);
  });

  it('should trigger defeat when HP reaches 0', () => {
    gameState.objectiveHp = 25;
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(gameState.isGameOver).toBe(true);
    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.GAME_OVER,
      expect.objectContaining({ victory: false }),
    );
  });

  it('should not process breakthrough after game over', () => {
    gameState.isGameOver = true;
    gameState.objectiveHp = 50;
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(gameState.objectiveHp).toBe(50); // Unchanged.
  });

  // --- Victory ---

  it('should trigger victory on ALL_WAVES_COMPLETED', () => {
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(gameState.isGameOver).toBe(true);
    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.GAME_OVER,
      expect.objectContaining({ victory: true }),
    );
  });

  it('should transition to GameOver scene on victory', () => {
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(scene.scene.start).toHaveBeenCalledWith(
      'GameOver',
      expect.objectContaining({ victory: true }),
    );
  });

  it('should transition to GameOver scene on defeat', () => {
    gameState.objectiveHp = 10;
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(scene.scene.start).toHaveBeenCalledWith(
      'GameOver',
      expect.objectContaining({ victory: false, objectiveHpRemaining: 0 }),
    );
  });

  // --- Pause ---

  it('should toggle pause state', () => {
    gsm.togglePause();
    expect(gameState.isPaused).toBe(true);
    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.GAME_PAUSED,
      expect.objectContaining({ paused: true }),
    );
  });

  it('should toggle pause off when called again', () => {
    gsm.togglePause(); // Pause on.
    gsm.togglePause(); // Pause off.
    expect(gameState.isPaused).toBe(false);
  });

  it('should not toggle pause when game is over', () => {
    gameState.isGameOver = true;
    gsm.togglePause();
    expect(gameState.isPaused).toBe(false);
  });

  // --- Speed Multiplier ---

  it('should initialize speed multiplier to 1', () => {
    expect(scene.registry.get('speedMultiplier')).toBe(1);
  });

  it('should toggle speed between 1 and 2', () => {
    gsm.toggleSpeed();
    expect(gsm.getSpeedMultiplier()).toBe(2);
    gsm.toggleSpeed();
    expect(gsm.getSpeedMultiplier()).toBe(1);
  });

  // --- Escape Priority Chain ---

  it('should resume game on INPUT_CANCEL when paused', () => {
    gsm.togglePause(); // Pause on.
    fireEvent(scene, GAME_EVENTS.INPUT_CANCEL);
    expect(gameState.isPaused).toBe(false);
  });

  it('should not toggle pause when placement mode is active', () => {
    scene._registryStore['towerPlacementSystem'] = { isInPlacementMode: () => true };
    fireEvent(scene, GAME_EVENTS.INPUT_CANCEL);
    expect(gameState.isPaused).toBe(false);
  });

  it('should not toggle pause when upgrade panel is open', () => {
    scene._registryStore['towerPlacementSystem'] = { isInPlacementMode: () => false };
    scene._registryStore['upgradeSystem'] = { isOpen: () => true };
    fireEvent(scene, GAME_EVENTS.INPUT_CANCEL);
    expect(gameState.isPaused).toBe(false);
  });

  it('should dismiss wave summary on INPUT_CANCEL when visible', () => {
    const dismissFn = vi.fn();
    scene._registryStore['towerPlacementSystem'] = { isInPlacementMode: () => false };
    scene._registryStore['upgradeSystem'] = { isOpen: () => false };
    scene._registryStore['hudSystem'] = {
      isWaveSummaryVisible: () => true,
      dismissWaveSummary: dismissFn,
    };
    fireEvent(scene, GAME_EVENTS.INPUT_CANCEL);
    expect(dismissFn).toHaveBeenCalled();
    expect(gameState.isPaused).toBe(false);
  });

  it('should toggle pause when nothing else is active', () => {
    scene._registryStore['towerPlacementSystem'] = { isInPlacementMode: () => false };
    scene._registryStore['upgradeSystem'] = { isOpen: () => false };
    scene._registryStore['hudSystem'] = {
      isWaveSummaryVisible: () => false,
      dismissWaveSummary: vi.fn(),
    };
    fireEvent(scene, GAME_EVENTS.INPUT_CANCEL);
    expect(gameState.isPaused).toBe(true);
  });

  // --- Session-Best Score ---

  it('should set session-best score on first run', () => {
    /* Uses default mock: score=1000. */
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(scene.registry.get('sessionBestScore')).toBe(1000);
  });

  it('should update session-best score when beaten', () => {
    scene._registryStore['sessionBestScore'] = 400;
    /* Default mock score=1000 > 400, so it should update. */
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(scene.registry.get('sessionBestScore')).toBe(1000);
  });

  it('should not update session-best score when not beaten', () => {
    scene._registryStore['sessionBestScore'] = 5000;
    /* Default mock score=1000 < 5000, so should NOT update. */
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(scene.registry.get('sessionBestScore')).toBe(5000);
  });

  // --- GameOverData ---

  it('should include totalKills and objectiveHpRemaining in GameOverData on defeat', () => {
    /* Uses default mock: totalKills=50, finalScore=1000, wavesCompleted=5. */
    gameState.objectiveHp = 5;
    const payload: EnemyReachedObjectivePayload = {
      enemyId: 'enemy-1', enemyType: 'tank', damage: 25,
    };
    fireEvent(scene, GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);
    expect(scene.scene.start).toHaveBeenCalledWith(
      'GameOver',
      expect.objectContaining({
        totalKills: 50,
        objectiveHpRemaining: 0,
        score: 1000,
      }),
    );
  });

  it('should include objectiveHpRemaining on victory', () => {
    /* Uses default mock: totalKills=50. */
    gameState.objectiveHp = 75;
    const payload: AllWavesCompletedPayload = { totalWaves: 20, timestamp: 60000 };
    fireEvent(scene, GAME_EVENTS.ALL_WAVES_COMPLETED, payload);
    expect(scene.scene.start).toHaveBeenCalledWith(
      'GameOver',
      expect.objectContaining({
        victory: true,
        objectiveHpRemaining: 75,
        totalKills: 50,
      }),
    );
  });

  // --- Cleanup ---

  it('should remove registry entries on destroy', () => {
    gsm.destroy();
    expect(scene.registry.remove).toHaveBeenCalledWith('gameStateManager');
    expect(scene.registry.remove).toHaveBeenCalledWith('speedMultiplier');
  });
});
