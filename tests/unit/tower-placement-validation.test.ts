/**
 * Unit tests for tower placement validation logic.
 *
 * Tests the validation rules used by TowerPlacementSystem:
 * - MapData.isBuildable() tile validation
 * - TowerRegistry occupancy blocking
 * - Currency affordability gate
 * - Sell refund calculation correctness
 * - PlacedTower data model correctness
 *
 * These tests exercise the data-layer logic without Phaser rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapData } from '../../src/data/map-data';
import { TowerRegistry, SELL_REFUND_RATE } from '../../src/systems/tower-registry';
import type { GameState, MapCell, GridPoint, TileType } from '../../src/types/game-types';
import { TILE_SIZE } from '../../src/config/performance-budget';
import { resetIdCounter } from '../../src/utils/id-generator';

// --- Helpers ---

/** Builds a minimal 5x5 MapData with a simple horizontal path. */
function createTestMapData(): MapData {
  const cols = 5;
  const rows = 5;
  const grid: MapCell[][] = [];
  const waypoints: GridPoint[] = [];

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      let tileType: TileType = 'buildable';

      /* Row 2 is the path from spawn to objective. */
      if (r === 2 && c === 0) tileType = 'spawn';
      else if (r === 2 && c === cols - 1) tileType = 'objective';
      else if (r === 2) tileType = 'path';

      grid[r]![c] = { col: c, row: r, tileType, occupied: false };

      if (r === 2) {
        waypoints.push({
          col: c,
          row: r,
          worldX: c * TILE_SIZE + TILE_SIZE / 2,
          worldY: r * TILE_SIZE + TILE_SIZE / 2,
        });
      }
    }
  }

  return new MapData(grid, waypoints, cols, rows, 5, 'test-seed');
}

function createMockScene() {
  const registryData = new Map<string, unknown>();
  return {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    registry: {
      set: vi.fn((key: string, val: unknown) => registryData.set(key, val)),
      get: vi.fn((key: string) => registryData.get(key)),
      remove: vi.fn((key: string) => registryData.delete(key)),
    },
  };
}

function createMockGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 20,
    maxObjectiveHp: 20,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
  };
}

function createMockSprite() {
  return {
    destroy: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
  } as unknown as Phaser.GameObjects.Sprite;
}

/**
 * Simulates the placement validation check that TowerPlacementSystem performs
 * before committing a placement.
 */
function canPlaceTower(
  mapData: MapData,
  towerRegistry: TowerRegistry,
  gameState: GameState,
  col: number,
  row: number,
  towerCost: number,
): boolean {
  const buildable = mapData.isBuildable(col, row);
  const occupied = towerRegistry.isOccupied(col, row);
  const canAfford = gameState.currency >= towerCost;
  return buildable && !occupied && canAfford;
}

describe('Placement Validation Logic', () => {
  let mapData: MapData;
  let towerRegistry: TowerRegistry;
  let gameState: GameState;

  beforeEach(() => {
    resetIdCounter();
    mapData = createTestMapData();
    const mockScene = createMockScene();
    gameState = createMockGameState();
    towerRegistry = new TowerRegistry(
      mockScene as unknown as Phaser.Scene,
      gameState,
    );
    towerRegistry.init();
  });

  // --- Buildable tiles ---

  it('should allow placement on buildable tiles', () => {
    /* (0,0) is buildable in our test map. */
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(true);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 1, 50)).toBe(true);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 4, 4, 50)).toBe(true);
  });

  it('should reject placement on path tiles', () => {
    /* Row 2 columns 1-3 are path tiles. */
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 2, 50)).toBe(false);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 2, 2, 50)).toBe(false);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 3, 2, 50)).toBe(false);
  });

  it('should reject placement on spawn tile', () => {
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 2, 50)).toBe(false);
  });

  it('should reject placement on objective tile', () => {
    expect(canPlaceTower(mapData, towerRegistry, gameState, 4, 2, 50)).toBe(false);
  });

  it('should reject placement on out-of-bounds coordinates', () => {
    expect(canPlaceTower(mapData, towerRegistry, gameState, -1, 0, 50)).toBe(false);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, -1, 50)).toBe(false);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 5, 0, 50)).toBe(false);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 5, 50)).toBe(false);
  });

  // --- Occupancy blocking ---

  it('should reject placement on an occupied tile', () => {
    towerRegistry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 1, 50)).toBe(false);
  });

  it('should allow placement on adjacent tiles when one is occupied', () => {
    towerRegistry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 0, 50)).toBe(true);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 1, 50)).toBe(true);
  });

  it('should allow placement after tower is sold (tile freed)', () => {
    const tower = towerRegistry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 1, 50)).toBe(false);

    towerRegistry.removeTower(tower.instanceId);
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 1, 50)).toBe(true);
  });

  // --- Currency affordability ---

  it('should reject placement when currency is insufficient', () => {
    gameState.currency = 40;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(false);
  });

  it('should allow placement when currency exactly equals cost', () => {
    gameState.currency = 50;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(true);
  });

  it('should allow placement when currency exceeds cost', () => {
    gameState.currency = 200;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 100)).toBe(true);
  });

  it('should reject placement at zero currency', () => {
    gameState.currency = 0;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(false);
  });

  // --- Combined validation ---

  it('should reject when tile is buildable but occupied and affordable', () => {
    towerRegistry.registerTower('ranged', 0, 0, 32, 32, 50, createMockSprite());
    gameState.currency = 200;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(false);
  });

  it('should reject when tile is buildable and unoccupied but unaffordable', () => {
    gameState.currency = 10;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 0, 0, 50)).toBe(false);
  });

  it('should reject when tile is path even with currency and no occupancy', () => {
    gameState.currency = 999;
    expect(canPlaceTower(mapData, towerRegistry, gameState, 1, 2, 50)).toBe(false);
  });
});

