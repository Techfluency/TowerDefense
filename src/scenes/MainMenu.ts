/**
 * Main menu scene -- the player's first interactive screen.
 *
 * Responsibilities:
 * 1. Display the game title and version.
 * 2. Provide a "New Game" button that transitions to the Gameplay scene.
 * 3. Provide a "Settings" button (placeholder for BOLT-009).
 *
 * This scene is intentionally minimal during scaffold. BOLT-009 will
 * add the full menu layout, settings panel, and visual polish.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';
import type { EnvConfig } from '../config/env';

export class MainMenu extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU });
  }

  /**
   * Phaser create lifecycle method.
   * Builds the menu UI elements. No preload needed -- all assets
   * were loaded in the Preload scene.
   */
  create(): void {
    const envConfig = this.registry.get('envConfig') as EnvConfig;

    /* --- Title --- */
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 3, 'Random Gen\nTower Defense', {
        fontSize: '48px',
        color: '#ffffff',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    /* --- Version --- */
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 3 + 80, `v${envConfig.gameVersion}`, {
        fontSize: '16px',
        color: '#888888',
      })
      .setOrigin(0.5);

    /* --- New Game Button ---
     * Uses a text button with hover effect. BOLT-009 will replace this
     * with a proper styled button component. */
    const newGameText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'New Game', {
        fontSize: '28px',
        color: '#4a90d9',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    /* Hover feedback -- brighten on hover, dim on exit. */
    newGameText.on('pointerover', () => {
      newGameText.setColor('#6ab0ff');
    });
    newGameText.on('pointerout', () => {
      newGameText.setColor('#4a90d9');
    });

    /* Click handler -- start a new game. */
    newGameText.on('pointerdown', () => {
      this.scene.start(SCENE_KEYS.GAMEPLAY);
    });

    /* --- Settings Placeholder ---
     * BOLT-009 will implement the full settings panel. */
    const settingsText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'Settings', {
        fontSize: '22px',
        color: '#666666',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    settingsText.on('pointerover', () => {
      settingsText.setColor('#999999');
    });
    settingsText.on('pointerout', () => {
      settingsText.setColor('#666666');
    });
  }
}
