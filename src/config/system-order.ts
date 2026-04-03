/**
 * System update priority order.
 *
 * Defines the order in which systems are updated each frame in the
 * Gameplay scene. Order affects correctness:
 * - Input must be processed before any system acts on it.
 * - Enemies must move before towers check targeting (current positions).
 * - Towers fire before projectiles move (so newly fired projectiles
 *   move in the same frame).
 * - Economy processes rewards after kills happen.
 *
 * Downstream bolts register their systems into the appropriate slots.
 * BOLT-001 only instantiates InputSystem (priority 0). Other priorities
 * are documented here so future bolts know where to register.
 */

/**
 * System priority constants. Lower number = earlier update.
 * Used as documentation and for the system array ordering in Gameplay.
 */
export const SYSTEM_PRIORITIES = {
  /** Process input events before any system acts on them. */
  INPUT: 0,
  /** Decide wave spawns before enemies update. */
  WAVE: 1,
  /** Move enemies before towers target them. */
  ENEMY: 2,
  /** Target enemies at current positions, fire projectiles. */
  TOWER_COMBAT: 3,
  /** Move projectiles, check hits. */
  PROJECTILE: 4,
  /** Process rewards from kills/waves. */
  ECONOMY: 5,
  /** Process upgrades (user-triggered, not per-frame intensive). */
  UPGRADE: 6,
} as const;

/**
 * Ordered list of system names for documentation and iteration.
 * The Gameplay scene uses this order when calling update() on systems.
 */
export const SYSTEM_UPDATE_ORDER = [
  'InputSystem',
  'WaveSystem',
  'EnemySystem',
  'TowerCombatSystem',
  'ProjectileSystem',
  'EconomySystem',
  'UpgradeSystem',
] as const;