describe('Sell Refund Calculations', () => {
  it('should refund 50% of 50 cost = 25', () => {
    expect(Math.floor(50 * SELL_REFUND_RATE)).toBe(25);
  });

  it('should refund 50% of 100 cost = 50', () => {
    expect(Math.floor(100 * SELL_REFUND_RATE)).toBe(50);
  });

  it('should refund 50% of 75 cost = 37 (rounded down)', () => {
    expect(Math.floor(75 * SELL_REFUND_RATE)).toBe(37);
  });

  it('should refund 50% of 60 cost = 30', () => {
    expect(Math.floor(60 * SELL_REFUND_RATE)).toBe(30);
  });
});

describe('Depth Layer Ordering', () => {
  it('should have correct depth ordering for placement visuals', async () => {
    const { DEPTH_TILES } = await import('../../src/config/depth-layers');
    const { DEPTH_ENEMY_GROUND } = await import('../../src/config/depth-layers');
    const { DEPTH_TOWERS } = await import('../../src/config/depth-layers');
    const { DEPTH_RANGE_PREVIEW } = await import('../../src/config/depth-layers');
    const { DEPTH_PLACEMENT_GHOST } = await import('../../src/config/depth-layers');
    const { DEPTH_ENEMY_FLYING } = await import('../../src/config/depth-layers');
    const { DEPTH_UI } = await import('../../src/config/depth-layers');

    /* Range preview must be above towers but below ghost. */
    expect(DEPTH_RANGE_PREVIEW).toBeGreaterThan(DEPTH_TOWERS);
    expect(DEPTH_RANGE_PREVIEW).toBeLessThan(DEPTH_PLACEMENT_GHOST);

    /* Ghost must be above towers but below flying enemies. */
    expect(DEPTH_PLACEMENT_GHOST).toBeGreaterThan(DEPTH_TOWERS);
    expect(DEPTH_PLACEMENT_GHOST).toBeLessThan(DEPTH_ENEMY_FLYING);

    /* UI must be above everything. */
    expect(DEPTH_UI).toBeGreaterThan(DEPTH_PLACEMENT_GHOST);
    expect(DEPTH_UI).toBeGreaterThan(DEPTH_ENEMY_FLYING);

    /* Ground enemies below towers. */
    expect(DEPTH_ENEMY_GROUND).toBeLessThan(DEPTH_TOWERS);

    /* Tiles below everything. */
    expect(DEPTH_TILES).toBeLessThan(DEPTH_ENEMY_GROUND);
  });
});

describe('Tower Config Validation', () => {
  it('should have exactly 4 tower types in towers.json', async () => {
    /* Read the raw JSON file to verify it has 4 entries. */
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const towersPath = resolve(projectRoot, 'public', 'data', 'towers.json');
    const towers = JSON.parse(readFileSync(towersPath, 'utf-8'));

    expect(towers).toHaveLength(4);
    expect(towers.map((t: { id: string }) => t.id)).toEqual([
      'ranged',
      'focused',
      'broadcast',
      'antiair',
    ]);
  });

  it('should have correct costs for all tower types', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const towersPath = resolve(projectRoot, 'public', 'data', 'towers.json');
    const towers = JSON.parse(readFileSync(towersPath, 'utf-8'));

    const costMap: Record<string, number> = {};
    for (const t of towers) {
      costMap[t.id] = t.cost;
    }

    expect(costMap['ranged']).toBe(50);
    expect(costMap['focused']).toBe(100);
    expect(costMap['broadcast']).toBe(75);
    expect(costMap['antiair']).toBe(60);
  });

  it('should have valid spriteKeys for all tower types', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const towersPath = resolve(projectRoot, 'public', 'data', 'towers.json');
    const towers = JSON.parse(readFileSync(towersPath, 'utf-8'));

    const expectedKeys = ['tower-ranged', 'tower-focused', 'tower-broadcast', 'tower-antiair'];
    const actualKeys = towers.map((t: { spriteKey: string }) => t.spriteKey);

    for (const key of expectedKeys) {
      expect(actualKeys).toContain(key);
    }
  });
});

describe('PlacedTower Data Model', () => {
  it('should have default upgradeLevel of 1', () => {
    resetIdCounter();
    const mockScene = createMockScene();
    const gameState = createMockGameState();
    const registry = new TowerRegistry(
      mockScene as unknown as Phaser.Scene,
      gameState,
    );
    registry.init();

    const tower = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(tower.upgradeLevel).toBe(1);
  });

  it('should compute world coordinates as col*64+32 and row*64+32', () => {
    /* Verify the formula used by the placement system. */
    const col = 5;
    const row = 3;
    const expectedWorldX = col * TILE_SIZE + TILE_SIZE / 2;
    const expectedWorldY = row * TILE_SIZE + TILE_SIZE / 2;

    expect(expectedWorldX).toBe(352);
    expect(expectedWorldY).toBe(224);
    expect(TILE_SIZE).toBe(64);
  });
});
