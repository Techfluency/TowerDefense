/**
 * Environment configuration.
 *
 * All environment variables are accessed through this module -- never
 * read import.meta.env directly in game code. This provides a single
 * point of validation and default values, and makes it easy to mock
 * environment config in tests.
 *
 * All VITE_ prefixed variables are embedded into the bundle at build
 * time by Vite. They are NOT secret -- this is a client-side game.
 */

export interface EnvConfig {
  /** Game version string displayed in the HUD and main menu. */
  gameVersion: string;

  /** Whether debug overlays (FPS counter, hitboxes, path viz) are enabled. */
  debug: boolean;

  /** Base URL for Phaser asset loading. Can be overridden for CDN in production. */
  assetBaseUrl: string;
}

/**
 * Reads environment variables and returns a typed config object.
 * Called once at game startup and passed to systems that need it.
 */
export function loadEnvConfig(): EnvConfig {
  return {
    gameVersion: import.meta.env.VITE_GAME_VERSION ?? '0.1.0',
    debug: import.meta.env.VITE_DEBUG === 'true',
    assetBaseUrl: import.meta.env.VITE_ASSET_BASE_URL ?? '/assets',
  };
}
