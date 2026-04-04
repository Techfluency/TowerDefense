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

/** Support aura circle -- below enemy ground sprites, visible beneath them. BOLT-017. */
export const DEPTH_SUPPORT_AURA = 9;

/** Shield overlay graphic -- tracks shielded enemies, above flying enemies. BOLT-017. */
export const DEPTH_SHIELD_OVERLAY = 20.5;

/** Health bar overlay -- above all enemy sprites (shield bars drawn here too). */
export const DEPTH_HEALTH_BARS = 21;

/** Tower health bars -- above enemy health bars, below projectiles. BOLT-007. */
export const DEPTH_TOWER_HEALTH_BARS = 22;

/** Projectile trail particles -- below projectiles, above health bars. BOLT-014. */
export const DEPTH_PROJECTILE_TRAILS = 23;

/** Projectiles -- above everything except UI. */
export const DEPTH_PROJECTILES = 25;

/** Impact VFX -- above projectiles, below UI. BOLT-014 enhanced. */
export const DEPTH_VFX = 26;

/** Floating reward/notification text -- above game objects, below HUD. BOLT-009. */
export const DEPTH_FLOATING_TEXT = 99;

/** HUD elements -- always on top. */
export const DEPTH_UI = 100;

/** Tooltips -- above all HUD elements. BOLT-009. */
export const DEPTH_TOOLTIP = 101;

/** Full-screen overlays (pause, wave summary, settings, coach marks). BOLT-009. */
export const DEPTH_OVERLAY = 105;

/** BOLT-022: Mobile orientation/fullscreen overlays -- above everything in-game. */
export const DEPTH_MOBILE_OVERLAY = 200;
