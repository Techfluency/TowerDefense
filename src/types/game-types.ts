/**
 * Core type definitions shared across all game systems.
 *
 * These interfaces define the data shapes that flow between systems.
 * They are the contracts that keep 9 interconnected bolts compatible:
 * - BOLT-002 (map gen) produces MapCell arrays
 * - BOLT-003 (enemies) consumes EnemyDefinition, produces enemy instances
 * - BOLT-004 (waves) consumes WaveDefinition, spawns enemies
 * - BOLT-005 (placement) reads TowerDefinition for costs
 * - BOLT-006 (combat) reads TowerDefinition for stats, ProjectileDefinition for projectiles
 * - BOLT-007 (upgrades) reads UpgradeDefinition for stat deltas
 * - BOLT-008 (economy) reads reward values from enemy/wave data
 * - BOLT-009 (HUD) reads GameState for display
 *
 * When modifying these interfaces, consider which systems consume them.
 * A breaking change here propagates to every system that uses the type.
 */

// ---------------------------------------------------------------------------
// Tower Definitions
// ---------------------------------------------------------------------------

/** The four required tower classes from the PRD, plus a future utility slot. */
export type TowerClass = 'ranged' | 'focused' | 'broadcast' | 'antiair' | 'utility';

/** Targeting priorities that towers can use to select enemies. */
export type TargetingMode = 'first' | 'last' | 'strongest' | 'weakest' | 'closest';

/**
 * Static definition of a tower type, loaded from JSON config.
 * These values are the base stats before any upgrades are applied.
 * Combat systems read these; the placement system reads cost.
 */
export interface TowerDefinition {
  /** Unique identifier for this tower type (e.g., "ranged", "focused"). */
  id: string;
  /** Display name shown in the build menu and tooltips. */
  name: string;
  /** Tower class determines combat behavior and targeting rules. */
  towerClass: TowerClass;
  /** Currency cost to place this tower. Read by BOLT-005/BOLT-008. */
  cost: number;
  /** Attack range in pixels. Enemies within this radius are targetable. */
  range: number;
  /** Attacks per second. Higher = faster firing. */
  fireRate: number;
  /** Base damage per hit before armor reduction. */
  damage: number;
  /** Maximum tower HP. Zero means the tower is invulnerable (Phase 1 default). */
  maxHp: number;
  /** Default targeting behavior. Player may be able to change this. */
  targetingMode: TargetingMode;
  /** Short description shown in the build menu tooltip. */
  description: string;
  /** Sprite key for the Phaser asset loader. */
  spriteKey: string;
  /**
   * References ProjectileDefinition.id. Use "none" for towers that do not
   * fire projectile entities (Focused hitscan, Broadcast burst).
   */
  projectileType: string;
}

// ---------------------------------------------------------------------------
// Enemy Definitions
// ---------------------------------------------------------------------------

/** Movement type determines pathfinding behavior and tower targeting eligibility. */
export type MovementType = 'ground' | 'flying';

/**
 * Static definition of an enemy archetype, loaded from JSON config.
 * The wave system references these by id when composing waves.
 * The enemy system instantiates entities from these definitions.
 */
