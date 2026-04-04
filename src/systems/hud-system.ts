/**
 * HUD system -- all visual HUD rendering for the Gameplay scene.
 *
 * Renders:
 * - Top bar: currency, score, wave counter, pause button, speed toggle
 * - Objective HP bar with danger pulsing at <= 30%
 * - Floating reward text at kill/event locations
 * - Wave prep elements: countdown timer, Start Early button, wave preview
 * - Wave summary overlay between waves
 * - Tower tooltip (on build menu hover) and enemy tooltip (on sprite hover)
 * - Enemy type badges (colorblind accessibility shapes)
 * - Onboarding coach marks (build menu + upgrade panel hints)
 * - Sell tooltip click-away dismiss fix
 *
 * Priority 8 in the system update order (after GameStateManager at 7).
 * Updates every frame: redraws objective HP bar, badges, prep timer.
 * Event-driven: floating text, wave summary, tooltips, coach marks.
 *
 * Events consumed: CURRENCY_CHANGED, SCORE_CHANGED, WAVE_STARTED,
 *   WAVE_COMPLETED, TOWER_UPGRADED, TOWER_REPAIRED, TILE_CLICKED
 * Events emitted: none (purely visual)
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState } from '../types/game-types';
import type {
  CurrencyChangedPayload,
  ScoreChangedPayload,
  WaveStartedPayload,
  WaveCompletedPayload,
  TowerUpgradedPayload,
  TowerRepairedPayload,
  TileClickedPayload,
  CompositionSummaryEntry,
} from '../types/events';
import { DEPTH_FLOATING_TEXT, DEPTH_UI, DEPTH_TOOLTIP, DEPTH_OVERLAY } from '../config/depth-layers';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';
import type { Enemy } from '../entities/enemy';
import { EnemyState } from '../entities/enemy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HUD bar dimensions. */
const HUD_BAR_HEIGHT = 40;
const HUD_BAR_BG_COLOR = 0x0D0D1A;
const HUD_BAR_BG_ALPHA = 0.85;
const HUD_BAR_BORDER_COLOR = 0x4A4A6A;
const HUD_PADDING_X = 12;

/** Objective HP bar dimensions and colors. */
const OBJ_BAR_WIDTH = 200;
const OBJ_BAR_HEIGHT = 12;
const OBJ_BAR_Y = 46;
const OBJ_BAR_BG = 0x333333;
const OBJ_BAR_BORDER = 0x555555;
const OBJ_BAR_CORNER_RADIUS = 3;
const OBJ_COLOR_HIGH = 0x4AFF4A;
const OBJ_COLOR_MID = 0xFFD700;
const OBJ_COLOR_DANGER = 0xFF2222;
const OBJ_DANGER_THRESHOLD = 0.3;

/** Floating text config. */
const FLOATING_TEXT_DURATION = 1500;
const FLOATING_TEXT_RISE = 30;
const MAX_FLOATING_TEXTS = 20;

/** Wave summary overlay config. */
const WAVE_SUMMARY_WIDTH = 320;
const WAVE_SUMMARY_AUTO_DISMISS_MS = 5000;
const WAVE_SUMMARY_FADE_MS = 300;
const OVERLAY_BG_COLOR = 0x0D0D1A;
const OVERLAY_BG_ALPHA = 0.92;
const OVERLAY_CORNER_RADIUS = 8;

/** Tooltip config. */
const TOOLTIP_SHOW_DELAY = 300;
const TOOLTIP_BG_COLOR = 0x1A1A2E;
const TOOLTIP_BG_ALPHA = 0.9;
const TOOLTIP_BORDER_COLOR = 0x4A4A6A;
const TOOLTIP_PADDING = 8;
const TOOLTIP_MAX_WIDTH = 220;
const TOOLTIP_CORNER_RADIUS = 4;

/** Coach mark config. */
const COACH_MARK_WIDTH = 260;
const COACH_MARK_BG_ALPHA = 0.95;

/** Enemy type badge colors (hex). */
const ENEMY_BADGE_COLORS: Record<string, number> = {
  runner: 0x4AFF4A,
  tank: 0xFF4A4A,
  fast: 0x4A90D9,
  flyer: 0xD94AFF,
  swarm: 0xFFD700,
};

/** Per-wave snapshot for tracking deltas. */
interface PerWaveSnapshot {
  waveNumber: number;
  startCurrency: number;
  startScore: number;
  startKills: number;
}

// ---------------------------------------------------------------------------
// HudSystem
// ---------------------------------------------------------------------------

export class HudSystem extends BaseSystem {
  // --- HUD bar elements ---
  private hudBarBg: Phaser.GameObjects.Graphics | null = null;
  private currencyText: Phaser.GameObjects.Text | null = null;
  private scoreText: Phaser.GameObjects.Text | null = null;
  private waveText: Phaser.GameObjects.Text | null = null;
  private countdownText: Phaser.GameObjects.Text | null = null;
  private startEarlyText: Phaser.GameObjects.Text | null = null;
  private speedButton: Phaser.GameObjects.Text | null = null;
  private pauseButton: Phaser.GameObjects.Text | null = null;

