/**
 * Performance budget constants.
 *
 * Derived from PRD stable 60 FPS requirement and tech-stack.yml caps.
 * These constants are referenced by:
 * - PoolManager (pool sizing)
 * - Debug overlay (displaying budget vs actual)
 * - Downstream bolts (knowing their frame-time allowance)
 */

/** Target frames per second. */
export const TARGET_FPS = 60;

/** Maximum concurrent active enemies. Informs enemy pool size. */
export const MAX_ENEMIES = 100;

/** Maximum concurrent active projectiles. Informs projectile pool size. */
export const MAX_PROJECTILES = 50;

/** Maximum placed towers on the map at once. */
export const MAX_TOWERS = 30;

/** Maximum JavaScript heap usage in MB. Tracks long-session memory leaks. */
export const HEAP_BUDGET_MB = 200;

/** Total frame budget in ms (1000 / 60). All systems must complete within this. */
export const FRAME_BUDGET_MS = 16.67;

/**
 * Default per-system frame-time allowance in ms.
 * With ~8 systems, 2ms each leaves ~0.67ms headroom for rendering.
 * Systems that consistently exceed this budget need optimization.
 */
export const SYSTEM_BUDGET_MS = 2.0;

/** Tile size in pixels. Used for grid coordinate calculations. */
export const TILE_SIZE = 64;

/**
 * Vertical offset for the map area below the HUD bar.
 * All world Y positions for tiles, enemies, towers, and placement
 * must add this offset. Input systems must subtract it when converting
 * pointer Y to grid row.
 */
export const MAP_OFFSET_Y = 44;
