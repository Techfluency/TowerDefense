/**
 * Audio system -- event-driven SFX dispatcher and music controller.
 *
 * Extends BaseSystem to integrate with the Gameplay scene lifecycle.
 * Listens to game events (tower fire, enemy death, wave start, etc.)
 * and dispatches the appropriate SFX via AudioManager. Also manages
 * background music playback and the low-HP alert.
 *
 * This system is intentionally "listen-only" -- it does not modify
 * GameState or emit events. It is a pure consumer of game events
 * that produces audio side effects.
 *
 * BOLT-015 implementation.
 */
import type Phaser from 'phaser';
import { BaseSystem } from './base-system';
import type { GameState } from '../types/game-types';
import { GAME_EVENTS } from '../types/game-types';
import { AudioManager } from '../utils/audio-manager';
import {
  SFX_KEYS,
  MUSIC_KEYS,
  TOWER_CLASS_FIRE_SFX,
  LOW_HP_ALERT_THRESHOLD,
  LOW_HP_ALERT_INTERVAL_MS,
} from '../config/audio-config';
import type { SfxKey } from '../config/audio-config';
import type {
  TowerFiredPayload,
  EnemyHitPayload,
  EnemyDiedPayload,
  TowerPlacedPayload,
  TowerUpgradedPayload,
  TowerRemovedPayload,
  WaveStartedPayload,
  WaveCompletedPayload,
  GameOverPayload,
  CurrencyChangedPayload,
} from '../types/events';
import type { ConfigManager } from '../utils/config-manager';

export class AudioSystem extends BaseSystem {
  /** AudioManager handles the actual sound playback and volume math. */
  private readonly audioManager: AudioManager;

  /** ConfigManager for looking up tower definitions (class -> fire SFX). */
  private readonly configManager: ConfigManager;

  /** Timestamp of the last low-HP alert play (prevents spamming). */
  private lastLowHpAlertTime: number = 0;


  /**
   * @param scene - The Phaser scene (Gameplay).
   * @param gameState - The per-run game state.
   * @param configManager - Access to tower definitions for class lookup.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.audioManager = new AudioManager(scene);
    this.configManager = configManager;
  }

  /**
   * Returns the AudioManager instance for external access (e.g., registry).
   * Allows other systems or scenes to control volume without coupling
   * to this system's internals.
   */
  getAudioManager(): AudioManager {
    return this.audioManager;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Registers event listeners for all game events that trigger SFX.
   * Called after all systems are constructed so event sources exist.
   */
  init(): void {
    /* Tower combat events. */
    this.listen(GAME_EVENTS.TOWER_FIRED, this.onTowerFired as (...args: never[]) => void);
    this.listen(GAME_EVENTS.ENEMY_HIT, this.onEnemyHit as (...args: never[]) => void);
    this.listen(GAME_EVENTS.ENEMY_DIED, this.onEnemyDied as (...args: never[]) => void);

    /* Tower lifecycle events. */
    this.listen(GAME_EVENTS.TOWER_PLACED, this.onTowerPlaced as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TOWER_UPGRADED, this.onTowerUpgraded as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TOWER_REMOVED, this.onTowerRemoved as (...args: never[]) => void);

    /* Wave progression events. */
    this.listen(GAME_EVENTS.WAVE_STARTED, this.onWaveStarted as (...args: never[]) => void);
    this.listen(GAME_EVENTS.WAVE_COMPLETED, this.onWaveCompleted as (...args: never[]) => void);

    /* Game state events. */
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);

    /* Economy events. */
    this.listen(GAME_EVENTS.CURRENCY_CHANGED, this.onCurrencyChanged as (...args: never[]) => void);

    /* Start gameplay background music on first wave start (not immediately —
     * gives the prep phase a quieter feel before battle begins). */
  }

  /**
   * Per-frame update: syncs volume from settings and checks low-HP alert.
   *
   * @param _time - Total elapsed time (unused).
   * @param _delta - Frame delta (unused).
   */
  update(_time: number, _delta: number): void {
    /* Sync volume from settings sliders in real time. */
    this.audioManager.syncFromSettings();

    /* Check if objective HP is critically low and play alert if needed. */
    this.checkLowHpAlert();
  }

