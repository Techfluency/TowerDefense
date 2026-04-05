/**
 * Asset manifest -- registry of all assets to be loaded in the Preload scene.
 *
 * This is the single source of truth for asset keys and paths. The Preload
 * scene iterates these arrays to queue Phaser load calls. Downstream bolts
 * reference assets by the key defined here.
 *
 * When adding new assets:
 * 1. Add the entry to the appropriate array below.
 * 2. Place the file in public/assets/ at the path specified.
 * 3. Run `pnpm run build` to verify the asset loads without errors.
 *
 * Sprite key uniqueness is enforced by the validate-configs.ts script.
 */

/** A single sprite image to load. */
export interface SpriteAsset {
  /** Phaser texture key -- used to reference this sprite in game code. */
  key: string;
  /** Path relative to the asset base URL. */
  path: string;
}

/** A spritesheet image with frame dimensions. */
export interface SpritesheetAsset {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
}

/** An audio file to load. */
export interface AudioAsset {
  key: string;
  path: string;
}

/** A JSON data file to load. */
export interface JsonAsset {
  key: string;
  path: string;
}

/** A Tiled tilemap JSON file to load. */
export interface TilemapAsset {
  key: string;
  path: string;
}

export interface AssetManifest {
  sprites: SpriteAsset[];
  spritesheets: SpritesheetAsset[];
  audio: AudioAsset[];
  json: JsonAsset[];
  tilemaps: TilemapAsset[];
}

/**
 * The complete asset manifest for the game.
 * BOLT-001 registers placeholder sprites and JSON configs.
 * Subsequent bolts add their assets here.
 */
