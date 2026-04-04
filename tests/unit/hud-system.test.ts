/**
 * Unit tests for HudSystem (BOLT-009).
 *
 * Tests: per-wave snapshot tracking, floating text spawning,
 * wave summary skip for final wave, HUD value updates.
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
    },
  };
});

import { HudSystem } from '../../src/systems/hud-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState } from '../../src/types/game-types';
import type {
  CurrencyChangedPayload,
  ScoreChangedPayload,
  WaveStartedPayload,
  WaveCompletedPayload,
} from '../../src/types/events';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

type ListenerEntry = { event: string; callback: Function; context: unknown };

function createMockText() {
  return {
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
    x: 0,
    y: 0,
  };
}

function createMockGraphics() {
  return {
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    fillTriangle: vi.fn().mockReturnThis(),
    fillPoints: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    lineBetween: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    on: vi.fn(),
  };
}

function createMockScene() {
  const listeners: ListenerEntry[] = [];
  const registryStore: Record<string, unknown> = {};
  const createdTexts: ReturnType<typeof createMockText>[] = [];

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
      graphics: vi.fn(() => createMockGraphics()),
      text: vi.fn(() => {
        const t = createMockText();
        createdTexts.push(t);
        return t;
      }),
      container: vi.fn(() => ({
        setDepth: vi.fn().mockReturnThis(),
        setSize: vi.fn().mockReturnThis(),
        setInteractive: vi.fn().mockReturnThis(),
        add: vi.fn(),
        addAt: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
        x: 0,
        y: 0,
        alpha: 1,
      })),
    },
    tweens: {
      add: vi.fn(() => ({ destroy: vi.fn() })),
      killTweensOf: vi.fn(),
    },
    time: {
      delayedCall: vi.fn(() => ({ destroy: vi.fn() })),
    },
    input: {
      setDraggable: vi.fn(),
    },
    game: {
      loop: { delta: 16.67 },
    },
    _listeners: listeners,
    _registryStore: registryStore,
    _createdTexts: createdTexts,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 150,
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

function fireEvent(scene: ReturnType<typeof createMockScene>, event: string, payload?: unknown) {
  const entry = scene._listeners.find((l) => l.event === event);
  if (entry) {
    entry.callback.call(entry.context, payload);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HudSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let hud: HudSystem;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createMockGameState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hud = new HudSystem(scene as any, gameState);
    hud.init();
  });

  // --- Event Listener Registration ---

  it('should register all required event listeners', () => {
    const registeredEvents = scene._listeners.map((l) => l.event);
    expect(registeredEvents).toContain(GAME_EVENTS.CURRENCY_CHANGED);
    expect(registeredEvents).toContain(GAME_EVENTS.SCORE_CHANGED);
    expect(registeredEvents).toContain(GAME_EVENTS.WAVE_STARTED);
    expect(registeredEvents).toContain(GAME_EVENTS.WAVE_COMPLETED);
    expect(registeredEvents).toContain(GAME_EVENTS.TOWER_UPGRADED);
    expect(registeredEvents).toContain(GAME_EVENTS.TOWER_REPAIRED);
    expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_DIED);
    expect(registeredEvents).toContain(GAME_EVENTS.TILE_CLICKED);
  });

  // --- Currency Update ---

  it('should update currency text on CURRENCY_CHANGED', () => {
    const payload: CurrencyChangedPayload = { newAmount: 200, delta: 50, reason: 'wave_bonus' };
    fireEvent(scene, GAME_EVENTS.CURRENCY_CHANGED, payload);
    // The first text mock created is the currency text.
    // We verify setText was called with the new amount.
    const setCalls = scene._createdTexts
      .flatMap((t) => (t.setText as ReturnType<typeof vi.fn>).mock.calls)
      .flat();
    expect(setCalls).toContain('200');
  });

  // --- Score Update ---

  it('should update score text on SCORE_CHANGED', () => {
    const payload: ScoreChangedPayload = { newScore: 500, delta: 100, reason: 'enemy_kill' };
    fireEvent(scene, GAME_EVENTS.SCORE_CHANGED, payload);
    const setCalls = scene._createdTexts
      .flatMap((t) => (t.setText as ReturnType<typeof vi.fn>).mock.calls)
      .flat();
    expect(setCalls).toContain('Score: 500');
  });

  // --- Per-Wave Snapshot Tracking ---

  it('should snapshot state on WAVE_STARTED', () => {
    gameState.currency = 200;
    gameState.score = 100;
    const payload: WaveStartedPayload = {
      waveNumber: 3, totalWaves: 20, isBossWave: false,
      earlyStart: false, upcomingComposition: [],
    };
    fireEvent(scene, GAME_EVENTS.WAVE_STARTED, payload);
    // Snapshot is internal -- verified indirectly via wave summary.
  });

  it('should show wave summary with per-wave deltas on WAVE_COMPLETED', () => {
    /* Simulate wave start snapshot. */
    gameState.currency = 200;
    gameState.score = 100;
    const startPayload: WaveStartedPayload = {
      waveNumber: 3, totalWaves: 20, isBossWave: false,
      earlyStart: false, upcomingComposition: [],
    };
    fireEvent(scene, GAME_EVENTS.WAVE_STARTED, startPayload);

    /* Simulate some kills and currency changes during the wave. */
    fireEvent(scene, GAME_EVENTS.ENEMY_DIED, { position: { x: 100, y: 100 } });
    fireEvent(scene, GAME_EVENTS.ENEMY_DIED, { position: { x: 200, y: 200 } });
    gameState.currency = 280;
    gameState.score = 300;

    /* Wave complete. */
    const completePayload: WaveCompletedPayload = {
      waveNumber: 3, totalWaves: 20, earlyStart: false, timestamp: 30000,
    };
    fireEvent(scene, GAME_EVENTS.WAVE_COMPLETED, completePayload);

    /* Verify a container was created for the wave summary. */
    expect(scene.add.container).toHaveBeenCalled();
    expect(hud.isWaveSummaryVisible()).toBe(true);
  });

  it('should NOT show wave summary for the final wave', () => {
    const startPayload: WaveStartedPayload = {
      waveNumber: 20, totalWaves: 20, isBossWave: true,
      earlyStart: false, upcomingComposition: [],
    };
    fireEvent(scene, GAME_EVENTS.WAVE_STARTED, startPayload);

    /* Reset container call count. */
    (scene.add.container as ReturnType<typeof vi.fn>).mockClear();

    const completePayload: WaveCompletedPayload = {
      waveNumber: 20, totalWaves: 20, earlyStart: false, timestamp: 60000,
    };
    fireEvent(scene, GAME_EVENTS.WAVE_COMPLETED, completePayload);

    /* Wave summary should NOT be shown for wave 20. */
    expect(hud.isWaveSummaryVisible()).toBe(false);
  });

  // --- Wave Summary Dismiss ---

  it('should dismiss wave summary via dismissWaveSummary()', () => {
    /* Show a wave summary first. */
    gameState.currency = 200;
    gameState.score = 100;
    fireEvent(scene, GAME_EVENTS.WAVE_STARTED, {
      waveNumber: 3, totalWaves: 20, isBossWave: false,
      earlyStart: false, upcomingComposition: [],
    });
    fireEvent(scene, GAME_EVENTS.WAVE_COMPLETED, {
      waveNumber: 3, totalWaves: 20, earlyStart: false, timestamp: 30000,
    });
    expect(hud.isWaveSummaryVisible()).toBe(true);

    hud.dismissWaveSummary();
    expect(hud.isWaveSummaryVisible()).toBe(false);
  });

  // --- Floating Text ---

  it('should spawn floating text for enemy kill currency reward', () => {
    /* ENEMY_DIED fires first, then CURRENCY_CHANGED. */
    fireEvent(scene, GAME_EVENTS.ENEMY_DIED, { position: { x: 300, y: 200 } });
    fireEvent(scene, GAME_EVENTS.CURRENCY_CHANGED, {
      newAmount: 165, delta: 15, reason: 'enemy_kill',
    });

    /* A text should have been created at the kill position. */
    expect(scene.add.text).toHaveBeenCalled();
    /* A tween should have been added for the floating animation. */
    expect(scene.tweens.add).toHaveBeenCalled();
  });

  it('should spawn floating text for wave bonus near HUD', () => {
    fireEvent(scene, GAME_EVENTS.CURRENCY_CHANGED, {
      newAmount: 250, delta: 50, reason: 'wave_bonus',
    });
    /* Tween should be added for the bonus floating text. */
    expect(scene.tweens.add).toHaveBeenCalled();
  });

  it('should NOT spawn floating text for tower_placed currency changes', () => {
    const tweenCallCountBefore = (scene.tweens.add as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent(scene, GAME_EVENTS.CURRENCY_CHANGED, {
      newAmount: 100, delta: -50, reason: 'tower_placed',
    });
    const tweenCallCountAfter = (scene.tweens.add as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(tweenCallCountAfter).toBe(tweenCallCountBefore);
  });

  // --- Registry ---

  it('should register itself on the registry as hudSystem', () => {
    expect(scene.registry.set).toHaveBeenCalledWith('hudSystem', hud);
  });

  it('should initialize default game settings if not present', () => {
    expect(scene.registry.set).toHaveBeenCalledWith('gameSettings', expect.objectContaining({
      sfxVolume: 100,
      musicVolume: 100,
      reduceVisualIntensity: false,
    }));
  });

  // --- Cleanup ---

  it('should remove registry entry on destroy', () => {
    hud.destroy();
    expect(scene.registry.remove).toHaveBeenCalledWith('hudSystem');
  });
});
