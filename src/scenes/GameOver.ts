/**
 * Game Over scene -- full results screen with victory/defeat differentiation,
 * run stats, session-best badge, XP earned display, and navigation.
 *
 * Replaces the BOLT-001 stub. Receives extended GameOverData from
 * GameStateManager via scene.start() data parameter.
 *
 * BOLT-009 implementation. BOLT-016 adds fade transitions and stat animation.
 * BOLT-024: Replaces level-up notification with XP earned + Available XP display.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-constants';
import { fadeTransition, fadeIn, staggerFadeIn, countUp } from '../ui/ui-animations';
import type { ProgressionManager } from '../utils/progression-manager';
import type { XPResult as SkillTreeXPResult } from '../utils/skill-tree-manager';

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

/* XP bar constants removed by BOLT-024 -- replaced by text-only XP display. */

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

    /* BOLT-024: Apply XP from this run via SkillTreeManager.
     * The XP result drives the XP earned and available XP displays. */
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

    /* --- BOLT-024: XP Earned Section (replaces BOLT-021 XP bar) --- */
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

    /* --- Skill Tree Button (BOLT-024) --- */
    this.createButton(
      GAME_WIDTH / 2, playY + BTN_PLAY_HEIGHT + 16,
      BTN_MENU_WIDTH, BTN_MENU_HEIGHT,
      'Skill Tree',
      { fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      () => {
        /* BOLT-025 will register 'SkillTree' scene. Check before switching. */
        if (this.scene.manager.getScene('SkillTree')) {
          fadeTransition(this, () => this.scene.start('SkillTree'));
        }
      },
    );

    /* --- Main Menu Button --- */
    this.createButton(
      GAME_WIDTH / 2, playY + BTN_PLAY_HEIGHT + 16 + BTN_MENU_HEIGHT + 12,
      BTN_MENU_WIDTH, BTN_MENU_HEIGHT,
      'Main Menu',
      { fontSize: '18px', fontFamily: 'monospace', color: '#AAAAAA' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      /* BOLT-016: Fade out before scene switch. */
      () => fadeTransition(this, () => this.scene.start(SCENE_KEYS.MAIN_MENU)),
    );
  }

  // ---------------------------------------------------------------------------
  // BOLT-024: XP and Progression
  // ---------------------------------------------------------------------------

  /**
   * Applies run XP to the SkillTreeManager via ProgressionManager.
   * Returns the SkillTreeManager's XPResult (base XP, boosted XP, available XP).
   *
   * @param totalKills - Enemies killed in the run.
   * @param wavesSurvived - Waves completed in the run.
   * @param bossKills - Boss enemies killed in the run.
   * @returns Skill tree XP result or null if progression is unavailable.
   */
  private applyRunXP(
    totalKills: number,
    wavesSurvived: number,
    bossKills: number,
  ): SkillTreeXPResult | null {
    const pm = this.registry.get('progressionManager') as ProgressionManager | undefined;
    if (!pm) return null;

    /* BOLT-024: Use SkillTreeManager directly for XP application.
     * applyRunXP applies the global xpMultiplier before adding to totalXpEarned. */
    const skillTree = pm.getSkillTreeManager();
    return skillTree.applyRunXP({ totalKills, wavesSurvived, bossKills });
  }

  /**
   * Renders the XP earned section: XP gained text (with boost breakdown
   * if xpMultiplier > 1), and the new Available XP balance.
   * Replaces the old BOLT-021 XP bar and level-up notifications.
   *
   * @param xpResult - Result from SkillTreeManager.applyRunXP().
   * @param y - Y position for the XP section.
   */
  private renderXPSection(xpResult: SkillTreeXPResult, y: number): void {
    const centerX = GAME_WIDTH / 2;

    /* XP earned headline. */
    this.add.text(
      centerX, y,
      `XP Earned: +${xpResult.xpGained}`,
      { fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4A90D9' },
    ).setOrigin(0.5);

    /* Show XP boost breakdown if the multiplier was active.
     * baseXpGained differs from xpGained when xpMultiplier > 1. */
    if (xpResult.baseXpGained !== xpResult.xpGained) {
      this.add.text(
        centerX, y + 26,
        `(Base: ${xpResult.baseXpGained} + XP Boost: +${xpResult.xpGained - xpResult.baseXpGained})`,
        { fontSize: '13px', fontFamily: 'monospace', color: '#88AACC' },
      ).setOrigin(0.5);
    }

    /* Available XP after this run. */
    this.add.text(
      centerX, y + 54,
      `Available XP: ${xpResult.availableXp}`,
      { fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
    ).setOrigin(0.5);

    /* Total lifetime earned (secondary stat). */
    this.add.text(
      centerX, y + 78,
      `Total Earned: ${xpResult.totalXpEarned}`,
      { fontSize: '12px', fontFamily: 'monospace', color: '#666666' },
    ).setOrigin(0.5);
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
