/**
 * Game Over scene -- full results screen with victory/defeat differentiation,
 * run stats, session-best badge, XP bar, level-up notification, and navigation.
 *
 * Replaces the BOLT-001 stub. Receives extended GameOverData from
 * GameStateManager via scene.start() data parameter.
 *
 * BOLT-009 implementation. BOLT-016 adds fade transitions and stat animation.
 * BOLT-021 adds XP bar, level-up notifications, and meta-progression integration.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-constants';
import { fadeTransition, fadeIn, staggerFadeIn, countUp } from '../ui/ui-animations';
import type { ProgressionManager, XPResult } from '../utils/progression-manager';

/** Extended data passed from GameStateManager when transitioning to GameOver. */
interface GameOverData {
  victory: boolean;
  score: number;
  wavesSurvived: number;
  totalKills: number;
  objectiveHpRemaining: number;
  isNewSessionBest: boolean;
  /** BOLT-021: Boss kills for XP calculation. */
  bossKills?: number;
}

/** Button styling constants. */
const BTN_PLAY_WIDTH = 240;
const BTN_PLAY_HEIGHT = 48;
const BTN_MENU_WIDTH = 200;
const BTN_MENU_HEIGHT = 40;
const BTN_PLAY_BG = 0x2A4A2A;
const BTN_PLAY_HOVER = 0x3A6A3A;
const BTN_MENU_BG = 0x2A2A4A;
const BTN_MENU_HOVER = 0x3A3A6A;
const BTN_CORNER_RADIUS = 6;

/** XP bar dimensions (BOLT-021). */
const XP_BAR_WIDTH = 300;
const XP_BAR_HEIGHT = 16;
const XP_BAR_BG_COLOR = 0x333333;
const XP_BAR_FILL_COLOR = 0x4A90D9;
const XP_BAR_LEVELUP_COLOR = 0xFFD700;
const XP_BAR_CORNER_RADIUS = 4;

