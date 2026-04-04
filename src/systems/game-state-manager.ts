/**
 * Game state manager system -- handles objective HP, game over/victory,
 * pause/resume, speed multiplier, and defeat transition.
 *
 * This system is the state authority for game-level transitions:
 * - Objective HP decrement on ENEMY_REACHED_OBJECTIVE
 * - GAME_OVER emission on HP=0 (defeat) or ALL_WAVES_COMPLETED (victory)
 * - GAME_PAUSED emission on pause toggle (Escape key with priority chain)
 * - Speed multiplier management (1x / 2x)
 * - Session-best score comparison and registry storage
 * - Pause overlay creation/destruction (visual + buttons)
 * - 1-second defeat freeze + dim before GameOver scene transition
 *
 * Priority 7 in the system update order (after UpgradeSystem at 6).
 * Purely event-driven -- update() is a no-op (pause overlay uses Phaser
 * interactive events, not per-frame updates).
 *
 * Events consumed: ENEMY_REACHED_OBJECTIVE, ALL_WAVES_COMPLETED, INPUT_CANCEL
 * Events emitted: GAME_OVER, GAME_PAUSED
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, RunStats } from '../types/game-types';
import type {
  EnemyReachedObjectivePayload,
  AllWavesCompletedPayload,
  GameOverPayload,
  GamePausedPayload,
} from '../types/events';
import { DEPTH_OVERLAY } from '../config/depth-layers';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration of the defeat freeze before transitioning to GameOver scene. */
const DEFEAT_FREEZE_MS = 1000;

/** Pause overlay dim layer color and alpha. */
const PAUSE_DIM_COLOR = 0x000000;
const PAUSE_DIM_ALPHA = 0.6;

/** Pause overlay button styling. */
const BTN_WIDTH = 200;
const BTN_HEIGHT = 44;
const BTN_BG_COLOR = 0x2A2A4A;
const BTN_HOVER_COLOR = 0x3A3A6A;
const BTN_CORNER_RADIUS = 6;

// ---------------------------------------------------------------------------
// Extended GameOverData interface (passed to GameOver scene)
// ---------------------------------------------------------------------------

/** Data passed to the GameOver scene via scene.start(). */
export interface GameOverData {
  victory: boolean;
  score: number;
  wavesSurvived: number;
  totalKills: number;
  objectiveHpRemaining: number;
  isNewSessionBest: boolean;
}

// ---------------------------------------------------------------------------
// GameStateManager
// ---------------------------------------------------------------------------

export class GameStateManager extends BaseSystem {
  /** Reference to EconomySystem for getRunStats() at run end. */
  private economySystem: { getRunStats(): RunStats } | null = null;

  /** Pause overlay container -- created on pause, destroyed on resume/quit. */
  private pauseOverlay: Phaser.GameObjects.Container | null = null;

  /** Whether the defeat transition timer is active (prevents double-fire). */
  private defeatTransitionActive = false;

  /**
   * @param scene - The Phaser scene this system belongs to.
   * @param gameState - The per-run game state shared across systems.
   */
  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers event listeners for game state transitions.
   * Called after ALL systems are constructed.
   */
  init(): void {
    /* Resolve EconomySystem from registry for getRunStats(). */
    this.economySystem = this.scene.registry.get('economySystem') as
      { getRunStats(): RunStats } | undefined ?? null;

    /* Listen for enemy breakthrough -- decrement objective HP. */
    this.listen(
      GAME_EVENTS.ENEMY_REACHED_OBJECTIVE,
      this.onEnemyReachedObjective as (...args: never[]) => void,
    );

    /* Listen for all waves completed -- trigger victory. */
    this.listen(
      GAME_EVENTS.ALL_WAVES_COMPLETED,
      this.onAllWavesCompleted as (...args: never[]) => void,
    );

    /* Listen for INPUT_CANCEL (Escape key) -- toggle pause with priority chain. */
    this.listen(
      GAME_EVENTS.INPUT_CANCEL,
      this.onInputCancel as (...args: never[]) => void,
    );

    /* Initialize speed multiplier on registry (default 1x). */
    this.scene.registry.set('speedMultiplier', 1);

    /* Store self on registry for internal access. */
    this.scene.registry.set('gameStateManager', this);
  }

