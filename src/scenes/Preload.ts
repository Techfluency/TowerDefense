/**
 * Preload scene -- loads all game assets.
 *
 * Responsibilities:
 * 1. Display a loading progress bar while assets are being fetched.
 * 2. Load all sprites, tilesets, audio, and JSON data configs from
 *    the asset manifest.
 * 3. Transition to MainMenu when loading is complete.
 *
 * Asset loading strategy:
 * - All assets are loaded here, not scattered across scenes. This ensures
 *   a single loading screen at startup and no mid-game loading hitches.
 * - Assets are loaded from the VITE_ASSET_BASE_URL path, which defaults
 *   to /assets in development and can be overridden for CDN in production.
 * - The asset manifest (src/config/asset-manifest.ts) is the single source
 *   of truth for all asset keys and paths.
 *
 * BOLT-016: Loading bar uses smooth tween fill animation instead of
 * snapping to discrete progress values.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';
import { ASSET_MANIFEST } from '../config/asset-manifest';
import type { EnvConfig } from '../config/env';
import { LOADING_BAR_TWEEN_MS } from '../ui/ui-animations';

export class Preload extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.PRELOAD });
  }

  /**
   * Phaser preload lifecycle method.
   * Queues all assets from the manifest for loading. Phaser downloads
   * them in parallel and calls create() when everything is ready.
   */
  preload(): void {
    /* --- Loading Progress Bar ---
     * Draw a simple progress bar so the player sees something during load.
     * This uses Phaser Graphics (no external assets needed). */
    const barWidth = 400;
    const barHeight = 30;
    const barX = (GAME_WIDTH - barWidth) / 2;
    const barY = (GAME_HEIGHT - barHeight) / 2;

    /* Background bar (dark). */
    const bgBar = this.add.graphics();
    bgBar.fillStyle(0x222222, 1);
    bgBar.fillRect(barX, barY, barWidth, barHeight);

    /* Progress bar (fills as assets load). */
    const progressBar = this.add.graphics();

    /* Loading text above the bar. */
    this.add
      .text(GAME_WIDTH / 2, barY - 30, 'Loading...', {
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    /* BOLT-016: Smooth-fill progress bar using tweened proxy value.
     * Instead of snapping to discrete progress values, we tween the visual
     * fill width for a polished loading experience. */
    const progressProxy = { displayValue: 0 };
    this.load.on('progress', (value: number) => {
      this.tweens.add({
        targets: progressProxy,
        displayValue: value,
        duration: LOADING_BAR_TWEEN_MS,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          progressBar.clear();
          progressBar.fillStyle(0x4a90d9, 1);
          progressBar.fillRect(barX, barY, barWidth * progressProxy.displayValue, barHeight);
        },
      });
    });

    /* Clean up loading UI when done. */
    this.load.on('complete', () => {
      bgBar.destroy();
      progressBar.destroy();
    });

    /* --- Asset Loading from Manifest --- */
    const envConfig = this.registry.get('envConfig') as EnvConfig;
    const baseUrl = envConfig.assetBaseUrl;

    /* Load sprite images. */
    for (const sprite of ASSET_MANIFEST.sprites) {
      this.load.image(sprite.key, `${baseUrl}/${sprite.path}`);
    }

    /* Load spritesheets with frame dimensions. */
    for (const sheet of ASSET_MANIFEST.spritesheets) {
      this.load.spritesheet(sheet.key, `${baseUrl}/${sheet.path}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }

    /* Load audio files. */
    for (const audio of ASSET_MANIFEST.audio) {
      this.load.audio(audio.key, `${baseUrl}/${audio.path}`);
    }

    /* Load JSON config files.
     * JSON paths are relative to the base URL -- they live alongside
     * the built source, not in the static assets directory. */
    for (const json of ASSET_MANIFEST.json) {
      this.load.json(json.key, json.path);
    }

    /* Load tilemap data. */
    for (const tilemap of ASSET_MANIFEST.tilemaps) {
      this.load.tilemapTiledJSON(tilemap.key, `${baseUrl}/${tilemap.path}`);
    }
  }

  /**
   * Phaser create lifecycle method.
   * Called after all queued assets have finished loading.
   * Verifies critical assets loaded, then transitions to MainMenu.
   */
  create(): void {
    /* Verify critical textures loaded -- log warnings for missing ones. */
    for (const sprite of ASSET_MANIFEST.sprites) {
      if (!this.textures.exists(sprite.key)) {
        console.warn(
          `Preload: texture "${sprite.key}" failed to load from "${sprite.path}". ` +
          'A fallback texture will be used.',
        );
      }
    }

    /* All assets loaded -- transition to the main menu. */
    this.scene.start(SCENE_KEYS.MAIN_MENU);
  }
}