export class GameOver extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME_OVER });
  }

  /**
   * Builds the full results screen with victory/defeat differentiation,
   * stats display, session-best badge, XP bar, and navigation buttons.
   *
   * Data source priority:
   * 1. Scene data passed via scene.start(key, data) -- primary
   * 2. Registry 'gameOverData' -- fallback for when scene data is lost
   *    during the delayedCall + scene transition lifecycle
   *
   * @param data - Run results passed from GameStateManager (may be empty).
   */
  create(data: GameOverData): void {
    /* Resolve data: prefer scene.start data, fall back to registry.
     * Phaser's scene.start data parameter can be lost when the originating
     * scene shuts down during a delayedCall callback. The registry
     * survives scene transitions because it lives on the Game instance. */
    const resolvedData: GameOverData | undefined =
      (data && typeof data.victory === 'boolean')
        ? data
        : (this.registry.get('gameOverData') as GameOverData | undefined);

    /* Clean up registry entry after reading (prevent stale data on replay). */
    this.registry.remove('gameOverData');

    /* Safe defaults for all fields. */
    const victory = resolvedData?.victory ?? false;
    const score = resolvedData?.score ?? 0;
    const wavesSurvived = resolvedData?.wavesSurvived ?? 0;
    const totalKills = resolvedData?.totalKills ?? 0;
    const objectiveHpRemaining = resolvedData?.objectiveHpRemaining ?? 0;
    const isNewSessionBest = resolvedData?.isNewSessionBest ?? false;
    const bossKills = resolvedData?.bossKills ?? 0;

    /* BOLT-021: Apply XP from this run before rendering the UI.
     * The XP result drives the XP bar and level-up notification. */
    const xpResult = this.applyRunXP(totalKills, wavesSurvived, bossKills);

    /* --- Background --- */
    this.cameras.main.setBackgroundColor('#1A1A2E');

    /* BOLT-016: Fade in from black on scene entry. */
    fadeIn(this);

    /* --- Outcome Header --- */
    const headerText = victory ? 'VICTORY' : 'DEFEAT';
    const headerColor = victory ? '#4AFF4A' : '#FF4A4A';

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.15, headerText, {
      fontSize: '56px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: headerColor,
    }).setOrigin(0.5);

    /* --- Session-Best Badge (conditional) --- */
    if (isNewSessionBest) {
      const badge = this.add.text(
        GAME_WIDTH / 2, GAME_HEIGHT * 0.15 + 50,
        'NEW BEST!',
        { fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
      ).setOrigin(0.5);

      /* Pulsing alpha animation (0.8 - 1.0). */
      this.tweens.add({
        targets: badge,
        alpha: { from: 0.8, to: 1.0 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    /* --- Stats Block (BOLT-016: animated count-up + staggered reveal) --- */
    const statsY = GAME_HEIGHT * 0.32;
    const statStyle = {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#CCCCCC',
    };

    /* Create individual stat text objects for staggered animation. */
    const scoreText = this.add.text(GAME_WIDTH / 2, statsY, 'Final Score: 0', statStyle).setOrigin(0.5);
    countUp(this, scoreText, 0, score, 'Final Score: ');

    const statItems: Phaser.GameObjects.Text[] = [scoreText];

    if (victory) {
      const hpText = this.add.text(GAME_WIDTH / 2, statsY + 32, `Objective HP: ${objectiveHpRemaining} / 100`, statStyle).setOrigin(0.5);
      statItems.push(hpText);
    } else {
      const waveText = this.add.text(GAME_WIDTH / 2, statsY + 32, `Reached Wave: ${wavesSurvived}`, statStyle).setOrigin(0.5);
      statItems.push(waveText);
    }

    const killText = this.add.text(GAME_WIDTH / 2, statsY + 64, 'Enemies Defeated: 0', statStyle).setOrigin(0.5);
    countUp(this, killText, 0, totalKills, 'Enemies Defeated: ');
    statItems.push(killText);

    /* BOLT-016: Stagger the stat rows appearing. */
    staggerFadeIn(this, statItems, 120, 250);

    /* --- BOLT-021: XP Bar Section --- */
    if (xpResult) {
      this.renderXPSection(xpResult, GAME_HEIGHT * 0.52);
    }

    /* --- Play Again Button --- */
    const playY = GAME_HEIGHT * 0.72;
    this.createButton(
      GAME_WIDTH / 2, playY,
      BTN_PLAY_WIDTH, BTN_PLAY_HEIGHT,
      'Play Again',
      { fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF' },
      BTN_PLAY_BG, BTN_PLAY_HOVER,
      /* BOLT-016: Fade out before scene switch. */
      () => fadeTransition(this, () => this.scene.start(SCENE_KEYS.GAMEPLAY)),
    );

    /* --- Main Menu Button --- */
    this.createButton(
      GAME_WIDTH / 2, playY + BTN_PLAY_HEIGHT + 16,
      BTN_MENU_WIDTH, BTN_MENU_HEIGHT,
      'Main Menu',
      { fontSize: '18px', fontFamily: 'monospace', color: '#AAAAAA' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      /* BOLT-016: Fade out before scene switch. */
      () => fadeTransition(this, () => this.scene.start(SCENE_KEYS.MAIN_MENU)),
    );
  }

  // ---------------------------------------------------------------------------
  // BOLT-021: XP and Progression
  // ---------------------------------------------------------------------------

  /**
   * Applies run XP to the progression manager and returns the result.
   * Returns null if the progression manager is not available on the registry.
   *
   * @param totalKills - Enemies killed in the run.
   * @param wavesSurvived - Waves completed in the run.
   * @param bossKills - Boss enemies killed in the run.
   * @returns XP result or null if progression is unavailable.
   */
  private applyRunXP(totalKills: number, wavesSurvived: number, bossKills: number): XPResult | null {
    const pm = this.registry.get('progressionManager') as ProgressionManager | undefined;
    if (!pm) return null;

    return pm.applyRunXP({ totalKills, wavesSurvived, bossKills });
  }

  /**
   * Renders the XP progress section: XP gained text, progress bar, level text,
   * and level-up notification if the player leveled up.
   *
   * @param xpResult - Result from applyRunXP with all progression data.
   * @param y - Y position for the XP section.
   */
  private renderXPSection(xpResult: XPResult, y: number): void {
    const centerX = GAME_WIDTH / 2;
    const xpStyle = { fontSize: '16px', fontFamily: 'monospace', color: '#AADDFF' };

    /* XP gained line. */
    this.add.text(
      centerX, y,
      `+${xpResult.xpGained} XP`,
      { fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4A90D9' },
    ).setOrigin(0.5);

    /* Level text. */
    const levelText = xpResult.newLevel >= 10
      ? `Level ${xpResult.newLevel} (MAX)`
      : `Level ${xpResult.newLevel}`;
    this.add.text(centerX, y + 28, levelText, xpStyle).setOrigin(0.5);

    /* XP progress bar background. */
    const barX = centerX - XP_BAR_WIDTH / 2;
    const barY = y + 48;
    const barBg = this.add.graphics();
    barBg.fillStyle(XP_BAR_BG_COLOR, 1);
    barBg.fillRoundedRect(barX, barY, XP_BAR_WIDTH, XP_BAR_HEIGHT, XP_BAR_CORNER_RADIUS);

    /* Determine fill fraction. At max level, bar is full. */
    const pm = this.registry.get('progressionManager') as ProgressionManager | undefined;
    const fraction = pm?.getProgressFraction() ?? 0;
    const didLevelUp = xpResult.newLevel > xpResult.previousLevel;

    /* XP progress bar fill (animated). */
    const fillColor = didLevelUp ? XP_BAR_LEVELUP_COLOR : XP_BAR_FILL_COLOR;
    const barFill = this.add.graphics();
    barFill.fillStyle(fillColor, 1);

    /* Animate the bar filling from 0 to the target fraction. */
    const fillTarget = { value: 0 };
    this.tweens.add({
      targets: fillTarget,
      value: fraction,
      duration: 800,
      delay: 300,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        barFill.clear();
        barFill.fillStyle(fillColor, 1);
        const w = Math.max(0, XP_BAR_WIDTH * fillTarget.value);
        if (w > 0) {
          barFill.fillRoundedRect(barX, barY, w, XP_BAR_HEIGHT, XP_BAR_CORNER_RADIUS);
        }
      },
    });

    /* XP numbers below the bar. */
    if (xpResult.xpToNextLevel > 0) {
      this.add.text(
        centerX, barY + XP_BAR_HEIGHT + 6,
        `${xpResult.xpInCurrentLevel} / ${xpResult.xpToNextLevel}`,
        { fontSize: '12px', fontFamily: 'monospace', color: '#888888' },
      ).setOrigin(0.5);
    }

    /* --- Level-Up Notification --- */
    if (didLevelUp && xpResult.newUnlocks.length > 0) {
      const notifyY = barY + XP_BAR_HEIGHT + 28;
      for (let i = 0; i < xpResult.newUnlocks.length; i++) {
        const unlock = xpResult.newUnlocks[i]!;
        const text = this.add.text(
          centerX, notifyY + i * 26,
          `LEVEL UP! ${unlock.name} Unlocked!`,
          { fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
        ).setOrigin(0.5).setAlpha(0);

        /* Staggered fade-in for each unlock notification. */
        this.tweens.add({
          targets: text,
          alpha: 1,
          y: text.y - 5,
          duration: 400,
          delay: 1000 + i * 300,
          ease: 'Sine.easeOut',
        });

        /* Gentle pulsing after appearing. */
        this.tweens.add({
          targets: text,
          alpha: { from: 0.85, to: 1.0 },
          duration: 800,
          delay: 1400 + i * 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Button Helper
  // ---------------------------------------------------------------------------

  /**
   * Creates a styled interactive button.
   *
   * @param x - Center X.
   * @param y - Center Y.
   * @param width - Button width.
   * @param height - Button height.
   * @param label - Button text.
   * @param textStyle - Phaser text style config.
   * @param bgColor - Normal background color.
   * @param hoverColor - Hover background color.
   * @param onClick - Click callback.
   */
  private createButton(
    x: number, y: number,
    width: number, height: number,
    label: string,
    textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    bgColor: number,
    hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);

    this.add.text(x, y, label, textStyle).setOrigin(0.5);

    /* Interactive hit zone. */
    const hitZone = this.add.zone(x, y, width, height)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerdown', onClick);
  }
}
