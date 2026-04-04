/**
 * Unit tests for BOLT-012: Spawn and Objective Directional Variants.
 *
 * Tests the computeDirectionToNeighbor pure function for all four cardinal
 * directions, both fallback scenarios, and integration with the AutoTileSystem
 * to verify spawn/objective entries appear in the TileVariantMap.
 *
 * Test structure:
 * 1. Pure function tests: computeDirectionToNeighbor (all 4 directions + fallbacks)
 * 2. System integration tests: resolveAutoTiles produces correct spawn/objective keys
 * 3. Edge case tests: degenerate maps, single-waypoint, all-surrounded
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeDirectionToNeighbor,
  AutoTileSystem,
} from '../../src/systems/auto-tile-system';
import type { CardinalDirection } from '../../src/systems/auto-tile-system';
import { GAME_EVENTS, REGISTRY_KEYS } from '../../src/types/game-types';
import type { GameState, TileType, GridPoint } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test Helpers (mirrors auto-tile-system.test.ts pattern)
// ---------------------------------------------------------------------------

/** Creates a mock Phaser scene with event emitter and registry. */
function createMockScene() {
  const listeners: Array<{
    event: string;
    callback: Function;
    context: unknown;
  }> = [];

  const registryStore = new Map<string, unknown>();

  return {
    events: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        listeners.push({ event, callback, context });
      }),
      off: vi.fn((event: string, callback: Function, context: unknown) => {
        const idx = listeners.findIndex(
          (l) =>
            l.event === event &&
            l.callback === callback &&
            l.context === context,
        );
        if (idx >= 0) listeners.splice(idx, 1);
      }),
      emit: vi.fn(),
    },
    registry: {
      get: vi.fn((key: string) => registryStore.get(key)),
      set: vi.fn((key: string, value: unknown) => {
        registryStore.set(key, value);
      }),
      remove: vi.fn((key: string) => {
        registryStore.delete(key);
      }),
    },
    _listeners: listeners,
    _registryStore: registryStore,
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

/**
 * Creates a GridPoint at the given grid position.
 * World coordinates use 64px tile size (matches game config).
 */
function gp(col: number, row: number): GridPoint {
  return { col, row, worldX: col * 64 + 32, worldY: row * 64 + 32 };
}

/**
 * Builds a mock MapData object with a tile grid and waypoint list.
 * The grid is a 2D array of TileTypes. getTileType returns null for OOB.
 * Waypoints define the path from spawn (index 0) to objective (last index).
 */
function createMockMapData(
  grid: TileType[][],
  waypoints: GridPoint[],
  seed = 'test-seed',
) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return {
    seed,
    getGridDimensions: () => ({ cols, rows }),
    getTileType: (col: number, row: number): TileType | null => {
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
      return grid[row]![col]!;
    },
    getWaypoints: () => waypoints,
    getSpawnPoint: () => waypoints[0]!,
    getObjectivePoint: () => waypoints[waypoints.length - 1]!,
  };
}

/**
 * Helper: builds a simple getTileType accessor from a sparse grid description.
 * Cells not in overrides default to 'buildable'.
 */
function makeGetTileType(
  overrides: Record<string, TileType>,
  maxCol = 20,
  maxRow = 10,
): (c: number, r: number) => TileType | null {
  return (c, r) => {
    if (c < 0 || r < 0 || c > maxCol || r > maxRow) return null;
    return overrides[`${c},${r}`] ?? 'buildable';
  };
}

// ---------------------------------------------------------------------------
// Pure Function Tests: computeDirectionToNeighbor
// ---------------------------------------------------------------------------

