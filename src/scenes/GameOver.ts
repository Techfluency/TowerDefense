/**
 * Game Over scene -- full results screen with victory/defeat differentiation,
 * run stats, session-best badge, and navigation buttons.
 *
 * Replaces the BOLT-001 stub. Receives extended GameOverData from
 * GameStateManager via scene.start() data parameter.
 *
 * BOLT-009 implementation.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

/** Extended data passed from GameStateManager when transitioning to GameOver. */
interface GameOverData {
  victory: boolean;
  score: number;
  wavesSurvived: number;
  totalKills: number;
  objectiveHpRemaining: number;
  isNewSessionBest: boolean;
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

export class GameOver extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME_OVER });
  }

  /**
   * Builds the full results screen with victory/defeat differentiation,
   * stats display, session-best badge, and navigation buttons.
   *
   * @param data - Run results passed from GameStateManager.
   */
  create(data: GameOverData): void {
    /* Safe defaults for all fields. */
    const victory = data?.victory ?? false;
    const score = data?.score ?? 0;
    const wavesSurvived = data?.wavesSurvived ?? 0;
    const totalKills = data?.totalKills ?? 0;
    const objectiveHpRemaining = data?.objectiveHpRemaining ?? 0;
    const isNewSessionBest = data?.isNewSessionBest ?? false;

    /* --- Background --- */
    this.cameras.main.setBackgroundColor('#1A1A2E');

    /* --- Outcome Header --- */
    const headerText = victory ? 'VICTORY' : 'DEFEAT';
    const headerColor = victory ? '#4AFF4A' : '#FF4A4A';

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, headerText, {
      fontSize: '56px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: headerColor,
    }).setOrigin(0.5);

    /* --- Session-Best Badge (conditional) --- */
    if (isNewSessionBest) {
      const badge = this.add.text(
        GAME_WIDTH / 2, GAME_HEIGHT * 0.2 + 50,
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

    /* --- Stats Block --- */
    const statsY = GAME_HEIGHT * 0.4;
    const statLines: string[] = [`Final Score: ${score}`];

    if (victory) {
      statLines.push(`Objective HP: ${objectiveHpRemaining} / 100`);
    } else {
      statLines.push(`Reached Wave: ${wavesSurvived}`);
    }
    statLines.push(`Enemies Defeated: ${totalKills}`);

    this.add.text(GAME_WIDTH / 2, statsY, statLines.join('\n'), {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#CCCCCC',
      align: 'center',
      lineSpacing: 12,
    }).setOrigin(0.5);

    /* --- Play Again Button --- */
    const playY = GAME_HEIGHT * 0.65;
    this.createButton(
      GAME_WIDTH / 2, playY,
      BTN_PLAY_WIDTH, BTN_PLAY_HEIGHT,
      'Play Again',
      { fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF' },
      BTN_PLAY_BG, BTN_PLAY_HOVER,
      () => this.scene.start(SCENE_KEYS.GAMEPLAY),
    );

    /* --- Main Menu Button --- */
    this.createButton(
      GAME_WIDTH / 2, playY + BTN_PLAY_HEIGHT + 16,
      BTN_MENU_WIDTH, BTN_MENU_HEIGHT,
      'Main Menu',
      { fontSize: '18px', fontFamily: 'monospace', color: '#AAAAAA' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      () => this.scene.start(SCENE_KEYS.MAIN_MENU),
    );
  }

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

    const text = this.add.text(x, y, label, textStyle).setOrigin(0.5);

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
