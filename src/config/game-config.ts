/**
 * Phaser game configuration.
 *
 * This file defines the Phaser.Types.Core.GameConfig that is passed to
 * new Phaser.Game() in main.ts. It controls the renderer, resolution,
 * physics, and scene registration.
 *
 * Key decisions:
 * - WebGL primary with Canvas fallback (AUTODETECT). WebGL enables the
 *   particle system and shader effects needed for VFX in later bolts.
 * - 1280x720 base resolution. This is the standard 720p widescreen ratio
 *   that scales well to modern monitors.
 * - Arcade physics with zero gravity. Tower defense is top-down -- gravity
 *   is irrelevant. Arcade physics is used only for simple collision checks
 *   (projectile hitting enemy).
 * - pixelArt: false. The PRD calls for a "premium" visual feel with smooth
 *   scaling, not a retro pixel art aesthetic.
 */
import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Preload } from '../scenes/Preload';
import { MainMenu } from '../scenes/MainMenu';
import { Gameplay } from '../scenes/Gameplay';
import { GameOver } from '../scenes/GameOver';

/**
 * Scene keys used throughout the game for scene transitions.
 * All scene starts/switches must use these constants, never raw strings.
 */
export const SCENE_KEYS = {
  BOOT: 'Boot',
  PRELOAD: 'Preload',
  MAIN_MENU: 'MainMenu',
  GAMEPLAY: 'Gameplay',
  GAME_OVER: 'GameOver',
} as const;

/**
 * Base game resolution. Systems that need to know the canvas size
 * should reference these constants rather than querying the DOM.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * Creates the Phaser game configuration.
 *
 * @returns A complete GameConfig ready to pass to new Phaser.Game().
 */
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,

    parent: 'game-container',

    backgroundColor: '#1a1a2e',

    physics: {
      default: 'arcade',
      arcade: {
        /**
         * Zero gravity -- tower defense is top-down. Arcade physics is used
         * only for simple overlap/collision checks (projectile vs. enemy).
         */
        gravity: { x: 0, y: 0 },

        /** Debug physics bodies shown only when VITE_DEBUG is true.
         *  Toggled at runtime in Boot scene after env config is loaded. */
        debug: false,
      },
    },

    /**
     * Scene registration order matters: Phaser starts the first scene
     * in the array automatically. Boot runs first to load env config
     * and minimal assets needed for the loading screen.
     */
    scene: [Boot, Preload, MainMenu, Gameplay, GameOver],

    /**
     * Smooth scaling, not pixel art. The PRD calls for a "premium" visual
     * feel. antialias: true enables texture smoothing for rotated sprites
     * (tower turrets, projectiles).
     */
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },

    /**
     * Scale manager: FIT mode resizes the canvas to fill the parent
     * container while maintaining aspect ratio. autoCenter places it
     * in the middle of the viewport.
     */
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
