/**
 * Economy system -- centralizes all currency and score mutations.
 *
 * This system is the single authority for currency and score state.
 * No other system may directly mutate GameState.currency or GameState.score
 * after BOLT-008 is active. All debits go through trySpend(); all credits
 * are event-driven (ENEMY_DIED, WAVE_COMPLETED, TOWER_REMOVED).
 *
 * Priority 5 in the system update order (between ProjectileSystem and UpgradeSystem).
 * Purely event-driven -- update() is a no-op.
 *
 * Events consumed: ENEMY_DIED, WAVE_COMPLETED, TOWER_REMOVED
 * Events emitted: CURRENCY_CHANGED, SCORE_CHANGED
 */
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, EconomyConfig, RunStats } from '../types/game-types';
import type {
  EnemyDiedPayload,
  WaveCompletedPayload,
  TowerRemovedPayload,
  CurrencyChangedPayload,
  ScoreChangedPayload,
  BossDiedPayload,
} from '../types/events';
import type { ConfigManager } from '../utils/config-manager';

export class EconomySystem extends BaseSystem {
  private readonly configManager: ConfigManager;

  /** Economy balance parameters loaded from economy.json. */
  private economyConfig!: EconomyConfig;

  // --- Run stats (private, exposed via getRunStats()) ---
  /** Total enemy kills in this run. */
  private totalKills = 0;
  /** Highest waveNumber received via WAVE_COMPLETED. */
  private wavesCompleted = 0;
  /** Total boss enemies killed in this run. BOLT-021: tracked for XP calculation. */
  private bossKills = 0;

  /**
   * @param scene - The Phaser scene this system belongs to.
   * @param gameState - The per-run game state shared across systems.
   * @param configManager - Typed config access for economy balance data.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.configManager = configManager;
  }

  /**
   * Loads economy config, sets starting currency, and registers event listeners.
   * Called after ALL systems are constructed so listener targets exist.
   */
  init(): void {
    this.economyConfig = this.configManager.getEconomy();

    /* Set starting currency from config (overrides the 0 from createInitialGameState). */
    this.gameState.currency = this.economyConfig.startingCurrency;

    /* BOLT-021: Apply starting currency bonus from meta-progression unlocks.
     * Lv5 grants +25, Lv8 grants +50 (stacked = +75 at Lv8+).
     * ProgressionManager is stored on registry by Boot scene.
     * Uses optional chaining because registry may not exist in unit test mocks. */
    const registry = this.scene.registry as
      { get?(key: string): unknown } | undefined;
    const progressionManager = registry?.get?.('progressionManager') as
      { getStartingCurrencyBonus(): number } | undefined;
    const currencyBonus = progressionManager?.getStartingCurrencyBonus() ?? 0;
    if (currencyBonus > 0) {
      this.gameState.currency += currencyBonus;
    }

    this.emitCurrencyChanged(this.gameState.currency, 'run_start');

    /* Register event listeners via BaseSystem.listen() for auto-cleanup. */
    this.listen(GAME_EVENTS.ENEMY_DIED, this.onEnemyDied as (...args: never[]) => void);
    this.listen(GAME_EVENTS.WAVE_COMPLETED, this.onWaveCompleted as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TOWER_REMOVED, this.onTowerRemoved as (...args: never[]) => void);

    /* BOLT-021: Listen for boss kills to track for XP calculation. */
    this.listen(GAME_EVENTS.BOSS_DIED, this.onBossDied as (...args: never[]) => void);
  }

