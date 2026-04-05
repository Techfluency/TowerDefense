/**
 * Tiny Swords asset key constants -- BOLT-027.
 *
 * Every texture key registered in BOLT-027's asset manifest entries is
 * exported here as a named constant. Downstream bolts (especially BOLT-028)
 * import from this file instead of using bare string literals, so TypeScript
 * catches key typos at compile time.
 *
 * Namespace grouping matches the asset categories in asset-manifest.ts.
 * Each object uses `as const` for TypeScript literal type inference.
 */

/** Spritesheet keys for enemy movement animations. */
export const ENEMY_SHEETS = {
  /** Gnoll_Walk.png -- Runner archetype (walk cycle, no Run sheet exists). */
  RUNNER: 'enemy-runner-sheet',
  /** Thief_Run.png -- Alternate runner sprite. */
  RUNNER_ALT: 'enemy-runner-alt-sheet',
  /** Troll_Walk.png -- Tank archetype (walk cycle, no Run sheet exists). */
  TANK: 'enemy-tank-sheet',
  /** Bear_Run.png -- Alternate tank sprite. */
  TANK_ALT: 'enemy-tank-alt-sheet',
  /** Spider_Run.png -- Fast archetype. */
  FAST: 'enemy-fast-sheet',
  /** Snake_Run.png -- Alternate fast sprite. */
  FAST_ALT: 'enemy-fast-alt-sheet',
  /** Skull_Run.png -- Flying archetype. */
  FLYER: 'enemy-flyer-sheet',
  /** Gnome_Run.png -- Swarm archetype. */
  SWARM: 'enemy-swarm-sheet',
  /** Turtle_Walk.png -- Shielded archetype (walk cycle, no Run sheet exists). */
  SHIELDED: 'enemy-shielded-sheet',
  /** Shaman_Run.png -- Support archetype. */
  SUPPORT: 'enemy-support-sheet',
  /** Minotaur_Walk.png -- Boss archetype (walk cycle, no Run sheet exists). */
  BOSS: 'enemy-boss-sheet',
} as const;

/** Tileset and terrain tile keys (spritesheets and static images). */
export const TERRAIN_KEYS = {
  /** 640x256 grass/sand tileset, 64x64 per tile (10x4 grid). */
  TILEMAP_FLAT: 'terrain-tilemap-flat',
  /** 256x512 elevation/cliff tileset, 64x64 per tile (4x8 grid). */
  TILEMAP_ELEVATION: 'terrain-tilemap-elevation',
  /** 64x64 single water tile (static image, no animation). */
  WATER: 'terrain-water',
  /** 1536x192 water foam animation strip, 192x192 per frame. */
  FOAM: 'terrain-foam',
  /** 1024x64 animated water rock variant 1, 64x64 per frame. */
  WATER_ROCKS_1: 'terrain-water-rocks-1',
  /** 1024x64 animated water rock variant 2, 64x64 per frame. */
  WATER_ROCKS_2: 'terrain-water-rocks-2',
  /** 1024x64 animated water rock variant 3, 64x64 per frame. */
  WATER_ROCKS_3: 'terrain-water-rocks-3',
  /** 1024x64 animated water rock variant 4, 64x64 per frame. */
  WATER_ROCKS_4: 'terrain-water-rocks-4',
} as const;

/** Effect animation spritesheet keys. */
export const VFX_SHEETS = {
  /** 1728x192 explosion sequence (9 frames at 192x192). */
  EXPLOSION: 'vfx-explosion',
  /** 896x128 fire loop animation (7 frames at 128x128). */
  FIRE: 'vfx-fire',
} as const;

/** Map decoration keys -- bushes are spritesheets, rocks and clouds are static images. */
export const DECO_KEYS = {
  /** 1024x128 bush sway animation (8 frames at 128x128). */
  BUSH_1: 'deco-bush-1',
  BUSH_2: 'deco-bush-2',
  BUSH_3: 'deco-bush-3',
  BUSH_4: 'deco-bush-4',
  /** 64x64 static rock decoration. */
  ROCK_1: 'deco-rock-1',
  ROCK_2: 'deco-rock-2',
  ROCK_3: 'deco-rock-3',
  ROCK_4: 'deco-rock-4',
  /** 576x256 static cloud decoration. */
  CLOUD_1: 'deco-cloud-1',
  CLOUD_2: 'deco-cloud-2',
  CLOUD_3: 'deco-cloud-3',
  CLOUD_4: 'deco-cloud-4',
  CLOUD_5: 'deco-cloud-5',
  CLOUD_6: 'deco-cloud-6',
  CLOUD_7: 'deco-cloud-7',
  CLOUD_8: 'deco-cloud-8',
  /** 64x64 campfire decoration for spawn point markers (Deco 12). */
  SPAWN_CAMPFIRE: 'deco-spawn-campfire',
} as const;

/** Projectile animation spritesheet keys. */
export const PROJECTILE_SHEETS = {
  /** 64x128 arrow variants (2 frames at 64x64). */
  ARROW: 'projectile-arrow-sheet',
  /** 384x64 spinning dynamite animation (6 frames at 64x64). */
  DYNAMITE: 'projectile-dynamite-sheet',
} as const;

/** Building/structure static sprite keys. */
export const BUILDING_KEYS = {
  /** 320x256 intact blue castle (objective building). */
  CASTLE_BLUE: 'building-castle-blue',
  /** 320x256 destroyed castle (game-over state). */
  CASTLE_DESTROYED: 'building-castle-destroyed',
} as const;

/** Resource icon sprite keys. */
export const RESOURCE_KEYS = {
  /** 128x128 gold resource icon (currency display). */
  GOLD: 'resource-gold',
} as const;