  /**
   * No per-frame logic needed -- all state transitions are event-driven.
   * Pause overlay buttons use Phaser interactive events (pointerdown),
   * which fire independent of the update loop.
   */
  update(_time: number, _delta: number): void {
    /* Intentionally empty. */
  }

  /**
   * Cleans up pause overlay and registry entries on scene shutdown.
   */
  destroy(): void {
    this.destroyPauseOverlay();
    this.scene.registry.remove('gameStateManager');
    this.scene.registry.remove('speedMultiplier');
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Toggles the speed multiplier between 1x and 2x.
   * Called by HudSystem's speed toggle button.
   */
  toggleSpeed(): void {
    const current = (this.scene.registry.get('speedMultiplier') as number) ?? 1;
    const next = current === 1 ? 2 : 1;
    this.scene.registry.set('speedMultiplier', next);
  }

  /**
   * Returns the current speed multiplier (1 or 2).
   */
  getSpeedMultiplier(): number {
    return (this.scene.registry.get('speedMultiplier') as number) ?? 1;
  }

  /**
   * Toggles the game pause state. Creates or destroys the pause overlay.
   * Emits GAME_PAUSED event so all systems know the state changed.
   */
  togglePause(): void {
    if (this.gameState.isGameOver) return;

    this.gameState.isPaused = !this.gameState.isPaused;

    const payload: GamePausedPayload = { paused: this.gameState.isPaused };
    this.emit(GAME_EVENTS.GAME_PAUSED, payload);

    if (this.gameState.isPaused) {
      this.createPauseOverlay();
    } else {
      this.destroyPauseOverlay();
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles ENEMY_REACHED_OBJECTIVE: decrements objective HP.
   * If HP reaches 0, triggers defeat.
   */
  private onEnemyReachedObjective(payload: EnemyReachedObjectivePayload): void {
    if (this.gameState.isGameOver) return;

    /* Decrement HP, clamping to 0. */
    this.gameState.objectiveHp = Math.max(
      0,
      this.gameState.objectiveHp - payload.damage,
    );

    /* Check defeat condition. */
    if (this.gameState.objectiveHp <= 0) {
      this.triggerDefeat();
    }
  }

  /**
   * Handles ALL_WAVES_COMPLETED: triggers victory.
   * Fires after the final WAVE_COMPLETED event (sequential from WaveSystem).
   */
  private onAllWavesCompleted(_payload: AllWavesCompletedPayload): void {
    if (this.gameState.isGameOver) return;
    this.triggerVictory();
  }

  /**
   * Handles INPUT_CANCEL (Escape key) with priority chain.
   * Only toggles pause if no higher-priority handler is active.
   *
   * Priority chain (checked in order):
   * 1. Placement mode active -> handled by BOLT-005 (exits placement)
   * 2. UpgradePanel open -> handled by BOLT-007 (closes panel)
   * 3. Wave summary overlay visible -> handled by HudSystem (dismisses overlay)
   * 4. Nothing else active -> toggle pause
   */
  private onInputCancel(): void {
    if (this.gameState.isGameOver) return;

    /* If paused, resume (Escape toggles pause off from overlay). */
    if (this.gameState.isPaused) {
      this.togglePause();
      return;
    }

    /* Check priority 1: placement mode. */
    const placementSystem = this.scene.registry.get('towerPlacementSystem') as
      { isInPlacementMode(): boolean } | undefined;
    if (placementSystem?.isInPlacementMode()) return;

    /* Check priority 2: upgrade panel open. */
    const upgradeSystem = this.scene.registry.get('upgradeSystem') as
      { isOpen(): boolean } | undefined;
    if (upgradeSystem?.isOpen()) return;

    /* Check priority 3: wave summary overlay visible.
     * HudSystem registers on registry to expose this check. */
    const hudSystem = this.scene.registry.get('hudSystem') as
      { isWaveSummaryVisible(): boolean; dismissWaveSummary(): void } | undefined;
    if (hudSystem?.isWaveSummaryVisible()) {
      hudSystem.dismissWaveSummary();
      return;
    }

    /* Priority 4: toggle pause. */
    this.togglePause();
  }

  // ---------------------------------------------------------------------------
  // Game End Logic
  // ---------------------------------------------------------------------------

  /**
   * Triggers the defeat sequence:
   * 1. Set isGameOver = true (halts all system updates)
   * 2. Emit GAME_OVER with victory=false
   * 3. After 1-second freeze + dim, transition to GameOver scene
   */
  private triggerDefeat(): void {
    if (this.defeatTransitionActive) return;
    this.defeatTransitionActive = true;

    this.gameState.isGameOver = true;
    this.gameState.objectiveHp = 0;

    const runStats = this.economySystem?.getRunStats() ?? {
      totalKills: 0, finalScore: this.gameState.score, wavesCompleted: 0,
    };

    const gameOverPayload: GameOverPayload = {
      victory: false,
      finalScore: runStats.finalScore,
      wavesCompleted: runStats.wavesCompleted,
    };
    this.emit(GAME_EVENTS.GAME_OVER, gameOverPayload);

    /* Compute session-best before scene transition. */
    const isNewSessionBest = this.updateSessionBest(runStats.finalScore);

    /* Build GameOverData for the results screen. */
    const gameOverData: GameOverData = {
      victory: false,
      score: runStats.finalScore,
      wavesSurvived: runStats.wavesCompleted,
      totalKills: runStats.totalKills,
      objectiveHpRemaining: 0,
      isNewSessionBest,
    };

    /* 1-second freeze + dim overlay, then scene transition.
     * Uses Phaser TimerEvent which fires even when update loop is skipped
     * (isGameOver causes Gameplay.update() to return early, but Phaser's
     * internal clock continues). */
    this.createDefeatDimOverlay();
    this.scene.time.delayedCall(DEFEAT_FREEZE_MS, () => {
      this.scene.scene.start(SCENE_KEYS.GAME_OVER, gameOverData);
    });
  }

  /**
   * Triggers the victory sequence:
   * 1. Set isGameOver = true
   * 2. Emit GAME_OVER with victory=true
   * 3. Transition to GameOver scene (no freeze delay for victory)
   */
  private triggerVictory(): void {
    this.gameState.isGameOver = true;

    const runStats = this.economySystem?.getRunStats() ?? {
      totalKills: 0, finalScore: this.gameState.score, wavesCompleted: this.gameState.totalWaves,
    };

    const gameOverPayload: GameOverPayload = {
      victory: true,
      finalScore: runStats.finalScore,
      wavesCompleted: runStats.wavesCompleted,
    };
    this.emit(GAME_EVENTS.GAME_OVER, gameOverPayload);

    /* Compute session-best before scene transition. */
    const isNewSessionBest = this.updateSessionBest(runStats.finalScore);

    const gameOverData: GameOverData = {
      victory: true,
      score: runStats.finalScore,
      wavesSurvived: runStats.wavesCompleted,
      totalKills: runStats.totalKills,
      objectiveHpRemaining: this.gameState.objectiveHp,
      isNewSessionBest,
    };

    /* Brief delay for victory to let the moment land. */
    this.scene.time.delayedCall(500, () => {
      this.scene.scene.start(SCENE_KEYS.GAME_OVER, gameOverData);
    });
  }

  /**
   * Compares the current score against the session best in registry.
   * Updates registry if current score is higher.
   *
   * @param finalScore - The run's final score.
   * @returns true if the score is a new session best.
   */
  private updateSessionBest(finalScore: number): boolean {
    const prevBest = (this.scene.registry.get('sessionBestScore') as number) ?? 0;
    if (finalScore > prevBest) {
      this.scene.registry.set('sessionBestScore', finalScore);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Pause Overlay
  // ---------------------------------------------------------------------------

  /**
   * Creates the full-screen pause overlay with dim layer, PAUSED text,
   * Resume button, and Quit to Menu button.
   */
  private createPauseOverlay(): void {
    if (this.pauseOverlay) return;

    const container = this.scene.add.container(0, 0);
    container.setDepth(DEPTH_OVERLAY);

    /* Dim layer -- full screen, semi-transparent black. */
    const dim = this.scene.add.graphics();
    dim.fillStyle(PAUSE_DIM_COLOR, PAUSE_DIM_ALPHA);
    dim.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    );
    container.add(dim);

    /* "PAUSED" header text. */
    const pausedText = this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80,
      'PAUSED',
      { fontSize: '36px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF' },
    ).setOrigin(0.5);
    container.add(pausedText);

    /* Resume button. */
    const resumeBtn = this.createPauseButton(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      'Resume', () => this.togglePause(),
    );
    container.add(resumeBtn);

    /* Quit to Menu button. */
    const quitBtn = this.createPauseButton(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 + BTN_HEIGHT + 16,
      'Quit to Menu', () => {
        this.gameState.isPaused = false;
        this.scene.scene.start(SCENE_KEYS.MAIN_MENU);
      },
    );
    /* Secondary styling -- slightly smaller text. */
    const quitLabel = quitBtn.getAt(1) as Phaser.GameObjects.Text;
    quitLabel.setFontSize(18).setColor('#AAAAAA');
    container.add(quitBtn);

    this.pauseOverlay = container;
  }

  /**
   * Creates a styled button container for the pause overlay.
   *
   * @param x - Center X position.
   * @param y - Center Y position.
   * @param label - Button text.
   * @param onClick - Click handler.
   * @returns A Phaser Container with background Graphics and Text.
   */
  private createPauseButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const btnContainer = this.scene.add.container(x, y);

    /* Button background. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(BTN_BG_COLOR, 1);
    bg.fillRoundedRect(-BTN_WIDTH / 2, -BTN_HEIGHT / 2, BTN_WIDTH, BTN_HEIGHT, BTN_CORNER_RADIUS);

    /* Button text. */
    const text = this.scene.add.text(0, 0, label, {
      fontSize: '22px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    btnContainer.add([bg, text]);

    /* Make interactive with hit area matching the background rect. */
    btnContainer.setSize(BTN_WIDTH, BTN_HEIGHT);
    btnContainer.setInteractive({ useHandCursor: true });

    /* Hover feedback. */
    btnContainer.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(BTN_HOVER_COLOR, 1);
      bg.fillRoundedRect(-BTN_WIDTH / 2, -BTN_HEIGHT / 2, BTN_WIDTH, BTN_HEIGHT, BTN_CORNER_RADIUS);
    });
    btnContainer.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(BTN_BG_COLOR, 1);
      bg.fillRoundedRect(-BTN_WIDTH / 2, -BTN_HEIGHT / 2, BTN_WIDTH, BTN_HEIGHT, BTN_CORNER_RADIUS);
    });
    btnContainer.on('pointerdown', onClick);

    return btnContainer;
  }

  /**
   * Destroys the pause overlay container and all its children.
   */
  private destroyPauseOverlay(): void {
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Defeat Dim Overlay
  // ---------------------------------------------------------------------------

  /**
   * Creates a semi-transparent dim overlay during the defeat freeze period.
   * This overlay auto-destroys when the scene transitions.
   */
  private createDefeatDimOverlay(): void {
    const dim = this.scene.add.graphics();
    dim.fillStyle(PAUSE_DIM_COLOR, 0.4);
    dim.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    dim.setDepth(DEPTH_OVERLAY);
  }
}
