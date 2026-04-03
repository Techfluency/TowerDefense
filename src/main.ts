/**
 * Application entry point.
 *
 * This file creates the Phaser.Game instance with the game configuration
 * and starts the scene pipeline: Boot -> Preload -> MainMenu -> Gameplay.
 *
 * The game instance is NOT exported as a global. Systems access the game
 * via their scene reference (this.scene.game). This prevents global state
 * and keeps systems testable with injected scene mocks.
 */
import Phaser from 'phaser';
import { createGameConfig } from './config/game-config';

/**
 * Create and start the game. The first scene in the config array (Boot)
 * starts automatically. Boot loads env config, then transitions to
 * Preload, which loads all game assets before transitioning to MainMenu.
 */
const game = new Phaser.Game(createGameConfig());

/**
 * Handle browser visibility changes to pause/resume the game.
 * When the browser tab loses focus, Phaser continues running by default.
 * This listener pauses the game loop to save CPU/battery.
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.loop.sleep();
  } else {
    game.loop.wake();
  }
});
