/**
 * Game-wide constants extracted from game-config.ts to break circular imports.
 *
 * game-config.ts imports Scene classes, which import systems, which import
 * these constants. If these lived in game-config.ts, any module in the scene
 * dependency tree that imports GAME_WIDTH would trigger a circular reference
 * (ReferenceError: Cannot access 'X' before initialization).
 *
 * All code that needs GAME_WIDTH, GAME_HEIGHT, or SCENE_KEYS should import
 * from this file, NOT from game-config.ts.
 */

/**
 * Base game resolution. Systems that need to know the canvas size
 * should reference these constants rather than querying the DOM.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

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
  DEBUG_OVERLAY: 'DebugOverlay',
} as const;
