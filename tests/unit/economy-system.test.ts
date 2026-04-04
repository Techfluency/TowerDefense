/**
 * Unit tests for EconomySystem (BOLT-008).
 *
 * Tests the centralized economy: starting currency, kill rewards,
 * wave bonuses, spend API, sell refunds, score tracking, run stats,
 * and event emissions. Uses mock Phaser scene and ConfigManager.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EconomySystem } from '../../src/systems/economy-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState, EconomyConfig } from '../../src/types/game-types';
import type {
  EnemyDiedPayload,
  WaveCompletedPayload,
  TowerRemovedPayload,
  CurrencyChangedPayload,
  ScoreChangedPayload,
} from '../../src/types/events';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  startingCurrency: 150,
  waveBonusBase: 10,
  waveBonusPerWave: 5,
  earlyStartBonus: 25,
  waveScoreBonusPerWave: 500,
};

/** Registered listeners: event handlers stored for manual triggering. */
type ListenerEntry = { event: string; callback: Function; context: unknown };

function createMockScene() {
  const listeners: ListenerEntry[] = [];

  return {
    events: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        listeners.push({ event, callback, context });
      }),
      off: vi.fn(),
      emit: vi.fn(),
    },
    _listeners: listeners,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 0,
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

function createMockConfigManager(config: EconomyConfig = DEFAULT_ECONOMY_CONFIG) {
  return {
    getEconomy: vi.fn(() => config),
  };
}

/**
 * Triggers a registered event listener by event name.
 * Simulates Phaser scene.events dispatching an event.
 */
function triggerEvent(
  listeners: ListenerEntry[],
  eventName: string,
  payload: unknown,
): void {
  for (const entry of listeners) {
    if (entry.event === eventName) {
      entry.callback.call(entry.context, payload);
    }
  }
}

