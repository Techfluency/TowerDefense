/**
 * Unit tests for ConfigManager.
 *
 * Tests typed config access, missing config handling, and cache interaction.
 * Mocks the Phaser cache since unit tests run in Node without a browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager } from '../../src/utils/config-manager';
import type {
  TowerDefinition,
  EnemyDefinition,
  WaveDefinition,
  ProjectileDefinition,
} from '../../src/types/game-types';

/* Sample test data matching the JSON config file structure. */
const mockTowers: TowerDefinition[] = [
  {
    id: 'ranged',
    name: 'Arrow Tower',
    towerClass: 'ranged',
    cost: 50,
    range: 200,
    fireRate: 1.5,
    damage: 10,
    maxHp: 0,
    targetingMode: 'first',
    description: 'Fires arrows',
    spriteKey: 'tower-ranged',
  },
  {
    id: 'focused',
    name: 'Sniper Tower',
    towerClass: 'focused',
    cost: 100,
    range: 350,
    fireRate: 0.5,
    damage: 40,
    maxHp: 0,
    targetingMode: 'strongest',
    description: 'High damage',
    spriteKey: 'tower-focused',
  },
];

const mockEnemies: EnemyDefinition[] = [
  {
    id: 'runner',
    name: 'Runner',
    baseHp: 30,
    baseSpeed: 120,
    armor: 0,
    breakthroughDamage: 1,
    currencyReward: 5,
    scoreReward: 10,
    movementType: 'ground',
    spriteKey: 'enemy-runner',
  },
];

const mockWaves: WaveDefinition[] = [
  {
    waveNumber: 1,
    groups: [{ enemyId: 'runner', count: 5, spawnIntervalMs: 1000, delayMs: 0 }],
    prepTimeMs: 5000,
    isBossWave: false,
  },
];

const mockProjectiles: ProjectileDefinition[] = [
  { id: 'arrow', speed: 400, splashRadius: 0, spriteKey: 'projectile-arrow' },
];

const mockMapConfig = {
  cols: 20,
  rows: 11,
  tileSize: 64,
  minPathLength: 20,
  maxStraightTiles: 3,
  maxRetries: 50,
  complexityRange: [1, 10],
};

/**
 * Creates a mock Phaser scene with a fake JSON cache.
 * The cache returns the provided data for the matching cache key.
 */
function createMockScene(cacheData: Record<string, unknown>) {
  return {
    cache: {
      json: {
        get: vi.fn((key: string) => cacheData[key]),
      },
    },
  } as never;
}

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockScene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    mockScene = createMockScene({
      'config-towers': mockTowers,
      'config-enemies': mockEnemies,
      'config-waves': mockWaves,
      'config-projectiles': mockProjectiles,
      'config-map': mockMapConfig,
      'config-tower-upgrades': [],
    });
    configManager = new ConfigManager(mockScene);
  });

  describe('getTower', () => {
    it('should return a tower definition by id', () => {
      const tower = configManager.getTower('ranged');
      expect(tower.id).toBe('ranged');
      expect(tower.name).toBe('Arrow Tower');
      expect(tower.cost).toBe(50);
      expect(tower.range).toBe(200);
    });

    it('should return a different tower by id', () => {
      const tower = configManager.getTower('focused');
      expect(tower.id).toBe('focused');
      expect(tower.damage).toBe(40);
    });

    it('should throw for unknown tower id', () => {
      expect(() => configManager.getTower('nonexistent')).toThrow(
        'ConfigManager: tower "nonexistent" not found',
      );
    });
  });

  describe('getAllTowers', () => {
    it('should return all tower definitions', () => {
      const towers = configManager.getAllTowers();
      expect(towers).toHaveLength(2);
      expect(towers.map((t) => t.id)).toContain('ranged');
      expect(towers.map((t) => t.id)).toContain('focused');
    });
  });

  describe('getEnemy', () => {
    it('should return an enemy definition by id', () => {
      const enemy = configManager.getEnemy('runner');
      expect(enemy.id).toBe('runner');
      expect(enemy.baseHp).toBe(30);
      expect(enemy.movementType).toBe('ground');
    });

    it('should throw for unknown enemy id', () => {
      expect(() => configManager.getEnemy('boss')).toThrow(
        'ConfigManager: enemy "boss" not found',
      );
    });
  });

  describe('getAllEnemies', () => {
    it('should return all enemy definitions', () => {
      const enemies = configManager.getAllEnemies();
      expect(enemies).toHaveLength(1);
      expect(enemies[0]!.id).toBe('runner');
    });
  });

  describe('getWaves', () => {
    it('should return all wave definitions in order', () => {
      const waves = configManager.getWaves();
      expect(waves).toHaveLength(1);
      expect(waves[0]!.waveNumber).toBe(1);
      expect(waves[0]!.groups).toHaveLength(1);
    });
  });

  describe('getProjectile', () => {
    it('should return a projectile definition by id', () => {
      const proj = configManager.getProjectile('arrow');
      expect(proj.id).toBe('arrow');
      expect(proj.speed).toBe(400);
      expect(proj.splashRadius).toBe(0);
    });

    it('should throw for unknown projectile id', () => {
      expect(() => configManager.getProjectile('laser')).toThrow(
        'ConfigManager: projectile "laser" not found',
      );
    });
  });

  describe('cache miss handling', () => {
    it('should throw if towers config is not in cache', () => {
      const badScene = createMockScene({
        'config-enemies': mockEnemies,
        'config-waves': mockWaves,
        'config-projectiles': mockProjectiles,
        'config-map': mockMapConfig,
        'config-tower-upgrades': [],
      });
      expect(() => new ConfigManager(badScene)).toThrow(
        'towers.json" not found in cache',
      );
    });

    it('should throw if enemies config is not in cache', () => {
      const badScene = createMockScene({
        'config-towers': mockTowers,
        'config-waves': mockWaves,
        'config-projectiles': mockProjectiles,
        'config-map': mockMapConfig,
        'config-tower-upgrades': [],
      });
      expect(() => new ConfigManager(badScene)).toThrow(
        'enemies.json" not found in cache',
      );
    });

    it('should throw if waves config is not in cache', () => {
      const badScene = createMockScene({
        'config-towers': mockTowers,
        'config-enemies': mockEnemies,
        'config-projectiles': mockProjectiles,
        'config-map': mockMapConfig,
        'config-tower-upgrades': [],
      });
      expect(() => new ConfigManager(badScene)).toThrow(
        'waves.json" not found in cache',
      );
    });

    it('should throw if projectiles config is not in cache', () => {
      const badScene = createMockScene({
        'config-towers': mockTowers,
        'config-enemies': mockEnemies,
        'config-waves': mockWaves,
        'config-map': mockMapConfig,
        'config-tower-upgrades': [],
      });
      expect(() => new ConfigManager(badScene)).toThrow(
        'projectiles.json" not found in cache',
      );
    });
  });
});