export const ASSET_MANIFEST: AssetManifest = {
  sprites: [
    /* Tower placeholder sprites (blue variants + new tower types). */
    { key: 'tower-ranged', path: 'sprites/tower-ranged.png' },
    { key: 'tower-focused', path: 'sprites/tower-focused.png' },
    { key: 'tower-broadcast', path: 'sprites/tower-broadcast.png' },
    { key: 'tower-antiair', path: 'sprites/tower-antiair.png' },

    /* Enemy placeholder sprites -- distinct colors and sizes per archetype. */
    { key: 'enemy-runner', path: 'sprites/enemy-runner.png' },
    { key: 'enemy-tank', path: 'sprites/enemy-tank.png' },
    { key: 'enemy-fast', path: 'sprites/enemy-fast.png' },
    { key: 'enemy-flyer', path: 'sprites/enemy-flyer.png' },
    { key: 'enemy-swarm', path: 'sprites/enemy-swarm.png' },

    /* BOLT-017: Advanced enemy archetype sprites. */
    { key: 'enemy-shielded', path: 'sprites/enemy-shielded.png' },
    { key: 'enemy-support', path: 'sprites/enemy-support.png' },

    /* BOLT-018: Boss enemy sprite (1.5x scale). */
    { key: 'enemy-boss', path: 'sprites/enemy-boss.png' },

    /* Projectile placeholder sprites (yellow variants). */
    { key: 'projectile-arrow', path: 'sprites/projectile-arrow.png' },
    { key: 'projectile-blast', path: 'sprites/projectile-blast.png' },
    { key: 'projectile-missile', path: 'sprites/projectile-missile.png' },

    /* Tile placeholder sprites (legacy -- pre-BOLT-010). */
    { key: 'tile-path', path: 'sprites/tile-path.png' },
    { key: 'tile-buildable', path: 'sprites/tile-buildable.png' },
    { key: 'tile-blocked', path: 'sprites/tile-blocked.png' },
    { key: 'tile-spawn', path: 'sprites/tile-spawn.png' },
    { key: 'tile-objective', path: 'sprites/tile-objective.png' },

    /* BOLT-010: Auto-tile sprite variants.
     * 27 tile sprites for the auto-tiling system (BOLT-011 through BOLT-013).
     * Path sprites use 4-bit bitmask keys (N=1, E=2, S=4, W=8).
     * Directional sprites use cardinal suffix (n, e, s, w). */

    // Path bitmask variants (11 reachable masks for single-path generator)
    { key: 'tile-path-0', path: 'sprites/tiles/path/tile-path-0.png' },
    { key: 'tile-path-1', path: 'sprites/tiles/path/tile-path-1.png' },
    { key: 'tile-path-2', path: 'sprites/tiles/path/tile-path-2.png' },
    { key: 'tile-path-3', path: 'sprites/tiles/path/tile-path-3.png' },
    { key: 'tile-path-4', path: 'sprites/tiles/path/tile-path-4.png' },
    { key: 'tile-path-5', path: 'sprites/tiles/path/tile-path-5.png' },
    { key: 'tile-path-6', path: 'sprites/tiles/path/tile-path-6.png' },
    { key: 'tile-path-8', path: 'sprites/tiles/path/tile-path-8.png' },
    { key: 'tile-path-9', path: 'sprites/tiles/path/tile-path-9.png' },
    { key: 'tile-path-10', path: 'sprites/tiles/path/tile-path-10.png' },
    { key: 'tile-path-12', path: 'sprites/tiles/path/tile-path-12.png' },

    // Grass/buildable variants (5 visual variations)
    { key: 'tile-buildable-1', path: 'sprites/tiles/grass/tile-buildable-1.png' },
    { key: 'tile-buildable-2', path: 'sprites/tiles/grass/tile-buildable-2.png' },
    { key: 'tile-buildable-3', path: 'sprites/tiles/grass/tile-buildable-3.png' },
    { key: 'tile-buildable-4', path: 'sprites/tiles/grass/tile-buildable-4.png' },
    { key: 'tile-buildable-5', path: 'sprites/tiles/grass/tile-buildable-5.png' },

    // Blocked terrain variants (3 rock/tree formations)
    { key: 'tile-blocked-1', path: 'sprites/tiles/blocked/tile-blocked-1.png' },
    { key: 'tile-blocked-2', path: 'sprites/tiles/blocked/tile-blocked-2.png' },
    { key: 'tile-blocked-3', path: 'sprites/tiles/blocked/tile-blocked-3.png' },

    // Spawn portal directional variants (opening faces named direction)
    { key: 'tile-spawn-n', path: 'sprites/tiles/spawn/tile-spawn-n.png' },
    { key: 'tile-spawn-e', path: 'sprites/tiles/spawn/tile-spawn-e.png' },
    { key: 'tile-spawn-s', path: 'sprites/tiles/spawn/tile-spawn-s.png' },
    { key: 'tile-spawn-w', path: 'sprites/tiles/spawn/tile-spawn-w.png' },

    // Objective castle directional variants (gate faces named direction)
    { key: 'tile-objective-n', path: 'sprites/tiles/objective/tile-objective-n.png' },
    { key: 'tile-objective-e', path: 'sprites/tiles/objective/tile-objective-e.png' },
    { key: 'tile-objective-s', path: 'sprites/tiles/objective/tile-objective-s.png' },
    { key: 'tile-objective-w', path: 'sprites/tiles/objective/tile-objective-w.png' },
  ],

  spritesheets: [
    /* No spritesheets in BOLT-001. Future bolts add animated sprites here. */
  ],

  audio: [
    /* Audio files removed -- SFX are now generated at runtime via
     * SynthAudio (Web Audio API procedural synthesis). The placeholder
     * .ogg files were 58-byte stubs that browsers couldn't decode,
     * causing 54 console errors per page load. Music is also removed
     * since no real music assets exist yet. When real music files are
     * added, re-add their entries here. */
  ],

  json: [
    /* Game config JSON files loaded at runtime by Phaser's loader.
     * Paths are absolute from the web root -- files live in public/data/
     * so Vite serves them as static assets. */
    { key: 'config-towers', path: '/data/towers.json' },
    { key: 'config-enemies', path: '/data/enemies.json' },
    { key: 'config-waves', path: '/data/waves.json' },
    { key: 'config-projectiles', path: '/data/projectiles.json' },
    { key: 'config-map', path: '/data/map-config.json' },
    { key: 'config-tower-upgrades', path: '/data/tower-upgrades.json' },
    { key: 'config-economy', path: '/data/economy.json' },
    /* BOLT-020: Endless mode scaling config. */
    { key: 'config-endless', path: '/data/endless-config.json' },
    /* BOLT-023: Skill tree upgrade definitions. */
    { key: 'config-skill-tree', path: '/data/skill-tree.json' },
  ],

  tilemaps: [
    /* No tilemaps in BOLT-001. BOLT-002 adds tilemap data here. */
  ],
};
