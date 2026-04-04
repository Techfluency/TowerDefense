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
  /**
   * Shield configuration for Shielded enemy archetype. Absent for
   * enemies without shields. Shield HP absorbs damage before body HP.
   * BOLT-017: Shielded Unit.
   */
  shield?: ShieldConfig;
  /**
   * Aura configuration for Support enemy archetype. Absent for enemies
   * without auras. Aura applies a buff to nearby allies within radius.
   * BOLT-017: Support Unit.
   */
  aura?: AuraConfig;
}

/**
 * Shield configuration for the Shielded enemy archetype.
 * Shield HP absorbs all incoming damage first; overflow goes to body HP.
 * After taking no damage for `regenDelaySec` seconds, the shield
 * regenerates at `regenRatePerSec` HP/s up to `maxShieldHp`.
 * BOLT-017.
 */
export interface ShieldConfig {
  /** Maximum shield hit points (e.g., 50% of baseHp = 40 for an 80HP enemy). */
  maxShieldHp: number;
  /** Seconds without damage before shield begins regenerating. */
  regenDelaySec: number;
  /** Shield HP regenerated per second once regen starts. */
  regenRatePerSec: number;
}

/**
 * Aura configuration for the Support enemy archetype.
 * Applies a passive buff to all allies within the radius.
 * When the Support Unit dies, affected enemies lose the buff immediately.
 * BOLT-017.
 */
export interface AuraConfig {
  /** Aura radius in pixels (2-tile radius = 128px at 64px tiles). */
  radiusPx: number;
  /** Speed multiplier applied to enemies within the aura (e.g., 1.3 = +30% speed). */
  speedMultiplier: number;
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
 * Absolute stat values for a tower at a specific upgrade tier.
 * Loaded from tower-upgrades.json. Each tier is self-contained --
 * the stat resolver returns these values directly, no delta accumulation.
 *
 * Consumed by:
 * - BOLT-007 stat resolver (resolveEffectiveStats)
 * - BOLT-007 UpgradePanel (stat comparison display)
 * - ConfigManager.getUpgrades()
 */
export interface TowerUpgradeTier {
  /** Which tower type this tier applies to. References TowerDefinition.id. */
  towerId: string;
  /** Upgrade tier (1 = base stats, 2 = first upgrade, 3 = max). */
  tier: number;
  /** Currency cost to upgrade TO this tier. Tier 1 cost is 0. */
  cost: number;
  /** Absolute damage value at this tier. */
  damage: number;
  /** Absolute attacks per second at this tier. */
  fireRate: number;
  /** Absolute attack range in pixels at this tier. */
  range: number;
  /** Absolute max HP at this tier. */
  maxHp: number;
}

/**
 * Effective combat stats for a tower at its current upgrade tier.
 * Returned by resolveEffectiveStats() and consumed by TowerCombatSystem
 * and UpgradePanel for display and combat calculations.
 */
export interface EffectiveTowerStats {
  /** Effective damage at current tier. */
  damage: number;
  /** Effective fire rate (attacks per second) at current tier. */
  fireRate: number;
  /** Effective range in pixels at current tier. */
  range: number;
  /** Effective max HP at current tier. */
  maxHp: number;
}

// ---------------------------------------------------------------------------
// Economy Definitions
// ---------------------------------------------------------------------------

/**
 * Balance parameters for the economy system, loaded from economy.json.
 * Controls starting currency, wave bonuses, and scoring formulas.
 * Consumed by EconomySystem (BOLT-008) via ConfigManager.getEconomy().
 */
export interface EconomyConfig {
  /** Currency granted at run start. Enough for 2-3 tier-1 towers. */
  startingCurrency: number;
  /** Base currency for wave completion bonus. Formula: waveBonusBase + (waveBonusPerWave * waveNumber). */
  waveBonusBase: number;
  /** Currency added per wave number in the wave completion bonus. */
  waveBonusPerWave: number;
  /** Flat currency bonus for starting a wave early (skipping prep countdown). */
  earlyStartBonus: number;
  /** Score multiplied by waveNumber on wave completion. Formula: waveScoreBonusPerWave * waveNumber. */
  waveScoreBonusPerWave: number;
}

/**
 * Accumulated run statistics tracked by EconomySystem.
 * Read by BOLT-009 at run end for the summary screen.
 */
export interface RunStats {
  /** Number of ENEMY_DIED events processed during the run. */
  totalKills: number;
  /** Current value of GameState.score at time of call. */
  finalScore: number;
  /** Highest waveNumber from WAVE_COMPLETED events received. */
  wavesCompleted: number;
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
  /** Current hit points. Initialized to effective maxHp on placement. BOLT-007. */
  currentHp: number;
  /** Total currency invested: base cost + sum of all upgrade costs. Used for sell refund. BOLT-007. */
  totalInvested: number;
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
  /** Emitted by BOLT-007 when a tower is repaired. Listened by BOLT-009. */
  TOWER_REPAIRED: 'TOWER_REPAIRED',
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
  /** Emitted by BOLT-011 AutoTileSystem when TileVariantMap is stored on registry. Listened by BOLT-012, BOLT-013. */
  AUTO_TILE_READY: 'AUTO_TILE_READY',
  /** Emitted by BOLT-017 EnemySystem when a shielded enemy's shield is fully depleted. Listened by VFX hooks, potentially BOLT-021. */
  ENEMY_SHIELD_BROKEN: 'ENEMY_SHIELD_BROKEN',
  /** Emitted by BOLT-017 EnemySystem when a shielded enemy's shield finishes regenerating. Listened by VFX hooks. */
  ENEMY_SHIELD_REGENERATED: 'ENEMY_SHIELD_REGENERATED',
} as const;

/**
 * Union type of all valid event names. Use this to type event listeners
 * that accept any game event.
 */
export type GameEventName = (typeof GAME_EVENTS)[keyof typeof GAME_EVENTS];

/**
 * Registry key constants for data stored on the Phaser registry.
 * Use these instead of raw string literals to prevent typo-based bugs.
 * BOLT-012 and BOLT-013 import TILE_VARIANT_MAP from here.
 */
export const REGISTRY_KEYS = {
  /** Key for the TileVariantMap produced by AutoTileSystem (BOLT-011). */
  TILE_VARIANT_MAP: 'tileVariantMap',
} as const;

/**
 * Sprite key lookup table for each tile, keyed by "col,row".
 * Produced by AutoTileSystem (BOLT-011), consumed by BOLT-012 and BOLT-013.
 */
export type TileVariantMap = Map<string, string>;