export interface EnemyDefinition {
  /** Unique identifier (e.g., "runner", "tank", "flyer"). */
  id: string;
  /** Display name shown in tooltips and wave previews. */
  name: string;
  /** Base HP before wave scaling is applied. */
  baseHp: number;
  /** Base movement speed in pixels per second. */
  baseSpeed: number;
  /** Flat damage reduction on incoming hits. Subtracted before HP loss. */
  armor: number;
  /** Damage dealt to the objective when this enemy reaches the endpoint. */
  breakthroughDamage: number;
  /** Currency awarded to the player on kill. Read by BOLT-008. */
  currencyReward: number;
  /** Score awarded to the player on kill. Read by BOLT-008. */
  scoreReward: number;
  /** Ground or flying. Flying enemies can only be targeted by anti-air towers. */
  movementType: MovementType;
  /** Sprite key for the Phaser asset loader. */
  spriteKey: string;
  /**
   * Per-damage-type multipliers. Keys are damage type strings (e.g., "physical",
   * "explosive", "energy"). Values are multipliers applied before armor reduction.
   * Absent or empty = all types deal 1.0x damage. Phase 1 ships all at 1.0.
   */
  damageTypeMultipliers?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Wave Definitions
// ---------------------------------------------------------------------------

/** A single group of enemies within a wave (e.g., 5 runners then 3 tanks). */
export interface WaveGroup {
  /** References an EnemyDefinition.id. */
  enemyId: string;
  /** Number of enemies in this group. */
  count: number;
  /** Milliseconds between spawns within this group. */
  spawnIntervalMs: number;
  /** Milliseconds to wait before spawning this group (after the previous group). */
  delayMs: number;
}

/**
 * Definition of a single wave, loaded from JSON config.
 * The wave system reads these sequentially to control game pacing.
 */
export interface WaveDefinition {
  /** Wave number (1-indexed). Displayed in the HUD. */
  waveNumber: number;
  /** Enemy groups that compose this wave, spawned in order. */
  groups: WaveGroup[];
  /** Milliseconds of preparation time before this wave starts.
   *  Player can skip this by clicking "start early" for a bonus. */
  prepTimeMs: number;
  /** Whether this wave is flagged as a boss/elite wave.
   *  Phase 1: visual indicator only. Phase 3: true boss mechanics. */
  isBossWave: boolean;
}

// ---------------------------------------------------------------------------
// Projectile Definitions
// ---------------------------------------------------------------------------

/**
 * Definition of a projectile type. Towers reference these to determine
 * what they fire. Projectiles are pooled via Phaser Groups for performance.
 */
export interface ProjectileDefinition {
  /** Unique identifier (e.g., "arrow", "beam", "blast"). */
  id: string;
  /** Travel speed in pixels per second. */
  speed: number;
  /** Splash radius in pixels. Zero means single-target. */
  splashRadius: number;
  /** Sprite key for the Phaser asset loader. */
  spriteKey: string;
}

// ---------------------------------------------------------------------------
// Upgrade Definitions
// ---------------------------------------------------------------------------

/**
 * Stat modifications applied when a tower is upgraded to a given tier.
 * Values are deltas added to the tower's current stats.
 */
export interface UpgradeDefinition {
  /** Which tower type this upgrade applies to. References TowerDefinition.id. */
  towerId: string;
  /** Upgrade tier (1 = base, 2 = first upgrade, 3 = second upgrade). */
  tier: number;
  /** Currency cost to apply this upgrade. */
  cost: number;
  /** Damage increase (added to current damage). */
  damageDelta: number;
  /** Fire rate increase (added to current fire rate). */
  fireRateDelta: number;
  /** Range increase in pixels (added to current range). */
  rangeDelta: number;
  /** Max HP increase (added to current max HP). */
  maxHpDelta: number;
  /** Sprite key for the upgraded visual. */
  spriteKey: string;
}

// ---------------------------------------------------------------------------
// Map and Grid
// ---------------------------------------------------------------------------

/** The role of a tile in the map grid. Determines placement legality and rendering. */
export type TileType = 'path' | 'buildable' | 'blocked' | 'spawn' | 'objective';

/**
 * A point on the map grid with both grid and world coordinates.
 * Grid coordinates identify the tile. World coordinates identify the
 * pixel-space center of that tile for positioning sprites and entities.
 *
 * Used by BOLT-003 (enemy positioning), BOLT-004 (spawn placement),
 * and BOLT-005 (placement validation).
 */
export interface GridPoint {
  /** Grid column index (0 = left edge). */
  col: number;
  /** Grid row index (0 = top edge). */
  row: number;
  /** World-space X pixel coordinate at the center of this tile. */
  worldX: number;
  /** World-space Y pixel coordinate at the center of this tile. */
  worldY: number;
}

/**
 * Map generation configuration loaded from map-config.json.
 * Controls grid dimensions, path constraints, and retry behavior.
 * Read by MapGeneratorSystem via ConfigManager.
 */
export interface MapConfigDefinition {
  /** Number of tile columns in the grid. */
  cols: number;
  /** Number of tile rows in the grid. */
  rows: number;
  /** Pixel size of each tile (must match TILE_SIZE from performance-budget). */
  tileSize: number;
  /** Minimum number of tiles in the generated path. */
  minPathLength: number;
  /** Maximum consecutive tiles in the same direction before a forced turn. */
  maxStraightTiles: number;
  /** Maximum generation attempts before reporting an error. */
  maxRetries: number;
  /** Valid range for the complexity parameter [min, max]. */
  complexityRange: [number, number];
}

/**
 * A single cell in the map grid. The map generator (BOLT-002) produces a 2D
 * array of these. The placement system (BOLT-005) reads tileType to validate
 * tower placement. The renderer draws tiles based on tileType and biome.
 */
export interface MapCell {
  /** Column index in the grid (0-indexed, left to right). */
  col: number;
  /** Row index in the grid (0-indexed, top to bottom). */
  row: number;
  /** What this tile is used for. Determines rendering and placement rules. */
  tileType: TileType;
  /** Whether a tower is currently occupying this cell. Set by BOLT-005. */
  occupied: boolean;
}

// ---------------------------------------------------------------------------
// Game State
// ---------------------------------------------------------------------------

/**
 * Top-level game state managed by the Gameplay scene and read by systems.
 * This is NOT a global singleton -- it is created per-run and passed to
 * systems via their constructors. This enables testability: tests can
 * create a GameState with known values.
 */
export interface GameState {
  /** Current player currency. Modified by BOLT-008. */
  currency: number;
  /** Current player score. Modified by BOLT-008. */
  score: number;
  /** Current wave number (1-indexed). Modified by BOLT-004. */
  currentWave: number;
  /** Total waves in this run. Set at run start from wave config. */
  totalWaves: number;
  /** Objective HP remaining. When this reaches 0, the game is lost. */
  objectiveHp: number;
  /** Maximum objective HP. Set at run start. */
  maxObjectiveHp: number;
  /** Whether the game is currently paused. */
  isPaused: boolean;
  /** Whether the game has ended (win or loss). */
  isGameOver: boolean;
  /** The seed used for all randomness (map gen, wave composition, etc.). */
  gameSeed: string;
}

// ---------------------------------------------------------------------------
// Placed Tower Instance
// ---------------------------------------------------------------------------

/**
 * A placed tower instance on the map. Created by TowerPlacementSystem when
 * the player commits a placement, stored in TowerRegistry for lifetime.
 *
 * Consumed by:
 * - BOLT-005 (placement/sell): owns lifecycle, reads cost for refund
 * - BOLT-006 (combat): reads position + type for targeting
 * - BOLT-007 (upgrades): reads/writes upgradeLevel
 */
export interface PlacedTower {
  /** Unique instance ID generated by IdGenerator (e.g., "tower-1"). */
  instanceId: string;
  /** References TowerDefinition.id (e.g., "ranged", "focused"). */
  towerType: string;
  /** Grid column where the tower is placed (0-indexed). */
  col: number;
  /** Grid row where the tower is placed (0-indexed). */
  row: number;
  /** World-space X pixel coordinate at tile center (col * 64 + 32). */
  worldX: number;
  /** World-space Y pixel coordinate at tile center (row * 64 + 32). */
  worldY: number;
  /** Current upgrade tier (1 = base, incremented by BOLT-007). */
  upgradeLevel: number;
  /** Original purchase cost from TowerDefinition. Used for sell refund calc. */
  cost: number;
  /** Reference to the Phaser sprite for this tower. Destroyed on sell. */
  sprite: Phaser.GameObjects.Sprite;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Typed event names for cross-system communication via Phaser.Events.EventEmitter.
 *
 * Pattern: SUBJECT_ACTION. All inter-system events use these constants --
 * never use raw string event names in system code.
 *
 * When adding a new event:
 * 1. Add the constant here.
 * 2. Define the payload interface below.
 * 3. Document which system emits it and which systems listen.
 */
export const GAME_EVENTS = {
  /** Emitted by BOLT-003 when an enemy is killed. Listened by BOLT-004, BOLT-008, BOLT-009. */
  ENEMY_DIED: 'ENEMY_DIED',
  /** Emitted by BOLT-003 when an enemy reaches the objective. Listened by BOLT-009 (HP). */
  ENEMY_REACHED_OBJECTIVE: 'ENEMY_REACHED_OBJECTIVE',
  /** Emitted by BOLT-006 when a projectile damages an enemy. Listened by BOLT-003. */
  ENEMY_DAMAGED: 'ENEMY_DAMAGED',
  /** Emitted by BOLT-004 when a wave starts. Listened by BOLT-009 (HUD). */
  WAVE_STARTED: 'WAVE_STARTED',
  /** Emitted by BOLT-004 when all enemies in a wave are dead. Listened by BOLT-008, BOLT-009. */
  WAVE_COMPLETED: 'WAVE_COMPLETED',
  /** Emitted by BOLT-004 when all waves are exhausted. Listened by BOLT-009 (win state). */
  ALL_WAVES_COMPLETED: 'ALL_WAVES_COMPLETED',
  /** Emitted by BOLT-005 when a tower is placed. Listened by BOLT-002 (path recalc), BOLT-008. */
  TOWER_PLACED: 'TOWER_PLACED',
  /** Emitted by BOLT-005 when a tower is sold/removed. Listened by BOLT-002, BOLT-008. */
  TOWER_REMOVED: 'TOWER_REMOVED',
  /** Emitted by BOLT-007 when a tower is upgraded. Listened by BOLT-009. */
  TOWER_UPGRADED: 'TOWER_UPGRADED',
  /** Emitted by BOLT-006 when a tower fires. Listened by VFX hooks. */
  TOWER_FIRED: 'TOWER_FIRED',
  /** Emitted by BOLT-006 when a projectile hits an enemy. Listened by VFX, BOLT-003. */
  ENEMY_HIT: 'ENEMY_HIT',
  /** Emitted by BOLT-008 when currency changes. Listened by BOLT-009 (HUD). */
  CURRENCY_CHANGED: 'CURRENCY_CHANGED',
  /** Emitted by BOLT-008 when score changes. Listened by BOLT-009 (HUD). */
  SCORE_CHANGED: 'SCORE_CHANGED',
  /** Emitted by BOLT-009 when the game is paused or resumed. */
  GAME_PAUSED: 'GAME_PAUSED',
  /** Emitted by BOLT-009 when the game is over (win or loss). */
  GAME_OVER: 'GAME_OVER',
  /** Emitted by BOLT-001 InputSystem when a tile is clicked. Listened by BOLT-005. */
  TILE_CLICKED: 'TILE_CLICKED',
  /** Emitted by BOLT-001 InputSystem when the pointer crosses a tile boundary. Listened by BOLT-005. */
  TILE_HOVER_CHANGED: 'TILE_HOVER_CHANGED',
  /** Emitted by BOLT-001 InputSystem on Escape/right-click. Listened by BOLT-005. */
  INPUT_CANCEL: 'INPUT_CANCEL',
  /** Emitted by BOLT-002 MapGeneratorSystem when map generation completes. Listened by MapRendererSystem, BOLT-003, BOLT-004, BOLT-005. */
  MAP_READY: 'MAP_READY',
  /** Emitted by BOLT-003 EnemySystem when an enemy is spawned. Listened by BOLT-004 (wave tracking). */
  ENEMY_SPAWNED: 'ENEMY_SPAWNED',
} as const;

/**
 * Union type of all valid event names. Use this to type event listeners
 * that accept any game event.
 */
export type GameEventName = (typeof GAME_EVENTS)[keyof typeof GAME_EVENTS];
