/**
 * Preload scene -- loads all game assets.
 *
 * Responsibilities:
 * 1. Display a loading progress bar while assets are being fetched.
 * 2. Load all sprites, tilesets, audio, and JSON data configs.
 * 3. Transition to MainMenu when loading is complete.
 *
 * Asset loading strategy:
 * - All assets are loaded here, not scattered across scenes. This ensures
 *   a single loading screen at startup and no mid-game loading hitches.
 * - Assets are loaded from the VITE_ASSET_BASE_URL path, which defaults
 *   to /assets in development and can be overridden for CDN in production.
 * - During scaffold phase, no actual assets exist yet. The loading
 *   progress bar will complete instantly. BOLT-002+ will add real
 *   asset loading calls here.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

export class Preload extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.PRELOAD });
  }

  /**
   * Phaser preload lifecycle method.
   * Queue all assets for loading here. Phaser downloads them in parallel
   * and calls create() when everything is ready.
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

    /* Update the progress bar width as each asset loads. */
    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x4a90d9, 1);
      progressBar.fillRect(barX, barY, barWidth * value, barHeight);
    });

    /* Clean up loading UI when done. */
    this.load.on('complete', () => {
      bgBar.destroy();
      progressBar.destroy();
    });

    /* --- Asset Loading ---
     * No assets exist during scaffold. Engineering bolts will add
     * load calls here as they create sprites, tilesets, and audio.
     *
     * Pattern for future bolts:
     *   const baseUrl = this.registry.get('envConfig').assetBaseUrl;
     *   this.load.image('tower-ranged', `${baseUrl}/sprites/tower-ranged.png`);
     *   this.load.spritesheet('enemy-runner', `${baseUrl}/sprites/enemy-runner.png`, { ... });
     *   this.load.tilemapTiledJSON('map-tiles', `${baseUrl}/tilesets/terrain.json`);
     *   this.load.audio('bgm-gameplay', `${baseUrl}/audio/bgm-gameplay.ogg`);
     *   this.load.json('tower-config', `${baseUrl}/../data/towers.json`);
     */
  }

  /**
   * Phaser create lifecycle method.
   * Called after all queued assets have finished loading.
   */
  create(): void {
    /* All assets loaded -- transition to the main menu. */
    this.scene.start(SCENE_KEYS.MAIN_MENU);
  }
}