  /**
   * No-op -- EconomySystem is purely event-driven.
   * All state changes happen in event handlers, not per-frame.
   */
  update(_time: number, _delta: number): void {
    /* Intentionally empty. */
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Attempts to spend currency. Validates that the player can afford the cost.
   * On success: deducts from GameState.currency and emits CURRENCY_CHANGED.
   * On failure: no mutation, no event.
   *
   * @param amount - Currency to spend (must be > 0).
   * @param reason - Descriptive reason for the CURRENCY_CHANGED event (e.g., "tower_placed").
   * @returns true if the spend succeeded, false if insufficient funds.
   */
  trySpend(amount: number, reason: string): boolean {
    if (amount <= 0) return true;
    if (this.gameState.currency < amount) return false;

    this.gameState.currency -= amount;
    this.emitCurrencyChanged(-amount, reason);
    return true;
  }

  /**
   * Returns accumulated run statistics for the end-of-run summary.
   * BOLT-009 calls this at game over / victory to populate the results screen.
   *
   * @returns Snapshot of kills, score, and waves completed.
   */
  getRunStats(): RunStats {
    return {
      totalKills: this.totalKills,
      finalScore: this.gameState.score,
      wavesCompleted: this.wavesCompleted,
      bossKills: this.bossKills,
    };
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles ENEMY_DIED: credits currency reward and score reward.
   * Each kill increments the run stats kill counter.
   */
  private onEnemyDied(payload: EnemyDiedPayload): void {
    /* Credit currency reward from enemy config. */
    if (payload.reward > 0) {
      this.gameState.currency += payload.reward;
      this.emitCurrencyChanged(payload.reward, 'enemy_kill');
    }

    /* Credit score reward from enemy config. */
    if (payload.scoreReward > 0) {
      this.gameState.score += payload.scoreReward;
      this.emitScoreChanged(payload.scoreReward, 'enemy_kill');
    }

    this.totalKills++;
  }

  /**
   * Handles WAVE_COMPLETED: credits wave bonus currency and score.
   * Applies early-start bonus if the wave was started early.
   * Tracks highest wave number for run stats.
   */
  private onWaveCompleted(payload: WaveCompletedPayload): void {
    const { waveNumber, earlyStart } = payload;

    /* Wave completion currency bonus: waveBonusBase + (waveBonusPerWave * waveNumber). */
    const waveCurrencyBonus =
      this.economyConfig.waveBonusBase +
      this.economyConfig.waveBonusPerWave * waveNumber;

    if (waveCurrencyBonus > 0) {
      this.gameState.currency += waveCurrencyBonus;
      this.emitCurrencyChanged(waveCurrencyBonus, 'wave_bonus');
    }

    /* Early start bonus: flat currency bonus when player skipped prep countdown. */
    if (earlyStart && this.economyConfig.earlyStartBonus > 0) {
      this.gameState.currency += this.economyConfig.earlyStartBonus;
      this.emitCurrencyChanged(this.economyConfig.earlyStartBonus, 'early_start_bonus');
    }

    /* Wave score bonus: waveScoreBonusPerWave * waveNumber. */
    const waveScoreBonus = this.economyConfig.waveScoreBonusPerWave * waveNumber;
    if (waveScoreBonus > 0) {
      this.gameState.score += waveScoreBonus;
      this.emitScoreChanged(waveScoreBonus, 'wave_bonus');
    }

    /* Track highest wave number (not a simple increment -- handles edge cases). */
    this.wavesCompleted = Math.max(this.wavesCompleted, waveNumber);
  }

  /**
   * Handles TOWER_REMOVED: credits sell refund currency.
   * Refund always succeeds (no validation needed for credits).
   */
  private onTowerRemoved(payload: TowerRemovedPayload): void {
    if (payload.refundAmount > 0) {
      this.gameState.currency += payload.refundAmount;
      this.emitCurrencyChanged(payload.refundAmount, 'tower_sold');
    }
  }

  /**
   * Handles BOSS_DIED: increments the boss kill counter for run stats.
   * BOLT-021: Boss kills contribute 50 XP each to meta progression.
   */
  private onBossDied(_payload: BossDiedPayload): void {
    this.bossKills++;
  }

  // ---------------------------------------------------------------------------
  // Event Emission Helpers
  // ---------------------------------------------------------------------------

  /**
   * Emits CURRENCY_CHANGED event with current balance, delta, and reason.
   * Synchronous -- HUD listeners receive the event in the same call stack.
   */
  private emitCurrencyChanged(delta: number, reason: string): void {
    const payload: CurrencyChangedPayload = {
      newAmount: this.gameState.currency,
      delta,
      reason,
    };
    this.emit(GAME_EVENTS.CURRENCY_CHANGED, payload);
  }

  /**
   * Emits SCORE_CHANGED event with current score, delta, and reason.
   * Synchronous -- HUD listeners receive the event in the same call stack.
   */
  private emitScoreChanged(delta: number, reason: string): void {
    const payload: ScoreChangedPayload = {
      newScore: this.gameState.score,
      delta,
      reason,
    };
    this.emit(GAME_EVENTS.SCORE_CHANGED, payload);
  }
}
