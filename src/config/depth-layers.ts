/**
 * Shared depth layer constants for Phaser sprite rendering order.
 *
 * All bolts that render sprites must use these constants to ensure
 * consistent z-ordering. Higher depth values render on top of lower ones.
 * This prevents visual glitches where enemies render above towers or
 * projectiles appear behind tiles.
 */

/** Map tiles (path, buildable, spawn, objective). Set by BOLT-002. */
export const DEPTH_TILES = 0;

/** Ground enemies -- above tiles, below towers. */
export const DEPTH_ENEMY_GROUND = 10;

/** Towers -- between ground enemies and flying enemies. */
export const DEPTH_TOWERS = 15;

/** Range preview circle -- above towers but below placement ghost. */
export const DEPTH_RANGE_PREVIEW = 16;

/** Placement ghost -- above towers and range circle, below flying enemies. */
export const DEPTH_PLACEMENT_GHOST = 17;

/** Flying enemies -- above ground enemies and towers. */
export const DEPTH_ENEMY_FLYING = 20;

/** Health bar overlay -- above all enemy sprites. */
export const DEPTH_HEALTH_BARS = 21;

/** Projectiles -- above everything except UI. */
export const DEPTH_PROJECTILES = 25;

/** Impact VFX -- above projectiles, below UI. */
export const DEPTH_VFX = 26;

/** HUD elements -- always on top. */
export const DEPTH_UI = 100;
