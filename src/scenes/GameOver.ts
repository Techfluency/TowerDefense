/**
 * Game Over scene -- displayed when the player wins or loses.
 *
 * Responsibilities:
 * 1. Display the outcome (victory or defeat).
 * 2. Show run summary (score, waves survived, enemies defeated).
 * 3. Provide a "Return to Menu" button.
 * 4. Provide a "Play Again" button for quick restart.
 *
 * This scene receives data from the Gameplay scene via scene.start()
 * data parameter. BOLT-009 will implement the full results screen
 * with detailed stats, animations, and high score comparison.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

/** Data passed from the Gameplay scene when transitioning to GameOver. */
interface GameOverData {
  /** Whether the player won (survived all waves) or lost (objective destroyed). */
  victory: boolean;
  /** Final score. */
  score: number;
  /** Number of waves the player survived. */
  wavesSurvived: number;
}

export class GameOver extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME_OVER });
  }

  /**
   * Phaser create lifecycle method.
   * Receives game result data and builds the results screen.
   *
   * @param data - Run results passed from the Gameplay scene.
   */
  create(data: GameOverData): void {
    /* Default values in case create() is called without data
     * (e.g., during development when testing this scene directly). */
    const victory = data?.victory ?? false;
    const score = data?.score ?? 0;
    const wavesSurvived = data?.wavesSurvived ?? 0;

    /* --- Outcome Header --- */
    const headerText = victory ? 'Victory!' : 'Defeat';
    const headerColor = victory ? '#4aff4a' : '#ff4a4a';

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 4, headerText, {
        fontSize: '56px',
        color: headerColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    /* --- Run Summary --- */
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 30,
        `Score: ${score}\nWaves Survived: ${wavesSurvived}`,
        {
          fontSize: '24px',
          color: '#cccccc',
          align: 'center',
          lineSpacing: 12,
        }
      )
      .setOrigin(0.5);

    /* --- Play Again Button --- */
    const playAgain = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Play Again', {
        fontSize: '28px',
        color: '#4a90d9',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playAgain.on('pointerover', () => playAgain.setColor('#6ab0ff'));
    playAgain.on('pointerout', () => playAgain.setColor('#4a90d9'));
    playAgain.on('pointerdown', () => {
      this.scene.start(SCENE_KEYS.GAMEPLAY);
    });

    /* --- Return to Menu Button --- */
    const menuButton = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, 'Main Menu', {
        fontSize: '22px',
        color: '#666666',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menuButton.on('pointerover', () => menuButton.setColor('#999999'));
    menuButton.on('pointerout', () => menuButton.setColor('#666666'));
    menuButton.on('pointerdown', () => {
      this.scene.start(SCENE_KEYS.MAIN_MENU);
    });
  }
}
