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

    /* BOLT-027: Tiny Swords terrain static sprites. */
    { key: 'terrain-water', path: 'sprites/terrain/water.png' },

    /* BOLT-027: Tiny Swords decoration static sprites (rocks, clouds, campfire). */
    { key: 'deco-rock-1', path: 'sprites/decorations/rock-1.png' },
    { key: 'deco-rock-2', path: 'sprites/decorations/rock-2.png' },
    { key: 'deco-rock-3', path: 'sprites/decorations/rock-3.png' },
    { key: 'deco-rock-4', path: 'sprites/decorations/rock-4.png' },
    { key: 'deco-cloud-1', path: 'sprites/decorations/cloud-1.png' },
    { key: 'deco-cloud-2', path: 'sprites/decorations/cloud-2.png' },
    { key: 'deco-cloud-3', path: 'sprites/decorations/cloud-3.png' },
    { key: 'deco-cloud-4', path: 'sprites/decorations/cloud-4.png' },
    { key: 'deco-cloud-5', path: 'sprites/decorations/cloud-5.png' },
    { key: 'deco-cloud-6', path: 'sprites/decorations/cloud-6.png' },
    { key: 'deco-cloud-7', path: 'sprites/decorations/cloud-7.png' },
    { key: 'deco-cloud-8', path: 'sprites/decorations/cloud-8.png' },
    { key: 'deco-spawn-campfire', path: 'sprites/decorations/spawn-campfire.png' },

    /* BOLT-027: Tiny Swords building static sprites. */
    { key: 'building-castle-blue', path: 'sprites/buildings/castle-blue.png' },
    { key: 'building-castle-destroyed', path: 'sprites/buildings/castle-destroyed.png' },

    /* BOLT-027: Tiny Swords resource static sprites. */
    { key: 'resource-gold', path: 'sprites/resources/gold-resource.png' },
  ],

  spritesheets: [
    /* BOLT-027: Enemy movement spritesheets (Tiny Swords pixel art).
     * Gnoll/Troll/Turtle/Minotaur use Walk sheets (no Run sheet exists).
     * All others use Run sheets. Frame dimensions measured from source PNGs. */
    { key: 'enemy-runner-sheet', path: 'sprites/enemies/gnoll-walk.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-runner-alt-sheet', path: 'sprites/enemies/thief-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-tank-sheet', path: 'sprites/enemies/troll-walk.png', frameWidth: 384, frameHeight: 384 },
    { key: 'enemy-tank-alt-sheet', path: 'sprites/enemies/bear-run.png', frameWidth: 256, frameHeight: 256 },
    { key: 'enemy-fast-sheet', path: 'sprites/enemies/spider-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-fast-alt-sheet', path: 'sprites/enemies/snake-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-flyer-sheet', path: 'sprites/enemies/skull-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-swarm-sheet', path: 'sprites/enemies/gnome-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-shielded-sheet', path: 'sprites/enemies/turtle-walk.png', frameWidth: 320, frameHeight: 320 },
    { key: 'enemy-support-sheet', path: 'sprites/enemies/shaman-run.png', frameWidth: 192, frameHeight: 192 },
    { key: 'enemy-boss-sheet', path: 'sprites/enemies/minotaur-walk.png', frameWidth: 320, frameHeight: 320 },

    /* BOLT-027: Terrain tileset spritesheets.
     * Tilemap_Flat and Tilemap_Elevation are PNG tile grids, NOT Tiled JSON
     * tilemaps -- they belong in spritesheets, not tilemaps array. */
    { key: 'terrain-tilemap-flat', path: 'sprites/terrain/tilemap-flat.png', frameWidth: 64, frameHeight: 64 },
    { key: 'terrain-tilemap-elevation', path: 'sprites/terrain/tilemap-elevation.png', frameWidth: 64, frameHeight: 64 },
    { key: 'terrain-foam', path: 'sprites/terrain/foam.png', frameWidth: 192, frameHeight: 192 },
    { key: 'terrain-water-rocks-1', path: 'sprites/terrain/water-rocks-1.png', frameWidth: 64, frameHeight: 64 },
    { key: 'terrain-water-rocks-2', path: 'sprites/terrain/water-rocks-2.png', frameWidth: 64, frameHeight: 64 },
    { key: 'terrain-water-rocks-3', path: 'sprites/terrain/water-rocks-3.png', frameWidth: 64, frameHeight: 64 },
    { key: 'terrain-water-rocks-4', path: 'sprites/terrain/water-rocks-4.png', frameWidth: 64, frameHeight: 64 },

    /* BOLT-027: Effect spritesheets (explosion and fire animations). */
    { key: 'vfx-explosion', path: 'sprites/effects/explosions.png', frameWidth: 192, frameHeight: 192 },
    { key: 'vfx-fire', path: 'sprites/effects/fire.png', frameWidth: 128, frameHeight: 128 },

    /* BOLT-027: Decoration spritesheets (animated bushes). */
    { key: 'deco-bush-1', path: 'sprites/decorations/bush-1.png', frameWidth: 128, frameHeight: 128 },
    { key: 'deco-bush-2', path: 'sprites/decorations/bush-2.png', frameWidth: 128, frameHeight: 128 },
    { key: 'deco-bush-3', path: 'sprites/decorations/bush-3.png', frameWidth: 128, frameHeight: 128 },
    { key: 'deco-bush-4', path: 'sprites/decorations/bush-4.png', frameWidth: 128, frameHeight: 128 },

    /* BOLT-027: Projectile spritesheets (arrow variants, spinning dynamite). */
    { key: 'projectile-arrow-sheet', path: 'sprites/projectiles/arrow.png', frameWidth: 64, frameHeight: 64 },
    { key: 'projectile-dynamite-sheet', path: 'sprites/projectiles/dynamite.png', frameWidth: 64, frameHeight: 64 },
  ],

  audio: [
    /* Real MP3 audio files provided by the user. Phaser's sound manager
     * loads these and AudioManager prefers them over SynthAudio fallback. */
    { key: 'sfx-tower-fire-ranged', path: 'audio/sfx-tower-fire-ranged.mp3' },
    { key: 'sfx-tower-fire-focused', path: 'audio/sfx-tower-fire-focused.mp3' },
    { key: 'sfx-tower-fire-broadcast', path: 'audio/sfx-tower-fire-broadcast.mp3' },
    { key: 'sfx-tower-fire-antiair', path: 'audio/sfx-tower-fire-antiair.mp3' },
    { key: 'sfx-enemy-hit', path: 'audio/sfx-enemy-hit.mp3' },
    { key: 'sfx-enemy-died', path: 'audio/sfx-enemy-died.mp3' },
    { key: 'sfx-tower-placed', path: 'audio/sfx-tower-placed.mp3' },
    { key: 'sfx-tower-upgraded', path: 'audio/sfx-tower-upgraded.mp3' },
    { key: 'sfx-tower-removed', path: 'audio/sfx-tower-removed.mp3' },
    { key: 'sfx-wave-started', path: 'audio/sfx-wave-started.mp3' },
    { key: 'sfx-wave-completed', path: 'audio/sfx-wave-completed.mp3' },
    { key: 'sfx-game-victory', path: 'audio/sfx-game-victory.mp3' },
    { key: 'sfx-game-defeat', path: 'audio/sfx-game-defeat.mp3' },
    { key: 'sfx-currency-gain', path: 'audio/sfx-currency-gain.mp3' },
    { key: 'sfx-ui-click', path: 'audio/sfx-ui-click.mp3' },
    { key: 'sfx-low-hp-alert', path: 'audio/sfx-low-hp-alert.mp3' },
    { key: 'music-menu-theme', path: 'audio/music-menu-theme.mp3' },
    { key: 'music-gameplay-ambient', path: 'audio/music-gameplay-ambient.mp3' },
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
