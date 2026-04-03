/**
 * Simple unique ID generator for entity instances.
 *
 * Each enemy, tower, and projectile instance needs a unique ID for event
 * payloads and tracking. Uses an incrementing counter with a type prefix
 * to produce collision-free IDs like "enemy-1", "tower-42".
 *
 * Not globally unique across sessions -- IDs reset on page reload.
 * This is acceptable because entity IDs are only meaningful within
 * a single game run.
 */

/** Auto-incrementing counter shared across all ID prefixes. */
let counter = 0;

/**
 * Generates a unique entity instance ID.
 *
 * @param prefix - Entity type prefix (e.g., "enemy", "tower", "projectile").
 * @returns A unique string ID like "enemy-1", "tower-42".
 */
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Resets the ID counter. Only used in tests to ensure deterministic IDs.
 * Never call this in production game code.
 */
export function resetIdCounter(): void {
  counter = 0;
}
