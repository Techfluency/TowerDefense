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

    /* Projectile placeholder sprites (yellow variants). */
    { key: 'projectile-arrow', path: 'sprites/projectile-arrow.png' },
    { key: 'projectile-blast', path: 'sprites/projectile-blast.png' },
    { key: 'projectile-missile', path: 'sprites/projectile-missile.png' },

    /* Tile placeholder sprites. */
    { key: 'tile-path', path: 'sprites/tile-path.png' },
    { key: 'tile-buildable', path: 'sprites/tile-buildable.png' },
    { key: 'tile-blocked', path: 'sprites/tile-blocked.png' },
    { key: 'tile-spawn', path: 'sprites/tile-spawn.png' },
    { key: 'tile-objective', path: 'sprites/tile-objective.png' },
  ],

  spritesheets: [
    /* No spritesheets in BOLT-001. Future bolts add animated sprites here. */
  ],

  audio: [
    /* No audio in BOLT-001. BOLT-009 adds sound effects and music. */
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
  ],

  tilemaps: [
    /* No tilemaps in BOLT-001. BOLT-002 adds tilemap data here. */
  ],
};