  /**
   * Stops all audio and cleans up the AudioManager on scene shutdown.
   */
  destroy(): void {
    this.audioManager.destroy();
    super.destroy();
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * TOWER_FIRED -- play the firing SFX for the tower's class.
   * Each tower class has a distinct weapon sound so the player can
   * aurally distinguish tower types without looking.
   */
  private onTowerFired(payload: TowerFiredPayload): void {
    const towerDef = this.configManager.getTower(payload.towerType);
    const towerClass = towerDef?.towerClass ?? 'ranged';
    const sfxKey: SfxKey = TOWER_CLASS_FIRE_SFX[towerClass] ?? SFX_KEYS.TOWER_FIRE_RANGED;
    this.audioManager.playSfx(sfxKey);
  }

  /**
   * ENEMY_HIT -- play the impact SFX when a projectile connects.
   */
  private onEnemyHit(_payload: EnemyHitPayload): void {
    this.audioManager.playSfx(SFX_KEYS.ENEMY_HIT);
  }

  /**
   * ENEMY_DIED -- play the death SFX. Rate-limited to prevent
   * cacophony during mass swarm kills.
   */
  private onEnemyDied(_payload: EnemyDiedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.ENEMY_DIED);
  }

  /**
   * TOWER_PLACED -- satisfying confirmation sound on successful placement.
   */
  private onTowerPlaced(_payload: TowerPlacedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.TOWER_PLACED);
  }

  /**
   * TOWER_UPGRADED -- positive feedback for upgrade completion.
   */
  private onTowerUpgraded(_payload: TowerUpgradedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.TOWER_UPGRADED);
  }

  /**
   * TOWER_REMOVED -- sell/destruction confirmation sound.
   */
  private onTowerRemoved(_payload: TowerRemovedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.TOWER_REMOVED);
  }

  /**
   * WAVE_STARTED -- alert horn and start/resume battle music.
   * Music starts fresh each wave so the intensity resets.
   */
  private onWaveStarted(_payload: WaveStartedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.WAVE_STARTED);
    /* Resume or start battle music when a wave begins. */
    this.audioManager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);
  }

  /**
   * WAVE_COMPLETED -- chime and pause battle music during prep phase.
   * Creates a quieter atmosphere between waves for strategic thinking.
   */
  private onWaveCompleted(_payload: WaveCompletedPayload): void {
    this.audioManager.playSfx(SFX_KEYS.WAVE_COMPLETED);
    /* Pause music between rounds for a calmer prep phase. */
    this.audioManager.stopMusic();
  }

  /**
   * GAME_OVER -- stop music, then play victory or defeat stinger.
   */
  private onGameOver(payload: GameOverPayload): void {
    this.audioManager.stopMusic();
    if (payload.victory) {
      this.audioManager.playSfx(SFX_KEYS.GAME_VICTORY);
    } else {
      this.audioManager.playSfx(SFX_KEYS.GAME_DEFEAT);
    }
  }

  /**
   * CURRENCY_CHANGED -- play coin/chime for positive currency gains
   * (kills, wave bonuses). Negative changes (spending) are silent.
   */
  private onCurrencyChanged(payload: CurrencyChangedPayload): void {
    if (payload.delta > 0) {
      this.audioManager.playSfx(SFX_KEYS.CURRENCY_GAIN);
    }
  }

  // -------------------------------------------------------------------------
  // Low-HP Alert
  // -------------------------------------------------------------------------

  /**
   * Checks if the objective HP has dropped below the alert threshold
   * and plays a periodic warning sound. Only triggers when HP is low
   * but not zero (game over handles its own stinger).
   */
  private checkLowHpAlert(): void {
    const hpRatio = this.gameState.objectiveHp / this.gameState.maxObjectiveHp;
    const isBelowThreshold = hpRatio <= LOW_HP_ALERT_THRESHOLD && hpRatio > 0;

    if (!isBelowThreshold) return;

    /* Only play the alert periodically, not every frame. */
    const now = Date.now();
    if (now - this.lastLowHpAlertTime >= LOW_HP_ALERT_INTERVAL_MS) {
      this.audioManager.playSfx(SFX_KEYS.LOW_HP_ALERT);
      this.lastLowHpAlertTime = now;
    }
  }
}
