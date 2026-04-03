/**
 * Vite environment variable type declarations.
 *
 * Extends the ImportMetaEnv interface so that import.meta.env.VITE_*
 * variables are typed. Add new VITE_ variables here as they are
 * introduced. Without this file, TypeScript treats all env vars as
 * string | undefined, losing the documentation benefit.
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game version string displayed in the HUD and main menu. */
  readonly VITE_GAME_VERSION: string;
  /** Enable debug overlays ("true" or "false"). */
  readonly VITE_DEBUG: string;
  /** Base URL for Phaser asset loading. */
  readonly VITE_ASSET_BASE_URL: string;
  /** Optional fixed seed for reproducible game runs. */
  readonly VITE_GAME_SEED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
