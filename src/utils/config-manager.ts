/**
 * Typed configuration manager for game data definitions.
 *
 * JSON config files (towers, enemies, waves, projectiles) are loaded once
 * in the Preload scene via Phaser's loader and cached in Phaser's cache.
 * ConfigManager reads from the cache and provides typed accessor methods
 * so downstream systems never parse raw JSON or deal with untyped data.
 *
 * This class is instantiated once per Gameplay scene run and passed to
 * systems that need config data (wave system, combat system, etc.).
 */
import Phaser from 'phaser';
import type {
  TowerDefinition,
  EnemyDefinition,
  WaveDefinition,
  ProjectileDefinition,
  MapConfigDefinition,
  TowerUpgradeTier,
  EconomyConfig,
} from '../types/game-types';

/** Cache keys matching what the Preload scene uses when loading JSON files. */
const CACHE_KEYS = {
  TOWERS: 'config-towers',
  ENEMIES: 'config-enemies',
  WAVES: 'config-waves',
  PROJECTILES: 'config-projectiles',
  MAP: 'config-map',
  TOWER_UPGRADES: 'config-tower-upgrades',
  ECONOMY: 'config-economy',
} as const;

export class ConfigManager {
  /** Indexed tower definitions for O(1) lookup by id. */
  private readonly towers: Map<string, TowerDefinition>;

  /** Indexed enemy definitions for O(1) lookup by id. */
  private readonly enemies: Map<string, EnemyDefinition>;

  /** Ordered wave definitions. */
  private readonly waves: WaveDefinition[];

  /** Indexed projectile definitions for O(1) lookup by id. */
  private readonly projectiles: Map<string, ProjectileDefinition>;

  /** Map generation configuration (single object, not an array). */
  private readonly mapConfig: MapConfigDefinition;

  /** Tower upgrade tiers indexed by towerId for O(1) lookup. */
  private readonly towerUpgrades: Map<string, TowerUpgradeTier[]>;

  /** Economy balance parameters (single object, not an array). */
  private readonly economyConfig: EconomyConfig;

  /**
   * Reads all config data from the Phaser cache. Call this after the
   * Preload scene has loaded all JSON files.
   *
   * @param scene - Any active Phaser scene (used to access the shared cache).
   * @throws Error if a required config file is not in the cache.
   */
  constructor(scene: Phaser.Scene) {
    this.towers = this.indexById<TowerDefinition>(
      this.loadFromCache(scene, CACHE_KEYS.TOWERS, 'towers.json'),
    );
    this.enemies = this.indexById<EnemyDefinition>(
      this.loadFromCache(scene, CACHE_KEYS.ENEMIES, 'enemies.json'),
    );
    this.waves = this.loadFromCache(scene, CACHE_KEYS.WAVES, 'waves.json');
    this.projectiles = this.indexById<ProjectileDefinition>(
      this.loadFromCache(scene, CACHE_KEYS.PROJECTILES, 'projectiles.json'),
    );
    this.mapConfig = this.loadObjectFromCache<MapConfigDefinition>(
      scene, CACHE_KEYS.MAP, 'map-config.json',
    );
    this.towerUpgrades = this.indexUpgradesByTowerId(
      this.loadFromCache<TowerUpgradeTier>(scene, CACHE_KEYS.TOWER_UPGRADES, 'tower-upgrades.json'),
    );
    this.economyConfig = this.loadObjectFromCache<EconomyConfig>(
      scene, CACHE_KEYS.ECONOMY, 'economy.json',
    );
  }

  /**
   * Returns a tower definition by its id.
   *
   * @param id - Tower type id (e.g., "ranged", "focused").
   * @returns The tower definition.
   * @throws Error if the id is not found.
   */
  getTower(id: string): TowerDefinition {
    const tower = this.towers.get(id);
    if (!tower) {
      throw new Error(`ConfigManager: tower "${id}" not found. Available: ${[...this.towers.keys()].join(', ')}`);
    }
    return tower;
  }

  /**
   * Returns all tower definitions.
   *
   * @returns Array of all tower definitions.
   */
  getAllTowers(): TowerDefinition[] {
    return [...this.towers.values()];
  }

  /**
   * Returns an enemy definition by its id.
   *
   * @param id - Enemy type id (e.g., "runner", "tank").
   * @returns The enemy definition.
   * @throws Error if the id is not found.
   */
  getEnemy(id: string): EnemyDefinition {
    const enemy = this.enemies.get(id);
    if (!enemy) {
      throw new Error(`ConfigManager: enemy "${id}" not found. Available: ${[...this.enemies.keys()].join(', ')}`);
    }
    return enemy;
  }

