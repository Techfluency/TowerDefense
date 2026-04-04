/**
 * Application entry point.
 *
 * This file creates the Phaser.Game instance with the game configuration
 * and starts the scene pipeline: Boot -> Preload -> MainMenu -> Gameplay.
 *
 * The game instance is NOT exported as a global. Systems access the game
 * via their scene reference (this.scene.game). This prevents global state
 * and keeps systems testable with injected scene mocks.
 *
 * BOLT-022: Also initializes mobile-specific overlays (orientation prompt,
 * fullscreen prompt) and stores mobile detection flag on the Phaser registry
 * for systems to query.
 */
import Phaser from 'phaser';
import { createGameConfig } from './config/game-config';
import { initOrientationOverlay } from './ui/orientation-overlay';
import { showFullscreenPrompt } from './ui/fullscreen-prompt';
import { isMobileDevice } from './utils/mobile-detect';

/**
 * Create and start the game. The first scene in the config array (Boot)
 * starts automatically. Boot loads env config, then transitions to
 * Preload, which loads all game assets before transitioning to MainMenu.
 */
const game = new Phaser.Game(createGameConfig());

/**
 * BOLT-022: Initialize mobile orientation overlay.
 * Shows a "Rotate your device" prompt when portrait is detected.
 * Returns a cleanup function (unused -- overlay lives for the app lifetime).
 */
initOrientationOverlay();

/**
 * BOLT-022: Store mobile detection flag on the Phaser registry.
 * Systems (VFXManager, HUD, build menu) read this to adjust behavior.
 * The 'ready' event fires after the first scene's init(), ensuring the
 * registry is available.
 */
game.events.once('ready', () => {
  const mobile = isMobileDevice();
  game.registry.set('isMobile', mobile);

  /* Show fullscreen prompt on mobile after a short delay to allow
   * the first scene to render. Uses Phaser's scale manager for
   * proper canvas resize after fullscreen transition. */
  if (mobile) {
    setTimeout(() => {
      showFullscreenPrompt(game.scale);
    }, 1000);
  }
});

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