  // --- Objective HP bar ---
  private objBarGraphics: Phaser.GameObjects.Graphics | null = null;
  private objBarText: Phaser.GameObjects.Text | null = null;

  // --- Floating texts ---
  private activeFloatingTexts: Phaser.GameObjects.Text[] = [];

  // --- Wave summary overlay ---
  private waveSummaryContainer: Phaser.GameObjects.Container | null = null;
  private waveSummaryTimer: Phaser.Time.TimerEvent | null = null;

  // --- Tooltips ---
  private tooltipContainer: Phaser.GameObjects.Container | null = null;
  private tooltipHoverTimer: Phaser.Time.TimerEvent | null = null;

  // --- Enemy badges ---
  private badgeGraphics: Phaser.GameObjects.Graphics | null = null;

  // --- Coach marks ---
  private coachMarkContainer: Phaser.GameObjects.Container | null = null;
  private buildCoachShown = false;
  private upgradeCoachShown = false;

  // --- Wave preview ---
  private wavePreviewContainer: Phaser.GameObjects.Container | null = null;
  private upcomingComposition: CompositionSummaryEntry[] = [];

  // --- Per-wave tracking ---
  private waveSnapshot: PerWaveSnapshot | null = null;
  private runningKills = 0;

  // --- System references (resolved at init) ---
  private waveSystemRef: {
    getState(): string;
    getPrepTimeRemaining(): number;
    getUpcomingComposition(): CompositionSummaryEntry[];
    triggerEarlyStart(): void;
  } | null = null;

  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Creates all HUD visual elements and registers event listeners.
   */
  init(): void {
    /* Resolve system references from registry. */
    this.waveSystemRef = this.scene.registry.get('waveSystem') as typeof this.waveSystemRef ?? null;

    /* Store self on registry so GameStateManager can query wave summary state. */
    this.scene.registry.set('hudSystem', this);

    /* --- Create HUD bar --- */
    this.createHudBar();

    /* --- Create objective HP bar --- */
    this.objBarGraphics = this.scene.add.graphics();
    this.objBarGraphics.setDepth(DEPTH_UI);
    this.objBarText = this.scene.add.text(
      GAME_WIDTH / 2, OBJ_BAR_Y + OBJ_BAR_HEIGHT / 2,
      `${this.gameState.objectiveHp} / ${this.gameState.maxObjectiveHp}`,
      { fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF' },
    ).setOrigin(0.5).setDepth(DEPTH_UI);

    /* --- Create badge Graphics --- */
    this.badgeGraphics = this.scene.add.graphics();
    this.badgeGraphics.setDepth(DEPTH_UI);

    /* --- Register event listeners --- */
    this.listen(GAME_EVENTS.CURRENCY_CHANGED, this.onCurrencyChanged as (...args: never[]) => void);
    this.listen(GAME_EVENTS.SCORE_CHANGED, this.onScoreChanged as (...args: never[]) => void);
    this.listen(GAME_EVENTS.WAVE_STARTED, this.onWaveStarted as (...args: never[]) => void);
    this.listen(GAME_EVENTS.WAVE_COMPLETED, this.onWaveCompleted as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TOWER_UPGRADED, this.onTowerUpgraded as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TOWER_REPAIRED, this.onTowerRepaired as (...args: never[]) => void);
    this.listen(GAME_EVENTS.ENEMY_DIED, this.onEnemyDied as (...args: never[]) => void);

    /* Initialize localStorage coach mark flags. */
    try {
      this.buildCoachShown = localStorage.getItem('td_onboard_build') !== null;
      this.upgradeCoachShown = localStorage.getItem('td_onboard_upgrade') !== null;
    } catch {
      /* localStorage unavailable (e.g., private mode) -- treat as shown. */
      this.buildCoachShown = true;
      this.upgradeCoachShown = true;
    }

    /* Initialize default game settings on registry if not already set. */
    if (!this.scene.registry.get('gameSettings')) {
      this.scene.registry.set('gameSettings', {
        sfxVolume: 100,
        musicVolume: 100,
        reduceVisualIntensity: false,
      });
    }
  }

  /**
   * Per-frame update: redraws objective HP bar, enemy badges, countdown,
   * and wave preview.
   */
  update(time: number, _delta: number): void {
    this.drawObjectiveHpBar(time);
    this.drawEnemyBadges();
    this.updatePrepDisplay();
    this.updateHudValues();
  }

  /**
   * Cleans up all HUD elements, floating texts, overlays, and tooltips.
   */
  destroy(): void {
    /* Destroy HUD bar elements. */
    this.hudBarBg?.destroy();
    this.currencyText?.destroy();
    this.scoreText?.destroy();
    this.waveText?.destroy();
    this.countdownText?.destroy();
    this.startEarlyText?.destroy();
    this.speedButton?.destroy();
    this.pauseButton?.destroy();

    /* Destroy objective HP bar. */
    this.objBarGraphics?.destroy();
    this.objBarText?.destroy();

    /* Destroy floating texts. */
    for (const ft of this.activeFloatingTexts) {
      this.scene.tweens.killTweensOf(ft);
      ft.destroy();
    }
    this.activeFloatingTexts = [];

    /* Destroy wave summary. */
    this.dismissWaveSummary();

    /* Destroy tooltips. */
    this.destroyTooltip();

    /* Destroy badges. */
    this.badgeGraphics?.destroy();

    /* Destroy coach marks. */
    this.coachMarkContainer?.destroy();

    /* Destroy wave preview. */
    this.wavePreviewContainer?.destroy();

    /* Remove from registry. */
    this.scene.registry.remove('hudSystem');

    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API (for GameStateManager escape priority chain)
  // ---------------------------------------------------------------------------

  /** Returns true if the wave summary overlay is currently visible. */
  isWaveSummaryVisible(): boolean {
    return this.waveSummaryContainer !== null;
  }

  /** Dismisses the wave summary overlay immediately. */
  dismissWaveSummary(): void {
    if (this.waveSummaryTimer) {
      this.waveSummaryTimer.destroy();
      this.waveSummaryTimer = null;
    }
    if (this.waveSummaryContainer) {
      this.waveSummaryContainer.destroy();
      this.waveSummaryContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // HUD Bar Creation
  // ---------------------------------------------------------------------------

  /**
   * Creates the top HUD bar with currency, score, wave counter,
   * pause button, and speed toggle button.
   */
  private createHudBar(): void {
    /* Bar background. */
    this.hudBarBg = this.scene.add.graphics();
    this.hudBarBg.setDepth(DEPTH_UI);
    this.hudBarBg.fillStyle(HUD_BAR_BG_COLOR, HUD_BAR_BG_ALPHA);
    this.hudBarBg.fillRect(0, 0, GAME_WIDTH, HUD_BAR_HEIGHT);
    this.hudBarBg.lineStyle(1, HUD_BAR_BORDER_COLOR, 1);
    this.hudBarBg.lineBetween(0, HUD_BAR_HEIGHT, GAME_WIDTH, HUD_BAR_HEIGHT);

    /* Left group: currency icon (gold circle) + currency amount. */
    const goldIcon = this.scene.add.graphics();
    goldIcon.fillStyle(0xFFD700, 1);
    goldIcon.fillCircle(HUD_PADDING_X + 6, HUD_BAR_HEIGHT / 2, 6);
    goldIcon.setDepth(DEPTH_UI);

    this.currencyText = this.scene.add.text(
      HUD_PADDING_X + 18, HUD_BAR_HEIGHT / 2,
      `${this.gameState.currency}`,
      { fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
    ).setOrigin(0, 0.5).setDepth(DEPTH_UI);

    /* Score label + value. */
    this.scoreText = this.scene.add.text(
      HUD_PADDING_X + 120, HUD_BAR_HEIGHT / 2,
      `Score: ${this.gameState.score}`,
      { fontSize: '13px', fontFamily: 'monospace', color: '#E0E0E0' },
    ).setOrigin(0, 0.5).setDepth(DEPTH_UI);

    /* Center group: wave counter. */
    this.waveText = this.scene.add.text(
      GAME_WIDTH / 2, HUD_BAR_HEIGHT / 2 - 4,
      `Wave ${this.gameState.currentWave} / ${this.gameState.totalWaves}`,
      { fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#E0E0E0' },
    ).setOrigin(0.5).setDepth(DEPTH_UI);

    /* Countdown text (visible during PREP). */
    this.countdownText = this.scene.add.text(
      GAME_WIDTH / 2 - 60, HUD_BAR_HEIGHT / 2 + 10,
      '',
      { fontSize: '13px', fontFamily: 'monospace', color: '#FFD700' },
    ).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false);

    /* Start Early button (visible during PREP). */
    this.startEarlyText = this.scene.add.text(
      GAME_WIDTH / 2 + 40, HUD_BAR_HEIGHT / 2 + 10,
      '[Start Early]',
      { fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4A90D9' },
    ).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.startEarlyText.on('pointerover', () => this.startEarlyText?.setColor('#6AB0FF'));
    this.startEarlyText.on('pointerout', () => this.startEarlyText?.setColor('#4A90D9'));
    this.startEarlyText.on('pointerdown', () => {
      this.waveSystemRef?.triggerEarlyStart();
    });

    /* Right group: speed toggle button. */
    this.speedButton = this.scene.add.text(
      GAME_WIDTH - HUD_PADDING_X - 60, HUD_BAR_HEIGHT / 2,
      '1x',
      { fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
        backgroundColor: '#2A2A4A', padding: { x: 8, y: 4 } },
    ).setOrigin(0.5).setDepth(DEPTH_UI).setInteractive({ useHandCursor: true });

    this.speedButton.on('pointerdown', () => {
      const gsm = this.scene.registry.get('gameStateManager') as
        { toggleSpeed(): void; getSpeedMultiplier(): number } | undefined;
      gsm?.toggleSpeed();
      const newSpeed = gsm?.getSpeedMultiplier() ?? 1;
      this.speedButton?.setText(`${newSpeed}x`);
    });

    /* Pause button. */
    this.pauseButton = this.scene.add.text(
      GAME_WIDTH - HUD_PADDING_X - 20, HUD_BAR_HEIGHT / 2,
      '||',
      { fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
        backgroundColor: '#2A2A4A', padding: { x: 8, y: 4 } },
    ).setOrigin(0.5).setDepth(DEPTH_UI).setInteractive({ useHandCursor: true });

    this.pauseButton.on('pointerdown', () => {
      const gsm = this.scene.registry.get('gameStateManager') as
        { togglePause(): void } | undefined;
      gsm?.togglePause();
    });
  }

  // ---------------------------------------------------------------------------
  // Per-Frame Updates
  // ---------------------------------------------------------------------------

  /** Updates HUD text elements to reflect current game state. */
  private updateHudValues(): void {
    this.currencyText?.setText(`${this.gameState.currency}`);
    this.scoreText?.setText(`Score: ${this.gameState.score}`);
    this.waveText?.setText(`Wave ${this.gameState.currentWave} / ${this.gameState.totalWaves}`);
  }

  /** Updates the PREP countdown display and Start Early button visibility. */
  private updatePrepDisplay(): void {
    const waveState = this.waveSystemRef?.getState();

    if (waveState === 'PREP') {
      const remaining = this.waveSystemRef?.getPrepTimeRemaining() ?? 0;
      const seconds = Math.ceil(remaining / 1000);
      this.countdownText?.setText(`Next in: ${seconds}s`).setVisible(true);
      this.startEarlyText?.setVisible(true);

      /* Show wave preview during PREP. */
      this.updateWavePreview();
    } else {
      this.countdownText?.setVisible(false);
      this.startEarlyText?.setVisible(false);
      this.destroyWavePreview();
    }
  }

  // ---------------------------------------------------------------------------
  // Objective HP Bar
  // ---------------------------------------------------------------------------

  /**
   * Redraws the objective HP bar. Called every frame.
   * Uses Graphics clear + redraw pattern (same as EnemySystem health bars).
   */
  private drawObjectiveHpBar(time: number): void {
    if (!this.objBarGraphics) return;
    this.objBarGraphics.clear();

    const { objectiveHp, maxObjectiveHp } = this.gameState;
    const ratio = Math.max(0, objectiveHp / maxObjectiveHp);
    const barX = (GAME_WIDTH - OBJ_BAR_WIDTH) / 2;
    const dangerActive = objectiveHp <= Math.floor(maxObjectiveHp * OBJ_DANGER_THRESHOLD);

    /* Determine bar fill color. */
    let fillColor: number;
    if (dangerActive) {
      fillColor = OBJ_COLOR_DANGER;
    } else if (ratio > 0.5) {
      fillColor = OBJ_COLOR_HIGH;
    } else {
      fillColor = OBJ_COLOR_MID;
    }

    /* Compute alpha for danger pulsing (1Hz sine wave). */
    const alpha = dangerActive
      ? 0.7 + 0.3 * Math.sin(time * 0.006)
      : 1;

    /* Border. */
    this.objBarGraphics.lineStyle(1, OBJ_BAR_BORDER, 1);
    this.objBarGraphics.strokeRoundedRect(barX - 1, OBJ_BAR_Y - 1, OBJ_BAR_WIDTH + 2, OBJ_BAR_HEIGHT + 2, OBJ_BAR_CORNER_RADIUS);

    /* Background. */
    this.objBarGraphics.fillStyle(OBJ_BAR_BG, 1);
    this.objBarGraphics.fillRoundedRect(barX, OBJ_BAR_Y, OBJ_BAR_WIDTH, OBJ_BAR_HEIGHT, OBJ_BAR_CORNER_RADIUS);

    /* Fill bar (proportional to HP ratio). */
    if (ratio > 0) {
      this.objBarGraphics.fillStyle(fillColor, alpha);
      this.objBarGraphics.fillRoundedRect(barX, OBJ_BAR_Y, OBJ_BAR_WIDTH * ratio, OBJ_BAR_HEIGHT, OBJ_BAR_CORNER_RADIUS);
    }

    /* Update numeric text. */
    this.objBarText?.setText(`${objectiveHp} / ${maxObjectiveHp}`);
  }

  // ---------------------------------------------------------------------------
  // Floating Text
  // ---------------------------------------------------------------------------

  /**
   * Spawns a floating text that rises and fades out.
   *
   * @param x - World X position.
   * @param y - World Y position.
   * @param content - Text to display.
   * @param variant - Visual variant controlling font size and color.
   */
  private spawnFloatingText(
    x: number, y: number, content: string,
    variant: 'currency' | 'score' | 'bonus' | 'action',
  ): void {
    /* Enforce max concurrent floating texts. */
    if (this.activeFloatingTexts.length >= MAX_FLOATING_TEXTS) {
      const oldest = this.activeFloatingTexts.shift();
      if (oldest) {
        this.scene.tweens.killTweensOf(oldest);
        oldest.destroy();
      }
    }

    /* Determine style per variant. */
    let fontSize: string;
    let color: string;
    switch (variant) {
      case 'currency':
        fontSize = '14px';
        color = '#FFD700';
        break;
      case 'score':
        fontSize = '12px';
        color = '#E0E0E0';
        break;
      case 'bonus':
        fontSize = '15px';
        color = '#FFD700';
        break;
      case 'action':
        fontSize = '13px';
        color = '#E0E0E0';
        break;
    }

    const text = this.scene.add.text(x, y, content, {
      fontSize,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color,
    }).setOrigin(0.5).setDepth(DEPTH_FLOATING_TEXT);

    this.activeFloatingTexts.push(text);

    /* Animate: rise up, fade out, shrink slightly. */
    this.scene.tweens.add({
      targets: text,
      y: y - FLOATING_TEXT_RISE,
      alpha: 0,
      scale: 0.8,
      duration: FLOATING_TEXT_DURATION,
      ease: 'Power2',
      onComplete: () => {
        const idx = this.activeFloatingTexts.indexOf(text);
        if (idx !== -1) this.activeFloatingTexts.splice(idx, 1);
        text.destroy();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Wave Summary Overlay
  // ---------------------------------------------------------------------------

  /**
   * Creates the wave summary overlay showing per-wave performance.
   */
  private showWaveSummary(
    waveNumber: number,
    killsDelta: number,
    currencyDelta: number,
    scoreDelta: number,
  ): void {
    /* Destroy any existing overlay. */
    this.dismissWaveSummary();

    const container = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    container.setDepth(DEPTH_OVERLAY);

    /* Background. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(OVERLAY_BG_COLOR, OVERLAY_BG_ALPHA);
    bg.fillRoundedRect(-WAVE_SUMMARY_WIDTH / 2, -90, WAVE_SUMMARY_WIDTH, 180, OVERLAY_CORNER_RADIUS);
    bg.lineStyle(1, HUD_BAR_BORDER_COLOR, 1);
    bg.strokeRoundedRect(-WAVE_SUMMARY_WIDTH / 2, -90, WAVE_SUMMARY_WIDTH, 180, OVERLAY_CORNER_RADIUS);
    container.add(bg);

    /* Header: "Wave N Complete". */
    const header = this.scene.add.text(0, -70, `Wave ${waveNumber} Complete`, {
      fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#E0E0E0',
    }).setOrigin(0.5);
    container.add(header);

    /* Separator line. */
    const sep = this.scene.add.graphics();
    sep.lineStyle(1, HUD_BAR_BORDER_COLOR, 1);
    sep.lineBetween(-WAVE_SUMMARY_WIDTH / 2 + 10, -48, WAVE_SUMMARY_WIDTH / 2 - 10, -48);
    container.add(sep);

    /* Stat rows. */
    const statStyle = { fontSize: '14px', fontFamily: 'monospace', color: '#E0E0E0' };
    const killsText = this.scene.add.text(0, -28, `Enemies Killed: ${killsDelta}`, statStyle).setOrigin(0.5);
    const currText = this.scene.add.text(0, -4, `Currency Earned: +${currencyDelta}`, {
      ...statStyle, color: '#FFD700',
    }).setOrigin(0.5);
    const scoreStatText = this.scene.add.text(0, 20, `Score Earned: +${scoreDelta}`, statStyle).setOrigin(0.5);
    container.add([killsText, currText, scoreStatText]);

    /* Continue hint. */
    const hint = this.scene.add.text(0, 56, 'Click to continue', {
      fontSize: '12px', fontFamily: 'monospace', color: '#E0E0E0',
    }).setOrigin(0.5).setAlpha(0.6);
    container.add(hint);

    /* Make background interactive for click-to-dismiss. */
    bg.setInteractive(
      new Phaser.Geom.Rectangle(-WAVE_SUMMARY_WIDTH / 2, -90, WAVE_SUMMARY_WIDTH, 180),
      Phaser.Geom.Rectangle.Contains,
    );
    bg.on('pointerdown', () => this.dismissWaveSummary());

    this.waveSummaryContainer = container;

    /* Auto-dismiss after 5 seconds with fade. */
    this.waveSummaryTimer = this.scene.time.delayedCall(WAVE_SUMMARY_AUTO_DISMISS_MS, () => {
      if (this.waveSummaryContainer) {
        this.scene.tweens.add({
          targets: this.waveSummaryContainer,
          alpha: 0,
          duration: WAVE_SUMMARY_FADE_MS,
          onComplete: () => this.dismissWaveSummary(),
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Wave Preview
  // ---------------------------------------------------------------------------

  /** Shows enemy type badges for the upcoming wave during PREP. */
  private updateWavePreview(): void {
    if (this.upcomingComposition.length === 0) {
      this.destroyWavePreview();
      return;
    }

    /* Recreate preview container each frame (simple approach for dynamic data). */
    this.destroyWavePreview();

    this.wavePreviewContainer = this.scene.add.container(GAME_WIDTH / 2, HUD_BAR_HEIGHT + 4);
    this.wavePreviewContainer.setDepth(DEPTH_UI);

    let offsetX = -(this.upcomingComposition.length * 40) / 2;

    for (const entry of this.upcomingComposition) {
      /* Colored circle badge. */
      const badge = this.scene.add.graphics();
      const color = ENEMY_BADGE_COLORS[entry.enemyId] ?? 0xCCCCCC;
      badge.fillStyle(color, 1);
      badge.fillCircle(offsetX, 6, 4);
      this.wavePreviewContainer.add(badge);

      /* Count text. */
      const countText = this.scene.add.text(
        offsetX + 8, 6,
        `x${entry.count}`,
        { fontSize: '11px', fontFamily: 'monospace', color: '#E0E0E0' },
      ).setOrigin(0, 0.5);
      this.wavePreviewContainer.add(countText);

      offsetX += 40;
    }
  }

  /** Destroys the wave preview container. */
  private destroyWavePreview(): void {
    if (this.wavePreviewContainer) {
      this.wavePreviewContainer.destroy();
      this.wavePreviewContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Tooltips
  // ---------------------------------------------------------------------------

  /**
   * Shows a tooltip with the given content at the specified position.
   */
  private showTooltip(x: number, y: number, lines: string[]): void {
    this.destroyTooltip();

    const container = this.scene.add.container(x, y - 10);
    container.setDepth(DEPTH_TOOLTIP);

    /* Calculate content height. */
    const lineHeight = 16;
    const totalHeight = TOOLTIP_PADDING * 2 + lines.length * lineHeight;
    const totalWidth = TOOLTIP_MAX_WIDTH;

    /* Background. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA);
    bg.fillRoundedRect(-totalWidth / 2, -totalHeight, totalWidth, totalHeight, TOOLTIP_CORNER_RADIUS);
    bg.lineStyle(1, TOOLTIP_BORDER_COLOR, 1);
    bg.strokeRoundedRect(-totalWidth / 2, -totalHeight, totalWidth, totalHeight, TOOLTIP_CORNER_RADIUS);
    container.add(bg);

    /* Text lines. */
    let textY = -totalHeight + TOOLTIP_PADDING;
    for (let i = 0; i < lines.length; i++) {
      const isHeader = i === 0;
      const text = this.scene.add.text(
        -totalWidth / 2 + TOOLTIP_PADDING, textY,
        lines[i]!,
        {
          fontSize: isHeader ? '13px' : '12px',
          fontFamily: 'monospace',
          fontStyle: isHeader ? 'bold' : 'normal',
          color: '#E0E0E0',
          wordWrap: { width: totalWidth - TOOLTIP_PADDING * 2 },
        },
      );
      container.add(text);
      textY += lineHeight;
    }

    /* Clamp to canvas bounds. */
    const minX = totalWidth / 2;
    const maxX = GAME_WIDTH - totalWidth / 2;
    container.x = Math.max(minX, Math.min(maxX, container.x));
    if (container.y - totalHeight < 0) {
      container.y = totalHeight + 10;
    }

    this.tooltipContainer = container;
  }

  /** Destroys the current tooltip. */
  private destroyTooltip(): void {
    if (this.tooltipHoverTimer) {
      this.tooltipHoverTimer.destroy();
      this.tooltipHoverTimer = null;
    }
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Enemy Type Badges (Colorblind Accessibility)
  // ---------------------------------------------------------------------------

  /**
   * Draws shape badges next to each active enemy's health bar.
   * Uses a shared Graphics object cleared and redrawn every frame.
   */
  private drawEnemyBadges(): void {
    if (!this.badgeGraphics) return;
    this.badgeGraphics.clear();

    const enemySystem = this.scene.registry.get('enemySystem') as
      { getActiveEnemies(): Enemy[] } | undefined;
    if (!enemySystem) return;

    const enemies = enemySystem.getActiveEnemies();

    for (const enemy of enemies) {
      if (enemy.state !== EnemyState.MOVING) continue;

      const sprite = enemy.sprite;
      if (!sprite.active) continue;

      /* Position: 2px to the left of the health bar, vertically centered. */
      const barX = sprite.x - (sprite.displayWidth / 2);
      const barY = sprite.y - (sprite.displayHeight / 2 + 6);
      const badgeX = barX - 10;
      const badgeY = barY + 2;

      const enemyType = enemy.definition.id;
      const color = ENEMY_BADGE_COLORS[enemyType] ?? 0xCCCCCC;
      this.badgeGraphics.fillStyle(color, 1);

      /* Draw shape per archetype. */
      switch (enemyType) {
        case 'runner':
          /* Circle (filled), 8px diameter. */
          this.badgeGraphics.fillCircle(badgeX, badgeY, 4);
          break;
        case 'tank':
          /* Diamond (45-degree rotated square), 8px diagonal. */
          this.badgeGraphics.fillPoints([
            new Phaser.Geom.Point(badgeX, badgeY - 4),
            new Phaser.Geom.Point(badgeX + 4, badgeY),
            new Phaser.Geom.Point(badgeX, badgeY + 4),
            new Phaser.Geom.Point(badgeX - 4, badgeY),
          ], true);
          break;
        case 'fast':
          /* Triangle pointing right, 8px base. */
          this.badgeGraphics.fillTriangle(
            badgeX - 4, badgeY - 4,
            badgeX + 4, badgeY,
            badgeX - 4, badgeY + 4,
          );
          break;
        case 'flyer':
          /* 4-point star, 8px span. */
          this.badgeGraphics.fillPoints([
            new Phaser.Geom.Point(badgeX, badgeY - 4),
            new Phaser.Geom.Point(badgeX + 1.5, badgeY - 1.5),
            new Phaser.Geom.Point(badgeX + 4, badgeY),
            new Phaser.Geom.Point(badgeX + 1.5, badgeY + 1.5),
            new Phaser.Geom.Point(badgeX, badgeY + 4),
            new Phaser.Geom.Point(badgeX - 1.5, badgeY + 1.5),
            new Phaser.Geom.Point(badgeX - 4, badgeY),
            new Phaser.Geom.Point(badgeX - 1.5, badgeY - 1.5),
          ], true);
          break;
        case 'swarm':
          /* Square (filled), 6px side. */
          this.badgeGraphics.fillRect(badgeX - 3, badgeY - 3, 6, 6);
          break;
        default:
          /* Unknown type -- draw a small circle fallback. */
          this.badgeGraphics.fillCircle(badgeX, badgeY, 3);
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Coach Marks (Onboarding)
  // ---------------------------------------------------------------------------

  /**
   * Shows the build menu coach mark if it hasn't been shown before.
   * Triggered on wave 1 PREP.
   */
  private showBuildCoachMark(): void {
    if (this.buildCoachShown) return;
    this.buildCoachShown = true;

    try {
      localStorage.setItem('td_onboard_build', '1');
    } catch { /* localStorage unavailable -- silently continue. */ }

    this.showCoachMark(
      GAME_WIDTH - 120, GAME_HEIGHT / 2,
      'Click a tower to start building! Place towers on green tiles to defend against enemies.',
    );
  }

  /**
   * Shows the upgrade panel coach mark if it hasn't been shown before.
   * Triggered on first tower click.
   */
  private showUpgradeCoachMark(x: number, y: number): void {
    if (this.upgradeCoachShown) return;
    this.upgradeCoachShown = true;

    try {
      localStorage.setItem('td_onboard_upgrade', '1');
    } catch { /* localStorage unavailable. */ }

    this.showCoachMark(
      x, y - 50,
      'Click a placed tower to upgrade it! Upgrades improve damage, speed, and range.',
    );
  }

  /**
   * Creates a coach mark overlay with instructional text.
   */
  private showCoachMark(x: number, y: number, text: string): void {
    /* Only one coach mark at a time. */
    this.coachMarkContainer?.destroy();

    const container = this.scene.add.container(x, y);
    container.setDepth(DEPTH_OVERLAY);

    /* Background. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(OVERLAY_BG_COLOR, COACH_MARK_BG_ALPHA);
    bg.fillRoundedRect(-COACH_MARK_WIDTH / 2, -50, COACH_MARK_WIDTH, 100, OVERLAY_CORNER_RADIUS);
    bg.lineStyle(2, 0x4A90D9, 1);
    bg.strokeRoundedRect(-COACH_MARK_WIDTH / 2, -50, COACH_MARK_WIDTH, 100, OVERLAY_CORNER_RADIUS);
    container.add(bg);

    /* Hint text. */
    const hintText = this.scene.add.text(0, -20, text, {
      fontSize: '13px', fontFamily: 'monospace', color: '#E0E0E0',
      wordWrap: { width: COACH_MARK_WIDTH - 24 },
      align: 'center',
    }).setOrigin(0.5);
    container.add(hintText);

    /* "Got it" button. */
    const gotIt = this.scene.add.text(0, 30, 'Got it', {
      fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4A90D9',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    gotIt.on('pointerdown', () => this.dismissCoachMark());
    container.add(gotIt);

    /* X dismiss button. */
    const dismissX = this.scene.add.text(
      COACH_MARK_WIDTH / 2 - 16, -42, 'X', {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
      },
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });
    dismissX.on('pointerdown', () => this.dismissCoachMark());
    container.add(dismissX);

    /* Click-outside dismiss: use a full-screen invisible interactive zone behind. */
    const clickAway = this.scene.add.graphics();
    clickAway.fillStyle(0x000000, 0.01);
    clickAway.fillRect(-x, -y, GAME_WIDTH, GAME_HEIGHT);
    clickAway.setInteractive(
      new Phaser.Geom.Rectangle(-x, -y, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    );
    clickAway.on('pointerdown', () => this.dismissCoachMark());
    container.addAt(clickAway, 0);

    this.coachMarkContainer = container;
  }

  /** Destroys the current coach mark. */
  private dismissCoachMark(): void {
    if (this.coachMarkContainer) {
      this.coachMarkContainer.destroy();
      this.coachMarkContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /** Updates currency display and spawns floating reward text. */
  private onCurrencyChanged(payload: CurrencyChangedPayload): void {
    this.currencyText?.setText(`${payload.newAmount}`);

    /* Only show floating text for kill rewards and wave/early bonuses. */
    if (payload.delta > 0 && (
      payload.reason === 'enemy_kill' ||
      payload.reason === 'wave_bonus' ||
      payload.reason === 'early_start_bonus'
    )) {
      const variant = payload.reason === 'enemy_kill' ? 'currency' : 'bonus';
      const content = payload.reason === 'enemy_kill'
        ? `+${payload.delta}`
        : `+${payload.delta} Bonus!`;

      /* For kill rewards, use the position from the most recent ENEMY_DIED.
       * For wave bonuses, show near the HUD currency display. */
      if (payload.reason === 'enemy_kill') {
        /* Position will be set by the preceding ENEMY_DIED handler. */
        this.pendingCurrencyRewardDelta = payload.delta;
      } else {
        this.spawnFloatingText(HUD_PADDING_X + 50, HUD_BAR_HEIGHT + 20, content, variant);
      }
    }
  }

  /** Tracks the last enemy death position for floating text placement. */
  private lastEnemyDeathPos: { x: number; y: number } | null = null;
  private pendingCurrencyRewardDelta = 0;

  /** Updates score display. */
  private onScoreChanged(payload: ScoreChangedPayload): void {
    this.scoreText?.setText(`Score: ${payload.newScore}`);
  }

  /** Handles ENEMY_DIED: records kill position for floating text, increments running kills. */
  private onEnemyDied(payload: { position: { x: number; y: number } }): void {
    this.runningKills++;
    this.lastEnemyDeathPos = payload.position;

    /* Spawn currency floating text at kill location if there's a pending delta. */
    if (this.pendingCurrencyRewardDelta > 0) {
      this.spawnFloatingText(
        payload.position.x, payload.position.y,
        `+${this.pendingCurrencyRewardDelta}`,
        'currency',
      );
      this.pendingCurrencyRewardDelta = 0;
    }
  }

  /**
   * Handles WAVE_STARTED: updates wave display, caches composition,
   * snapshots game state for per-wave deltas, shows build coach mark on wave 1.
   */
  private onWaveStarted(payload: WaveStartedPayload): void {
    this.waveText?.setText(`Wave ${payload.waveNumber} / ${payload.totalWaves}`);
    this.upcomingComposition = payload.upcomingComposition;

    /* Snapshot current state for per-wave delta tracking. */
    this.waveSnapshot = {
      waveNumber: payload.waveNumber,
      startCurrency: this.gameState.currency,
      startScore: this.gameState.score,
      startKills: this.runningKills,
    };

    /* Show build coach mark on wave 1. */
    if (payload.waveNumber === 1) {
      this.showBuildCoachMark();
    }
  }

  /**
   * Handles WAVE_COMPLETED: shows wave summary overlay with per-wave deltas.
   * Skips the summary for the final wave (victory screen takes precedence).
   */
  private onWaveCompleted(payload: WaveCompletedPayload): void {
    /* Don't show summary for final wave -- victory screen handles it. */
    if (payload.waveNumber >= payload.totalWaves) return;

    /* Compute per-wave deltas from snapshot. */
    const snapshot = this.waveSnapshot;
    const killsDelta = snapshot ? this.runningKills - snapshot.startKills : 0;
    const currencyDelta = snapshot ? this.gameState.currency - snapshot.startCurrency : 0;
    const scoreDelta = snapshot ? this.gameState.score - snapshot.startScore : 0;

    this.showWaveSummary(payload.waveNumber, killsDelta, currencyDelta, scoreDelta);
  }

  /** Handles TOWER_UPGRADED: spawns floating "Upgraded!" text at tower. */
  private onTowerUpgraded(payload: TowerUpgradedPayload): void {
    /* Resolve tower position from registry. */
    const towerRegistry = this.scene.registry.get('towerRegistry') as
      { getTowerById(id: string): { worldX: number; worldY: number } | null } | undefined;
    const tower = towerRegistry?.getTowerById(payload.towerId);
    if (tower) {
      this.spawnFloatingText(tower.worldX, tower.worldY - 20, 'Upgraded!', 'action');
    }
  }

  /** Handles TOWER_REPAIRED: spawns floating "Repaired!" text at tower. */
  private onTowerRepaired(payload: TowerRepairedPayload): void {
    const towerRegistry = this.scene.registry.get('towerRegistry') as
      { getTowerById(id: string): { worldX: number; worldY: number } | null } | undefined;
    const tower = towerRegistry?.getTowerById(payload.towerId);
    if (tower) {
      this.spawnFloatingText(tower.worldX, tower.worldY - 20, 'Repaired!', 'action');
    }
  }
}
