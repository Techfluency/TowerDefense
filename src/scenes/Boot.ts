/**
 * Boot scene -- the first scene that runs.
 *
 * Responsibilities:
 * 1. Load environment configuration (debug mode, asset base URL).
 * 2. Load the absolute minimum assets needed for the loading screen
 *    (a logo or progress bar background -- Preload handles everything else).
 * 3. Configure Phaser settings that depend on env config (e.g., physics debug).
 * 4. Transition to Preload scene.
 *
 * This scene should complete in < 100ms. It exists so that the Preload
 * scene can display a loading bar while heavy assets are being fetched.
 */
import Phaser from 'phaser';
import { SCENE_KEYS } from '../config/game-constants';
import { loadEnvConfig } from '../config/env';
import type { EnvConfig } from '../config/env';
import { ProgressionManager } from '../utils/progression-manager';

export class Boot extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.BOOT });
  }

  /**
   * Phaser create lifecycle method.
   * Called after the scene is initialized. No assets to preload here --
   * Boot is intentionally asset-free so it starts instantly.
   */
  create(): void {
    const envConfig: EnvConfig = loadEnvConfig();

    /* Store env config on the game registry so all scenes can access it.
     * Registry is Phaser's built-in key-value store on the Game instance.
     * This avoids passing config through every constructor. */
    this.registry.set('envConfig', envConfig);

    /* Enable physics debug rendering if debug mode is on.
     * This shows hitboxes, velocity vectors, and collision shapes. */
    if (envConfig.debug) {
      this.physics.world.drawDebug = true;
    }

    /* Launch debug overlay as a parallel scene if debug mode is on.
     * Uses launch (not start) so it runs alongside other scenes. */
    if (envConfig.debug) {
      this.scene.launch(SCENE_KEYS.DEBUG_OVERLAY);
    }

    /* BOLT-021/BOLT-023: Initialize progression manager and store on registry.
     * ProgressionManager now wraps SkillTreeManager internally. Created in Boot
     * so it's available before any scene needs progression data.
     * SkillTreeManager handles migration from the old level/XP format. */
    const progressionManager = new ProgressionManager();
    this.registry.set('progressionManager', progressionManager);
    /* BOLT-023: Also store the SkillTreeManager directly for scenes that
     * need skill tree functionality (SkillTree UI, bonus computation). */
    this.registry.set('skillTreeManager', progressionManager.getSkillTreeManager());

    /* Transition to the Preload scene, which loads all game assets. */
    this.scene.start(SCENE_KEYS.PRELOAD);
  }
}