describe('computeDirectionToNeighbor', () => {
  describe('exact waypoint match (Phase 1)', () => {
    it('should return "n" when target is directly north', () => {
      // Spawn at (5,5), first path tile at (5,4) -- north
      const get = makeGetTileType({ '5,5': 'spawn', '5,4': 'path' });
      const dir = computeDirectionToNeighbor(5, 5, 5, 4, get, 'e');
      expect(dir).toBe('n');
    });

    it('should return "e" when target is directly east', () => {
      // Spawn at (0,5), first path tile at (1,5) -- east
      const get = makeGetTileType({ '0,5': 'spawn', '1,5': 'path' });
      const dir = computeDirectionToNeighbor(0, 5, 1, 5, get, 'e');
      expect(dir).toBe('e');
    });

    it('should return "s" when target is directly south', () => {
      // Spawn at (5,0), first path tile at (5,1) -- south
      const get = makeGetTileType({ '5,0': 'spawn', '5,1': 'path' });
      const dir = computeDirectionToNeighbor(5, 0, 5, 1, get, 'e');
      expect(dir).toBe('s');
    });

    it('should return "w" when target is directly west', () => {
      // Objective at (10,5), last path tile at (9,5) -- west
      const get = makeGetTileType({ '10,5': 'objective', '9,5': 'path' });
      const dir = computeDirectionToNeighbor(10, 5, 9, 5, get, 'w');
      expect(dir).toBe('w');
    });
  });

  describe('path-scan fallback (Phase 2)', () => {
    it('should scan for adjacent path when target is not a cardinal neighbor', () => {
      // Spawn at (5,5), target is diagonal at (6,4) -- not cardinal.
      // But (6,5) is a path tile to the east, so fallback scan finds it.
      const get = makeGetTileType({ '5,5': 'spawn', '6,5': 'path' });
      const dir = computeDirectionToNeighbor(5, 5, 6, 4, get, 'e');
      expect(dir).toBe('e');
    });

    it('should find north path tile during fallback scan', () => {
      // Target is far away (non-adjacent), but (5,4) is a path tile north.
      const get = makeGetTileType({ '5,5': 'spawn', '5,4': 'path' });
      const dir = computeDirectionToNeighbor(5, 5, 100, 100, get, 'e');
      expect(dir).toBe('n');
    });

    it('should find south path tile during fallback scan', () => {
      const get = makeGetTileType({ '5,5': 'spawn', '5,6': 'path' });
      const dir = computeDirectionToNeighbor(5, 5, 100, 100, get, 'e');
      expect(dir).toBe('s');
    });

    it('should find west path tile during fallback scan', () => {
      const get = makeGetTileType({ '5,5': 'objective', '4,5': 'path' });
      const dir = computeDirectionToNeighbor(5, 5, 100, 100, get, 'w');
      expect(dir).toBe('w');
    });

    it('should prefer the first cardinal direction found (N before E before S before W)', () => {
      // Multiple adjacent path tiles -- scan order is N, E, S, W
      const get = makeGetTileType({
        '5,5': 'spawn',
        '5,4': 'path', // north
        '6,5': 'path', // east
        '5,6': 'path', // south
      });
      // Target is non-adjacent, so fallback scan kicks in -- finds N first
      const dir = computeDirectionToNeighbor(5, 5, 100, 100, get, 'e');
      expect(dir).toBe('n');
    });
  });

  describe('final fallback (Phase 3)', () => {
    it('should return spawn fallback "e" when no adjacent path exists', () => {
      // Spawn at (5,5), all neighbors are buildable (no path)
      const get = makeGetTileType({ '5,5': 'spawn' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dir = computeDirectionToNeighbor(5, 5, 5, 5, get, 'e');
      expect(dir).toBe('e');

      // Should log a warning about the fallback
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no adjacent path tile found'),
      );
      warnSpy.mockRestore();
    });

    it('should return objective fallback "w" when no adjacent path exists', () => {
      const get = makeGetTileType({ '10,5': 'objective' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dir = computeDirectionToNeighbor(10, 5, 10, 5, get, 'w');
      expect(dir).toBe('w');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('(10,5)'),
      );
      warnSpy.mockRestore();
    });

    it('should not log a warning when a path neighbor is found', () => {
      const get = makeGetTileType({ '5,5': 'spawn', '6,5': 'path' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      computeDirectionToNeighbor(5, 5, 6, 5, get, 'e');
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('edge positions', () => {
    it('should handle tile at top-left corner (0,0) with east path', () => {
      const get = makeGetTileType({ '0,0': 'spawn', '1,0': 'path' });
      const dir = computeDirectionToNeighbor(0, 0, 1, 0, get, 'e');
      expect(dir).toBe('e');
    });

    it('should handle tile at bottom-right corner with west path', () => {
      const get = makeGetTileType(
        { '19,10': 'objective', '18,10': 'path' },
        19,
        10,
      );
      const dir = computeDirectionToNeighbor(19, 10, 18, 10, get, 'w');
      expect(dir).toBe('w');
    });

    it('should handle tile on top edge with south path', () => {
      const get = makeGetTileType({ '5,0': 'spawn', '5,1': 'path' });
      const dir = computeDirectionToNeighbor(5, 0, 5, 1, get, 'e');
      expect(dir).toBe('s');
    });
  });
});

// ---------------------------------------------------------------------------
// AutoTileSystem Integration Tests: spawn/objective in TileVariantMap
// ---------------------------------------------------------------------------

describe('AutoTileSystem spawn/objective integration (BOLT-012)', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let system: AutoTileSystem;

  beforeEach(() => {
    mockScene = createMockScene();
    gameState = createMockGameState();
    system = new AutoTileSystem(mockScene as never, gameState);
  });

  /** Helper: set mapData on registry and init system, return the variant map. */
  function resolveWithMapData(
    grid: TileType[][],
    waypoints: GridPoint[],
    seed = 'test-seed',
  ): Map<string, string> {
    const mapData = createMockMapData(grid, waypoints, seed);
    mockScene._registryStore.set('mapData', mapData);
    system.init();

    return mockScene._registryStore.get(
      REGISTRY_KEYS.TILE_VARIANT_MAP,
    ) as Map<string, string>;
  }

  describe('spawn tile direction', () => {
    it('should assign tile-spawn-e when first path is east of spawn', () => {
      // spawn(0,0) -> path(1,0) -> path(2,0) -> objective(3,0)
      const grid: TileType[][] = [['spawn', 'path', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0), gp(3, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,0')).toBe('tile-spawn-e');
    });

    it('should assign tile-spawn-s when first path is south of spawn', () => {
      // Vertical path: spawn at top, path below
      const grid: TileType[][] = [
        ['spawn', 'buildable'],
        ['path', 'buildable'],
        ['path', 'buildable'],
        ['objective', 'buildable'],
      ];
      const waypoints = [gp(0, 0), gp(0, 1), gp(0, 2), gp(0, 3)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,0')).toBe('tile-spawn-s');
    });

    it('should assign tile-spawn-n when first path is north of spawn', () => {
      // Spawn below, path above
      const grid: TileType[][] = [
        ['path', 'buildable'],
        ['spawn', 'buildable'],
      ];
      // waypoints: spawn(0,1) -> path(0,0)
      const waypoints = [gp(0, 1), gp(0, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,1')).toBe('tile-spawn-n');
    });

    it('should assign tile-spawn-w when first path is west of spawn', () => {
      // Path to the left of spawn
      const grid: TileType[][] = [['objective', 'path', 'spawn']];
      // waypoints: spawn(2,0) -> path(1,0) -> objective(0,0)
      const waypoints = [gp(2, 0), gp(1, 0), gp(0, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('2,0')).toBe('tile-spawn-w');
    });
  });

  describe('objective tile direction', () => {
    it('should assign tile-objective-w when last path is west of objective', () => {
      // Standard left-to-right: objective is on the right, path approaches from west
      const grid: TileType[][] = [['spawn', 'path', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0), gp(3, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('3,0')).toBe('tile-objective-w');
    });

    it('should assign tile-objective-n when last path is north of objective', () => {
      // Path comes from above the objective
      const grid: TileType[][] = [
        ['spawn', 'buildable'],
        ['path', 'buildable'],
        ['path', 'buildable'],
        ['objective', 'buildable'],
      ];
      const waypoints = [gp(0, 0), gp(0, 1), gp(0, 2), gp(0, 3)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,3')).toBe('tile-objective-n');
    });

    it('should assign tile-objective-e when last path is east of objective', () => {
      // Path approaches from the right
      const grid: TileType[][] = [['objective', 'path', 'spawn']];
      const waypoints = [gp(2, 0), gp(1, 0), gp(0, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,0')).toBe('tile-objective-e');
    });

    it('should assign tile-objective-s when last path is south of objective', () => {
      // Objective on top, path comes from below
      const grid: TileType[][] = [
        ['objective', 'buildable'],
        ['path', 'buildable'],
        ['spawn', 'buildable'],
      ];
      const waypoints = [gp(0, 2), gp(0, 1), gp(0, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      expect(variantMap.get('0,0')).toBe('tile-objective-s');
    });
  });

  describe('TileVariantMap completeness', () => {
    it('should now include spawn and objective entries (BOLT-012 fills BOLT-011 gap)', () => {
      const grid: TileType[][] = [
        ['spawn', 'path', 'path', 'objective'],
        ['buildable', 'buildable', 'blocked', 'buildable'],
      ];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0), gp(3, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);

      // Before BOLT-012: spawn and objective had no entries (size was 6).
      // After BOLT-012: all 8 tiles have entries.
      // path: 2, buildable: 3, blocked: 1, spawn: 1, objective: 1 = 8
      expect(variantMap.size).toBe(8);
      expect(variantMap.has('0,0')).toBe(true); // spawn
      expect(variantMap.has('3,0')).toBe(true); // objective
    });

    it('should include spawn/objective entries in AUTO_TILE_READY tileCount', () => {
      const grid: TileType[][] = [['spawn', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0)];

      const mapData = createMockMapData(grid, waypoints);
      mockScene._registryStore.set('mapData', mapData);
      system.init();

      // path(1) + spawn(1) + objective(1) = 3 total tiles
      expect(mockScene.events.emit).toHaveBeenCalledWith(
        GAME_EVENTS.AUTO_TILE_READY,
        expect.objectContaining({ tileCount: 3 }),
      );
    });

    it('should store variant map on registry BEFORE emitting event (order preserved)', () => {
      const grid: TileType[][] = [['spawn', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0)];

      const mapData = createMockMapData(grid, waypoints);
      mockScene._registryStore.set('mapData', mapData);

      const callOrder: string[] = [];
      mockScene.registry.set = vi.fn((key: string, value: unknown) => {
        mockScene._registryStore.set(key, value);
        if (key === REGISTRY_KEYS.TILE_VARIANT_MAP) {
          callOrder.push('registry.set');
        }
      });
      mockScene.events.emit = vi.fn((event: string) => {
        if (event === GAME_EVENTS.AUTO_TILE_READY) {
          callOrder.push('events.emit');
        }
      });

      system.init();

      expect(callOrder).toEqual(['registry.set', 'events.emit']);
    });
  });

  describe('sprite key format', () => {
    it('should produce keys matching tile-spawn-{n|e|s|w} format', () => {
      const grid: TileType[][] = [['spawn', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      const spawnKey = variantMap.get('0,0')!;
      expect(spawnKey).toMatch(/^tile-spawn-[nesw]$/);
    });

    it('should produce keys matching tile-objective-{n|e|s|w} format', () => {
      const grid: TileType[][] = [['spawn', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);
      const objectiveKey = variantMap.get('2,0')!;
      expect(objectiveKey).toMatch(/^tile-objective-[nesw]$/);
    });
  });

  describe('fallback handling in full system', () => {
    it('should use fallback when spawn has no adjacent path tile', () => {
      // Spawn surrounded by buildable -- no adjacent path at all
      const grid: TileType[][] = [
        ['buildable', 'buildable', 'buildable'],
        ['buildable', 'spawn', 'buildable'],
        ['buildable', 'buildable', 'objective'],
      ];
      // Degenerate waypoints: spawn and objective only
      const waypoints = [gp(1, 1), gp(2, 2)];

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const variantMap = resolveWithMapData(grid, waypoints);

      // Spawn should fall back to 'e'
      expect(variantMap.get('1,1')).toBe('tile-spawn-e');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should use fallback when objective has no adjacent path tile', () => {
      const grid: TileType[][] = [
        ['spawn', 'buildable', 'buildable'],
        ['buildable', 'buildable', 'buildable'],
        ['buildable', 'buildable', 'objective'],
      ];
      const waypoints = [gp(0, 0), gp(2, 2)];

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const variantMap = resolveWithMapData(grid, waypoints);

      // Objective should fall back to 'w'
      expect(variantMap.get('2,2')).toBe('tile-objective-w');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('realistic map layout', () => {
    it('should correctly resolve a standard 5-column horizontal path', () => {
      // Typical layout: spawn on left edge, objective on right, path in between
      const grid: TileType[][] = [
        ['buildable', 'buildable', 'buildable', 'buildable', 'buildable'],
        ['spawn', 'path', 'path', 'path', 'objective'],
        ['buildable', 'buildable', 'buildable', 'buildable', 'buildable'],
      ];
      const waypoints = [
        gp(0, 1), gp(1, 1), gp(2, 1), gp(3, 1), gp(4, 1),
      ];

      const variantMap = resolveWithMapData(grid, waypoints);

      // Spawn faces east (path is to the right)
      expect(variantMap.get('0,1')).toBe('tile-spawn-e');
      // Objective faces west (path approaches from the left)
      expect(variantMap.get('4,1')).toBe('tile-objective-w');
      // Path tiles should have correct bitmasks
      expect(variantMap.get('1,1')).toBe('tile-path-10'); // E+W
      expect(variantMap.get('2,1')).toBe('tile-path-10'); // E+W
      expect(variantMap.get('3,1')).toBe('tile-path-10'); // E+W
    });

    it('should correctly resolve an L-shaped path with spawn south and objective east', () => {
      // L-shape: spawn at bottom-left, goes north, then east to objective
      const grid: TileType[][] = [
        ['path', 'path', 'objective'],
        ['path', 'buildable', 'buildable'],
        ['spawn', 'buildable', 'buildable'],
      ];
      const waypoints = [
        gp(0, 2), // spawn
        gp(0, 1), // path (going north)
        gp(0, 0), // path (corner: turn east)
        gp(1, 0), // path (going east)
        gp(2, 0), // objective
      ];

      const variantMap = resolveWithMapData(grid, waypoints);

      // Spawn faces north (first path tile is directly above)
      expect(variantMap.get('0,2')).toBe('tile-spawn-n');
      // Objective faces west (last path tile is to the left)
      expect(variantMap.get('2,0')).toBe('tile-objective-w');
    });
  });

  describe('existing BOLT-011 behavior preserved', () => {
    it('should still assign correct bitmask keys for path tiles', () => {
      const grid: TileType[][] = [['spawn', 'path', 'path', 'objective']];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0), gp(3, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);

      // Path tiles use bitmask keys -- spawn/objective treated as path-like
      // (1,0): W=spawn(path-like), E=path -> mask 10 (E+W)
      expect(variantMap.get('1,0')).toBe('tile-path-10');
      // (2,0): W=path, E=objective(path-like) -> mask 10 (E+W)
      expect(variantMap.get('2,0')).toBe('tile-path-10');
    });

    it('should still assign seeded variants for buildable tiles', () => {
      const grid: TileType[][] = [
        ['spawn', 'path', 'objective'],
        ['buildable', 'buildable', 'buildable'],
      ];
      const waypoints = [gp(0, 0), gp(1, 0), gp(2, 0)];

      const variantMap = resolveWithMapData(grid, waypoints);

      // All buildable tiles should have tile-buildable-N keys
      expect(variantMap.get('0,1')).toMatch(/^tile-buildable-[1-5]$/);
      expect(variantMap.get('1,1')).toMatch(/^tile-buildable-[1-5]$/);
      expect(variantMap.get('2,1')).toMatch(/^tile-buildable-[1-5]$/);
    });
  });
});
