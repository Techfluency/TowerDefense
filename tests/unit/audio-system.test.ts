/**
 * Unit tests for AudioSystem.
 *
 * Tests event-to-SFX mapping, low-HP alert logic, music lifecycle,
 * and destroy cleanup. Uses a mock scene with mock sound manager
 * to verify the correct SFX plays for each game event.
 *
 * BOLT-015 implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Mock Phaser before importing source files -- Phaser requires browser APIs. */
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class {},
      GameObjects: {
        Sprite: class {},
        Group: class {},
        Container: class {},
        Graphics: class {},
        Text: class {},
      },
      Math: {
        Angle: { RotateTo: vi.fn() },
        RandomDataGenerator: class {},
      },
      Geom: { Rectangle: class {}, Point: class {} },
      Time: { TimerEvent: class {} },
    },
  };
});

import { AudioSystem } from '../../src/systems/audio-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState } from '../../src/types/game-types';
import { SFX_KEYS, MUSIC_KEYS, LOW_HP_ALERT_THRESHOLD } from '../../src/config/audio-config';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockScene() {
  /** Accumulated event handlers from scene.events.on() calls. */
  const eventHandlers = new Map<string, { callback: (...args: unknown[]) => void; context: unknown }[]>();

  /** Tracks all sounds that were played. */
  const playedSounds: { key: string; config?: Record<string, unknown> }[] = [];
  const audioCache = new Set<string>();

  const soundStore = new Map<string, {
    volume: number;
    loop: boolean;
    destroyed: boolean;
    setVolume: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>();

  const scene = {
    events: {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void, context: unknown) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)!.push({ callback, context });
      }),
      off: vi.fn(),
      emit: vi.fn((event: string, ...args: unknown[]) => {
        const handlers = eventHandlers.get(event) ?? [];
        for (const h of handlers) {
          h.callback.call(h.context, ...args);
        }
      }),
    },
    registry: {
      get: vi.fn((key: string) => {
        if (key === 'gameSettings') {
          return { sfxVolume: 100, musicVolume: 100, reduceVisualIntensity: false };
        }
        return undefined;
      }),
    },
    sound: {
      play: vi.fn((key: string, config?: Record<string, unknown>) => {
        playedSounds.push({ key, config });
        const s = {
          volume: (config?.volume as number) ?? 1,
          loop: (config?.loop as boolean) ?? false,
          destroyed: false,
          setVolume: vi.fn((v: number) => { s.volume = v; }),
          destroy: vi.fn(() => { s.destroyed = true; }),
        };
        soundStore.set(key, s);
      }),
      get: vi.fn((key: string) => soundStore.get(key) ?? null),
    },
    cache: {
      audio: {
        /* By default, all keys "exist" so SFX plays succeed. */
        exists: vi.fn(() => true),
      },
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
        return { stop: vi.fn() };
      }),
    },
    _eventHandlers: eventHandlers,
    _playedSounds: playedSounds,
    _soundStore: soundStore,
    _audioCache: audioCache,
  };

  return scene;
}

function createMockConfigManager() {
  return {
    getTower: vi.fn((towerType: string) => {
      const classMap: Record<string, string> = {
        ranged: 'ranged',
        focused: 'focused',
        broadcast: 'broadcast',
        antiair: 'antiair',
      };
      return {
        id: towerType,
        towerClass: classMap[towerType] ?? 'ranged',
      };
    }),
  };
}

function createGameState(overrides?: Partial<GameState>): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 1,
    totalWaves: 20,
    objectiveHp: 100,
    maxObjectiveHp: 100,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
    gameMode: 'stage',
    highestWaveReached: 0,
    campaignComplete: false,
    ...overrides,
  };
}

/** Finds sounds played with a given key in the played sounds list. */
function getPlayedSfx(scene: ReturnType<typeof createMockScene>, key: string) {
  return scene._playedSounds.filter(s => s.key === key);
}