/** Extracts emitted payloads for a given event name from mockScene.events.emit calls. */
function getEmittedPayloads<T>(
  mockScene: ReturnType<typeof createMockScene>,
  eventName: string,
): T[] {
  return mockScene.events.emit.mock.calls
    .filter((call: unknown[]) => call[0] === eventName)
    .map((call: unknown[]) => call[1] as T);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EconomySystem', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let system: EconomySystem;

  beforeEach(() => {
    mockScene = createMockScene();
    gameState = createMockGameState();
    configManager = createMockConfigManager();
    system = new EconomySystem(
      mockScene as never,
      gameState,
      configManager as never,
    );
    system.init();
  });

  // -----------------------------------------------------------------------
  // Starting Currency (AC-008-01a, AC-008-01b)
  // -----------------------------------------------------------------------

  describe('starting currency', () => {
    it('sets gameState.currency to startingCurrency from config', () => {
      expect(gameState.currency).toBe(150);
    });

    it('emits CURRENCY_CHANGED with reason "run_start" on init', () => {
      const payloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene,
        GAME_EVENTS.CURRENCY_CHANGED,
      );
      expect(payloads.length).toBe(1);
      expect(payloads[0]!.delta).toBe(150);
      expect(payloads[0]!.newAmount).toBe(150);
      expect(payloads[0]!.reason).toBe('run_start');
    });

    it('uses custom config values when provided', () => {
      const customScene = createMockScene();
      const customState = createMockGameState();
      const customConfig = createMockConfigManager({ ...DEFAULT_ECONOMY_CONFIG, startingCurrency: 200 });
      const customSystem = new EconomySystem(
        customScene as never,
        customState,
        customConfig as never,
      );
      customSystem.init();
      expect(customState.currency).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Kill Rewards (AC-008-02a through AC-008-02d)
  // -----------------------------------------------------------------------

  describe('enemy kill rewards', () => {
    it('credits currency reward on ENEMY_DIED', () => {
      const payload: EnemyDiedPayload = {
        enemyId: 'enemy-1',
        enemyType: 'runner',
        position: { x: 100, y: 200 },
        reward: 5,
        scoreReward: 10,
      };
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, payload);
      expect(gameState.currency).toBe(155);
    });

    it('emits CURRENCY_CHANGED with reason "enemy_kill"', () => {
      const payload: EnemyDiedPayload = {
        enemyId: 'enemy-1',
        enemyType: 'runner',
        position: { x: 100, y: 200 },
        reward: 5,
        scoreReward: 10,
      };
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, payload);

      const currencyPayloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene,
        GAME_EVENTS.CURRENCY_CHANGED,
      );
      /* First call is run_start, second is enemy_kill. */
      const killPayload = currencyPayloads.find(p => p.reason === 'enemy_kill');
      expect(killPayload).toBeDefined();
      expect(killPayload!.delta).toBe(5);
      expect(killPayload!.newAmount).toBe(155);
    });

    it('credits score reward on ENEMY_DIED', () => {
      const payload: EnemyDiedPayload = {
        enemyId: 'enemy-1',
        enemyType: 'runner',
        position: { x: 100, y: 200 },
        reward: 5,
        scoreReward: 10,
      };
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, payload);
      expect(gameState.score).toBe(10);
    });

    it('emits SCORE_CHANGED with reason "enemy_kill"', () => {
      const payload: EnemyDiedPayload = {
        enemyId: 'enemy-1',
        enemyType: 'runner',
        position: { x: 100, y: 200 },
        reward: 5,
        scoreReward: 10,
      };
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, payload);

      const scorePayloads = getEmittedPayloads<ScoreChangedPayload>(
        mockScene,
        GAME_EVENTS.SCORE_CHANGED,
      );
      expect(scorePayloads.length).toBe(1);
      expect(scorePayloads[0]!.delta).toBe(10);
      expect(scorePayloads[0]!.reason).toBe('enemy_kill');
    });

    it('handles higher rewards for tank enemies (AC-008-02c)', () => {
      /* Kill a runner (reward 5) then a tank (reward 15). */
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'e-1', enemyType: 'runner', position: { x: 0, y: 0 },
        reward: 5, scoreReward: 10,
      } satisfies EnemyDiedPayload);
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'e-2', enemyType: 'tank', position: { x: 0, y: 0 },
        reward: 15, scoreReward: 30,
      } satisfies EnemyDiedPayload);

      /* Total: 150 + 5 + 15 = 170. */
      expect(gameState.currency).toBe(170);
    });

    it('handles rapid kills without dropping any (AC-008-02d)', () => {
      for (let i = 0; i < 10; i++) {
        triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
          enemyId: `e-${i}`, enemyType: 'runner', position: { x: 0, y: 0 },
          reward: 5, scoreReward: 10,
        } satisfies EnemyDiedPayload);
      }
      /* Starting 150 + 10 * 5 = 200. */
      expect(gameState.currency).toBe(200);
      expect(gameState.score).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // Wave Completion Bonus (AC-008-03a through AC-008-03c)
  // -----------------------------------------------------------------------

  describe('wave completion bonus', () => {
    it('credits wave bonus currency: 10 + (5 * waveNumber) (AC-008-03a)', () => {
      const payload: WaveCompletedPayload = {
        waveNumber: 1, totalWaves: 20, earlyStart: false, timestamp: 1000,
      };
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, payload);
      /* Wave 1 bonus: 10 + 5*1 = 15. Total: 150 + 15 = 165. */
      expect(gameState.currency).toBe(165);
    });

    it('emits CURRENCY_CHANGED with reason "wave_bonus" (AC-008-03b)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1, totalWaves: 20, earlyStart: false, timestamp: 1000,
      } satisfies WaveCompletedPayload);

      const payloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene, GAME_EVENTS.CURRENCY_CHANGED,
      );
      const wavePayload = payloads.find(p => p.reason === 'wave_bonus');
      expect(wavePayload).toBeDefined();
      expect(wavePayload!.delta).toBe(15);
    });

    it('credits wave score bonus: 500 * waveNumber (AC-008-03c)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1, totalWaves: 20, earlyStart: false, timestamp: 1000,
      } satisfies WaveCompletedPayload);
      expect(gameState.score).toBe(500);
    });

    it('scales wave bonus with wave number (wave 10)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 10, totalWaves: 20, earlyStart: false, timestamp: 5000,
      } satisfies WaveCompletedPayload);
      /* Wave 10 bonus: 10 + 5*10 = 60. Total: 150 + 60 = 210. */
      expect(gameState.currency).toBe(210);
      /* Score: 500 * 10 = 5000. */
      expect(gameState.score).toBe(5000);
    });
  });

  // -----------------------------------------------------------------------
  // Early Start Bonus (AC-008-04a through AC-008-04c)
  // -----------------------------------------------------------------------

  describe('early start bonus', () => {
    it('grants early start bonus when earlyStart is true (AC-008-04a)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1, totalWaves: 20, earlyStart: true, timestamp: 1000,
      } satisfies WaveCompletedPayload);
      /* Wave bonus: 15 + early bonus: 25 = 40. Total: 150 + 40 = 190. */
      expect(gameState.currency).toBe(190);
    });

    it('does not grant early bonus when earlyStart is false (AC-008-04b)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1, totalWaves: 20, earlyStart: false, timestamp: 1000,
      } satisfies WaveCompletedPayload);
      /* No early bonus. Wave bonus only: 15. Total: 150 + 15 = 165. */
      expect(gameState.currency).toBe(165);
    });

    it('wave 5 early start total: 10 + 5*5 + 25 = 60 (AC-008-04c)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 5, totalWaves: 20, earlyStart: true, timestamp: 3000,
      } satisfies WaveCompletedPayload);
      /* Wave 5 bonus: 10 + 25 = 35, plus early: 25 = 60 total. 150 + 60 = 210. */
      expect(gameState.currency).toBe(210);
    });

    it('emits separate CURRENCY_CHANGED for early_start_bonus', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 1, totalWaves: 20, earlyStart: true, timestamp: 1000,
      } satisfies WaveCompletedPayload);

      const payloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene, GAME_EVENTS.CURRENCY_CHANGED,
      );
      const earlyPayload = payloads.find(p => p.reason === 'early_start_bonus');
      expect(earlyPayload).toBeDefined();
      expect(earlyPayload!.delta).toBe(25);
    });
  });

  // -----------------------------------------------------------------------
  // trySpend (AC-008-05a through AC-008-05d)
  // -----------------------------------------------------------------------

  describe('trySpend', () => {
    it('deducts currency on success (AC-008-05c)', () => {
      /* Player has 150. Spend 75 => success, balance 75. */
      const result = system.trySpend(75, 'tower_placed');
      expect(result).toBe(true);
      expect(gameState.currency).toBe(75);
    });

    it('returns false on insufficient funds (AC-008-05a)', () => {
      /* Player has 150. Try to spend 200. */
      const result = system.trySpend(200, 'tower_placed');
      expect(result).toBe(false);
      expect(gameState.currency).toBe(150);
    });

    it('does not emit CURRENCY_CHANGED on failed spend (AC-008-05b)', () => {
      /* Clear the run_start emission. */
      mockScene.events.emit.mockClear();

      system.trySpend(200, 'tower_placed');
      expect(mockScene.events.emit).not.toHaveBeenCalled();
    });

    it('succeeds when spending exact amount (AC-008-05c)', () => {
      const result = system.trySpend(150, 'tower_placed');
      expect(result).toBe(true);
      expect(gameState.currency).toBe(0);
    });

    it('returns false when currency is 0 and cost > 0 (AC-008-05d)', () => {
      system.trySpend(150, 'tower_placed');
      const result = system.trySpend(1, 'tower_placed');
      expect(result).toBe(false);
      expect(gameState.currency).toBe(0);
    });

    it('emits CURRENCY_CHANGED with negative delta on success', () => {
      mockScene.events.emit.mockClear();
      system.trySpend(50, 'tower_placed');

      const payloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene, GAME_EVENTS.CURRENCY_CHANGED,
      );
      expect(payloads.length).toBe(1);
      expect(payloads[0]!.delta).toBe(-50);
      expect(payloads[0]!.newAmount).toBe(100);
      expect(payloads[0]!.reason).toBe('tower_placed');
    });

    it('handles zero amount as success (no-op)', () => {
      const result = system.trySpend(0, 'free');
      expect(result).toBe(true);
      expect(gameState.currency).toBe(150);
    });
  });

  // -----------------------------------------------------------------------
  // Sell Refund (AC-008-06a, AC-008-06b)
  // -----------------------------------------------------------------------

  describe('sell refund via TOWER_REMOVED', () => {
    it('credits refund amount on TOWER_REMOVED (AC-008-06a)', () => {
      /* Spend 50 first, then sell for 25 refund. */
      system.trySpend(50, 'tower_placed');
      triggerEvent(mockScene._listeners, GAME_EVENTS.TOWER_REMOVED, {
        towerId: 'tower-1', towerType: 'ranged', col: 3, row: 4,
        refundAmount: 25,
      } satisfies TowerRemovedPayload);
      expect(gameState.currency).toBe(125);
    });

    it('emits CURRENCY_CHANGED with reason "tower_sold" (AC-008-06b)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.TOWER_REMOVED, {
        towerId: 'tower-1', towerType: 'ranged', col: 3, row: 4,
        refundAmount: 25,
      } satisfies TowerRemovedPayload);

      const payloads = getEmittedPayloads<CurrencyChangedPayload>(
        mockScene, GAME_EVENTS.CURRENCY_CHANGED,
      );
      const sellPayload = payloads.find(p => p.reason === 'tower_sold');
      expect(sellPayload).toBeDefined();
      expect(sellPayload!.delta).toBe(25);
    });

    it('does not credit when refundAmount is 0', () => {
      mockScene.events.emit.mockClear();
      triggerEvent(mockScene._listeners, GAME_EVENTS.TOWER_REMOVED, {
        towerId: 'tower-1', towerType: 'ranged', col: 3, row: 4,
        refundAmount: 0,
      } satisfies TowerRemovedPayload);
      /* No currency change event should be emitted for zero refund. */
      expect(mockScene.events.emit).not.toHaveBeenCalledWith(
        GAME_EVENTS.CURRENCY_CHANGED, expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Full Economic Loop (AC-008-06c)
  // -----------------------------------------------------------------------

  describe('full economic loop', () => {
    it('place, kill, sell produces correct total (AC-008-06c)', () => {
      /* Starting: 150. Place arrow tower (cost 50) => 100. */
      system.trySpend(50, 'tower_placed');
      expect(gameState.currency).toBe(100);

      /* Kill 3 runners (reward 5 each) => 115. */
      for (let i = 0; i < 3; i++) {
        triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
          enemyId: `e-${i}`, enemyType: 'runner', position: { x: 0, y: 0 },
          reward: 5, scoreReward: 10,
        } satisfies EnemyDiedPayload);
      }
      expect(gameState.currency).toBe(115);

      /* Sell tower (refund 25) => 140. */
      triggerEvent(mockScene._listeners, GAME_EVENTS.TOWER_REMOVED, {
        towerId: 'tower-1', towerType: 'ranged', col: 0, row: 0,
        refundAmount: 25,
      } satisfies TowerRemovedPayload);
      expect(gameState.currency).toBe(140);
    });
  });

  // -----------------------------------------------------------------------
  // Scoring (AC-008-07a through AC-008-07d)
  // -----------------------------------------------------------------------

  describe('scoring', () => {
    it('increments score by scoreReward on enemy kill (AC-008-07a)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'e-1', enemyType: 'runner', position: { x: 0, y: 0 },
        reward: 5, scoreReward: 10,
      } satisfies EnemyDiedPayload);
      expect(gameState.score).toBe(10);
    });

    it('emits SCORE_CHANGED with correct newScore (AC-008-07d)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'e-1', enemyType: 'runner', position: { x: 0, y: 0 },
        reward: 5, scoreReward: 10,
      } satisfies EnemyDiedPayload);

      const payloads = getEmittedPayloads<ScoreChangedPayload>(
        mockScene, GAME_EVENTS.SCORE_CHANGED,
      );
      expect(payloads[0]!.newScore).toBe(10);
    });

    it('wave 10 score bonus is 5000 (AC-008-07c)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 10, totalWaves: 20, earlyStart: false, timestamp: 5000,
      } satisfies WaveCompletedPayload);
      expect(gameState.score).toBe(5000);
    });
  });

  // -----------------------------------------------------------------------
  // Run Stats (AC-008-08a through AC-008-08c)
  // -----------------------------------------------------------------------

  describe('getRunStats', () => {
    it('returns totalKills matching ENEMY_DIED count (AC-008-08a)', () => {
      for (let i = 0; i < 5; i++) {
        triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
          enemyId: `e-${i}`, enemyType: 'runner', position: { x: 0, y: 0 },
          reward: 5, scoreReward: 10,
        } satisfies EnemyDiedPayload);
      }
      const stats = system.getRunStats();
      expect(stats.totalKills).toBe(5);
    });

    it('returns wavesCompleted as highest waveNumber (AC-008-08b)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 3, totalWaves: 20, earlyStart: false, timestamp: 1000,
      } satisfies WaveCompletedPayload);
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 5, totalWaves: 20, earlyStart: false, timestamp: 2000,
      } satisfies WaveCompletedPayload);
      const stats = system.getRunStats();
      expect(stats.wavesCompleted).toBe(5);
    });

    it('returns finalScore matching current gameState.score (AC-008-08c)', () => {
      triggerEvent(mockScene._listeners, GAME_EVENTS.ENEMY_DIED, {
        enemyId: 'e-1', enemyType: 'runner', position: { x: 0, y: 0 },
        reward: 5, scoreReward: 100,
      } satisfies EnemyDiedPayload);
      triggerEvent(mockScene._listeners, GAME_EVENTS.WAVE_COMPLETED, {
        waveNumber: 2, totalWaves: 20, earlyStart: false, timestamp: 1000,
      } satisfies WaveCompletedPayload);
      const stats = system.getRunStats();
      /* Score: 100 (kill) + 1000 (wave 2 bonus: 500*2). */
      expect(stats.finalScore).toBe(1100);
      expect(stats.finalScore).toBe(gameState.score);
    });

    it('returns zeroes before any events', () => {
      const stats = system.getRunStats();
      expect(stats.totalKills).toBe(0);
      expect(stats.wavesCompleted).toBe(0);
      expect(stats.finalScore).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Event listener registration
  // -----------------------------------------------------------------------

  describe('event listener registration', () => {
    it('registers listeners for ENEMY_DIED, WAVE_COMPLETED, TOWER_REMOVED', () => {
      const registeredEvents = mockScene._listeners.map(l => l.event);
      expect(registeredEvents).toContain(GAME_EVENTS.ENEMY_DIED);
      expect(registeredEvents).toContain(GAME_EVENTS.WAVE_COMPLETED);
      expect(registeredEvents).toContain(GAME_EVENTS.TOWER_REMOVED);
    });
  });

  // -----------------------------------------------------------------------
  // update() is a no-op
  // -----------------------------------------------------------------------

  describe('update()', () => {
    it('does not throw and does not modify state', () => {
      const currencyBefore = gameState.currency;
      const scoreBefore = gameState.score;
      system.update(1000, 16.67);
      expect(gameState.currency).toBe(currencyBefore);
      expect(gameState.score).toBe(scoreBefore);
    });
  });
});