  /**
   * Returns all enemy definitions.
   *
   * @returns Array of all enemy definitions.
   */
  getAllEnemies(): EnemyDefinition[] {
    return [...this.enemies.values()];
  }

  /**
   * Returns all wave definitions in order.
   *
   * @returns Array of wave definitions sorted by waveNumber.
   */
  getWaves(): WaveDefinition[] {
    return this.waves;
  }

  /**
   * Returns a projectile definition by its id.
   *
   * @param id - Projectile type id (e.g., "arrow", "blast").
   * @returns The projectile definition.
   * @throws Error if the id is not found.
   */
  getProjectile(id: string): ProjectileDefinition {
    const proj = this.projectiles.get(id);
    if (!proj) {
      throw new Error(`ConfigManager: projectile "${id}" not found. Available: ${[...this.projectiles.keys()].join(', ')}`);
    }
    return proj;
  }

  /**
   * Returns upgrade tier data for a tower type, sorted by tier ascending.
   * Returns an empty array if no upgrade data exists for the given towerId.
   *
   * @param towerId - TowerDefinition.id (e.g., "ranged").
   * @returns Array of TowerUpgradeTier sorted by tier.
   */
  getUpgrades(towerId: string): TowerUpgradeTier[] {
    return this.towerUpgrades.get(towerId) ?? [];
  }

  /**
   * Returns the map generation configuration.
   * Unlike other configs, map-config.json is a single object, not an array.
   *
   * @returns The map configuration definition.
   * @throws Error if the config is not in the cache.
   */
  getMapConfig(): MapConfigDefinition {
    const data = this.mapConfig;
    if (!data) {
      throw new Error(
        'ConfigManager: map config not loaded. Ensure map-config.json is in the asset manifest.',
      );
    }
    return data;
  }

  /**
   * Returns the economy balance configuration.
   * Loaded from economy.json -- a single object, not an array.
   *
   * @returns The economy configuration with starting currency and bonus formulas.
   */
  getEconomy(): EconomyConfig {
    return this.economyConfig;
  }

  /**
   * Reads a JSON array from the Phaser cache.
   *
   * @param scene - Active Phaser scene for cache access.
   * @param cacheKey - Key used when the JSON was loaded in Preload.
   * @param fileName - Original file name for error messages.
   * @returns The parsed JSON array.
   */
  private loadFromCache<T>(scene: Phaser.Scene, cacheKey: string, fileName: string): T[] {
    const data = scene.cache.json.get(cacheKey) as T[] | undefined;
    if (!data) {
      throw new Error(
        `ConfigManager: "${fileName}" not found in cache (key: "${cacheKey}"). ` +
        'Ensure it is loaded in the Preload scene.',
      );
    }
    return data;
  }

  /**
   * Reads a single JSON object from the Phaser cache.
   * Used for configs that are objects (not arrays), like map-config.json.
   *
   * @param scene - Active Phaser scene for cache access.
   * @param cacheKey - Key used when the JSON was loaded in Preload.
   * @param fileName - Original file name for error messages.
   * @returns The parsed JSON object.
   */
  private loadObjectFromCache<T>(scene: Phaser.Scene, cacheKey: string, fileName: string): T {
    const data = scene.cache.json.get(cacheKey) as T | undefined;
    if (!data) {
      throw new Error(
        `ConfigManager: "${fileName}" not found in cache (key: "${cacheKey}"). ` +
        'Ensure it is loaded in the Preload scene.',
      );
    }
    return data;
  }

  /**
   * Indexes an array of definitions by their `id` field for O(1) lookup.
   *
   * @param items - Array of definition objects with an `id` field.
   * @returns Map from id to definition.
   */
  private indexById<T extends { id: string }>(items: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }

  /**
   * Groups upgrade tiers by towerId and sorts each group by tier ascending.
   * Provides O(1) lookup by towerId for the stat resolver.
   *
   * @param items - Flat array of TowerUpgradeTier objects.
   * @returns Map from towerId to sorted array of tiers.
   */
  private indexUpgradesByTowerId(items: TowerUpgradeTier[]): Map<string, TowerUpgradeTier[]> {
    const map = new Map<string, TowerUpgradeTier[]>();
    for (const item of items) {
      let arr = map.get(item.towerId);
      if (!arr) {
        arr = [];
        map.set(item.towerId, arr);
      }
      arr.push(item);
    }
    /* Sort each tower's tiers by tier number ascending. */
    for (const arr of map.values()) {
      arr.sort((a, b) => a.tier - b.tier);
    }
    return map;
  }
}

/** Exported cache keys so Preload scene can use the same keys when loading. */
export { CACHE_KEYS as CONFIG_CACHE_KEYS };