describe('AudioSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let audioSystem: AudioSystem;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createGameState();
    configManager = createMockConfigManager();
    audioSystem = new AudioSystem(
      scene as unknown as Phaser.Scene,
      gameState,
      configManager as never,
    );
    audioSystem.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Event Listener Registration
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('should register listeners for all required game events', () => {
      const registeredEvents = Array.from(scene._eventHandlers.keys());

      expect(registeredEvents).toContain(GAME_EVENTS.TOWER_FIRED);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_HIT);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_DIED);
      expect(registeredEvents).toContain(GAME_EVENTS.TOWER_PLACED);
      expect(registeredEvents).toContain(GAME_EVENTS.TOWER_UPGRADED);
      expect(registeredEvents).toContain(GAME_EVENTS.TOWER_REMOVED);
      expect(registeredEvents).toContain(GAME_EVENTS.WAVE_STARTED);
      expect(registeredEvents).toContain(GAME_EVENTS.WAVE_COMPLETED);
      expect(registeredEvents).toContain(GAME_EVENTS.GAME_OVER);
      expect(registeredEvents).toContain(GAME_EVENTS.CURRENCY_CHANGED);
    });

    it('should start gameplay ambient music on init', () => {
      const musicPlays = getPlayedSfx(scene, MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(musicPlays.length).toBe(1);
      expect(musicPlays[0]?.config?.loop).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tower Fire SFX (per-class mapping)
  // -------------------------------------------------------------------------

  describe('TOWER_FIRED event', () => {
    it('should play ranged fire SFX for ranged tower', () => {
      scene.events.emit(GAME_EVENTS.TOWER_FIRED, {
        towerId: 'tower-1',
        towerType: 'ranged',
        targetEnemyId: 'enemy-1',
        projectileType: 'arrow',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_FIRE_RANGED).length).toBe(1);
    });

    it('should play focused fire SFX for focused tower', () => {
      scene.events.emit(GAME_EVENTS.TOWER_FIRED, {
        towerId: 'tower-2',
        towerType: 'focused',
        targetEnemyId: 'enemy-1',
        projectileType: 'blast',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_FIRE_FOCUSED).length).toBe(1);
    });

    it('should play broadcast fire SFX for broadcast tower', () => {
      scene.events.emit(GAME_EVENTS.TOWER_FIRED, {
        towerId: 'tower-3',
        towerType: 'broadcast',
        targetEnemyId: 'enemy-1',
        projectileType: 'blast',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_FIRE_BROADCAST).length).toBe(1);
    });

    it('should play antiair fire SFX for antiair tower', () => {
      scene.events.emit(GAME_EVENTS.TOWER_FIRED, {
        towerId: 'tower-4',
        towerType: 'antiair',
        targetEnemyId: 'enemy-1',
        projectileType: 'missile',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_FIRE_ANTIAIR).length).toBe(1);
    });

    it('should default to ranged SFX for unknown tower class', () => {
      configManager.getTower.mockReturnValueOnce({
        id: 'custom',
        towerClass: 'unknown_class',
      });

      scene.events.emit(GAME_EVENTS.TOWER_FIRED, {
        towerId: 'tower-5',
        towerType: 'custom',
        targetEnemyId: 'enemy-1',
        projectileType: 'arrow',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_FIRE_RANGED).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Combat SFX
  // -------------------------------------------------------------------------

  describe('ENEMY_HIT event', () => {
    it('should play enemy hit SFX', () => {
      scene.events.emit(GAME_EVENTS.ENEMY_HIT, {
        enemyId: 'enemy-1',
        projectileType: 'arrow',
        damage: 10,
        position: { x: 100, y: 200 },
      });

      expect(getPlayedSfx(scene, SFX_KEYS.ENEMY_HIT).length).toBe(1);
    });
  });

  describe('ENEMY_DIED event', () => {
    it('should play enemy death SFX', () => {
      scene.events.emit(GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'enemy-1',
        enemyType: 'runner',
        position: { x: 100, y: 200 },
        reward: 10,
        scoreReward: 5,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.ENEMY_DIED).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Tower Lifecycle SFX
  // -------------------------------------------------------------------------

  describe('TOWER_PLACED event', () => {
    it('should play tower placed SFX', () => {
      scene.events.emit(GAME_EVENTS.TOWER_PLACED, {
        towerId: 'tower-1',
        towerType: 'ranged',
        col: 5,
        row: 3,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_PLACED).length).toBe(1);
    });
  });

  describe('TOWER_UPGRADED event', () => {
    it('should play tower upgraded SFX', () => {
      scene.events.emit(GAME_EVENTS.TOWER_UPGRADED, {
        towerId: 'tower-1',
        towerType: 'ranged',
        newTier: 2,
        cost: 50,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_UPGRADED).length).toBe(1);
    });
  });

  describe('TOWER_REMOVED event', () => {
    it('should play tower removed SFX', () => {
      scene.events.emit(GAME_EVENTS.TOWER_REMOVED, {
        towerId: 'tower-1',
        towerType: 'ranged',
        col: 5,
        row: 3,
        refundAmount: 25,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.TOWER_REMOVED).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Wave SFX
  // -------------------------------------------------------------------------

  describe('WAVE_STARTED event', () => {
    it('should play wave started SFX', () => {
      scene.events.emit(GAME_EVENTS.WAVE_STARTED, {
        waveNumber: 1,
        totalWaves: 20,
        isBossWave: false,
        earlyStart: false,
        upcomingComposition: [],
      });

      expect(getPlayedSfx(scene, SFX_KEYS.WAVE_STARTED).length).toBe(1);
    });
  });

  describe('WAVE_COMPLETED event', () => {
    it('should play wave completed SFX', () => {
      scene.events.emit(GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1,
        totalWaves: 20,
        earlyStart: false,
        timestamp: 30000,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.WAVE_COMPLETED).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Game Over SFX
  // -------------------------------------------------------------------------

  describe('GAME_OVER event', () => {
    it('should play victory SFX on victory', () => {
      scene.events.emit(GAME_EVENTS.GAME_OVER, {
        victory: true,
        finalScore: 1000,
        wavesCompleted: 20,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.GAME_VICTORY).length).toBe(1);
    });

    it('should play defeat SFX on defeat', () => {
      scene.events.emit(GAME_EVENTS.GAME_OVER, {
        victory: false,
        finalScore: 500,
        wavesCompleted: 10,
      });

      expect(getPlayedSfx(scene, SFX_KEYS.GAME_DEFEAT).length).toBe(1);
    });

    it('should stop music on game over', () => {
      const audioMgr = audioSystem.getAudioManager();
      expect(audioMgr.getCurrentMusicKey()).toBe(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      scene.events.emit(GAME_EVENTS.GAME_OVER, {
        victory: true,
        finalScore: 1000,
        wavesCompleted: 20,
      });

      /* Music should be stopped (null after stopMusic). */
      expect(audioMgr.getCurrentMusicKey()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Currency SFX
  // -------------------------------------------------------------------------

  describe('CURRENCY_CHANGED event', () => {
    it('should play currency gain SFX on positive delta', () => {
      scene.events.emit(GAME_EVENTS.CURRENCY_CHANGED, {
        newAmount: 110,
        delta: 10,
        reason: 'enemy_kill',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.CURRENCY_GAIN).length).toBe(1);
    });

    it('should NOT play SFX on negative delta (spending)', () => {
      scene.events.emit(GAME_EVENTS.CURRENCY_CHANGED, {
        newAmount: 50,
        delta: -50,
        reason: 'tower_placed',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.CURRENCY_GAIN).length).toBe(0);
    });

    it('should NOT play SFX on zero delta', () => {
      scene.events.emit(GAME_EVENTS.CURRENCY_CHANGED, {
        newAmount: 100,
        delta: 0,
        reason: 'no_change',
      });

      expect(getPlayedSfx(scene, SFX_KEYS.CURRENCY_GAIN).length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Low-HP Alert
  // -------------------------------------------------------------------------

  describe('low-HP alert', () => {
    it('should play alert when HP drops below threshold', () => {
      /* Set HP to below 25% threshold. */
      gameState.objectiveHp = 20;
      gameState.maxObjectiveHp = 100;

      audioSystem.update(0, 16);

      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(1);
    });

    it('should NOT play alert when HP is above threshold', () => {
      gameState.objectiveHp = 50;
      gameState.maxObjectiveHp = 100;

      audioSystem.update(0, 16);

      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(0);
    });

    it('should NOT play alert when HP is exactly 0 (game over handles that)', () => {
      gameState.objectiveHp = 0;
      gameState.maxObjectiveHp = 100;

      audioSystem.update(0, 16);

      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(0);
    });

    it('should respect cooldown between alert plays', () => {
      gameState.objectiveHp = 10;

      /* First update -- should play. */
      audioSystem.update(0, 16);
      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(1);

      /* Immediate second update -- should NOT play (cooldown). */
      audioSystem.update(16, 16);
      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(1);
    });

    it('should play again after cooldown expires', () => {
      gameState.objectiveHp = 10;

      audioSystem.update(0, 16);
      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(1);

      /* Advance time past the 3000ms cooldown. */
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3500);

      audioSystem.update(3500, 16);
      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(2);
    });

    it('should trigger at exactly the threshold boundary', () => {
      /* Exactly 25% HP. */
      gameState.objectiveHp = 25;
      gameState.maxObjectiveHp = 100;

      audioSystem.update(0, 16);

      expect(getPlayedSfx(scene, SFX_KEYS.LOW_HP_ALERT).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // AudioManager Access
  // -------------------------------------------------------------------------

  describe('getAudioManager', () => {
    it('should return the AudioManager instance', () => {
      const mgr = audioSystem.getAudioManager();
      expect(mgr).toBeDefined();
      expect(typeof mgr.playSfx).toBe('function');
      expect(typeof mgr.playMusic).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('should clean up listeners and audio manager', () => {
      expect(() => audioSystem.destroy()).not.toThrow();
      /* After destroy, scene.events.off should have been called for all listeners. */
      expect(scene.events.off).toHaveBeenCalled();
    });
  });
});
