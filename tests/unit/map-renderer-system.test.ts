/**
 * Unit tests for MapRendererSystem (BOLT-013).
 *
 * Tests the auto-tile variant integration: AUTO_TILE_READY event handling,
 * TileVariantMap two-tier lookup (variant key -> legacy flat key fallback),
 * backward compatibility when AutoTileSystem is absent, re-render behavior,
 * and destroy cleanup.
 *
 * Also verifies the MAP_READY fallback path and the guard against
 * double-rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapRendererSystem } from '../../src/systems/map-renderer-system';
import { GAME_EVENTS, REGISTRY_KEYS } from '../../src/types/game-types';
import type { GameState, TileType, TileVariantMap } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Tracks image creation calls for sprite key verification. */
interface CreatedImage {
  x: number;
  y: number;
  key: string;
  depth: number;
  destroyed: boolean;
}

/** Creates a mock Phaser scene with event emitter, registry, and add.image. */
function createMockScene() {
  const listeners: Array<{
    event: string;
    callback: Function;
    context: unknown;
  }> = [];

  const registryStore = new Map<string, unknown>();
  const createdImages: CreatedImage[] = [];

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
    add: {
      image: vi.fn((x: number, y: number, key: string) => {
        const img: CreatedImage = { x, y, key, depth: 0, destroyed: false };
        createdImages.push(img);
        return {
          setDepth: vi.fn((d: number) => {
            img.depth = d;
          }),
          destroy: vi.fn(() => {
            img.destroyed = true;
          }),
        };
      }),
    },
    _listeners: listeners,
    _registryStore: registryStore,
    _createdImages: createdImages,
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
    gameMode: 'stage',
    highestWaveReached: 0,
    campaignComplete: false,
  };
}

/**
 * Builds a simple MapData-like object for testing.
 * The grid is a 2D array of TileTypes. getTileType returns null for OOB.
 */
function createMockMapData(grid: TileType[][]) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  return {
    seed: 'test-seed',
    getGridDimensions: () => ({ cols, rows }),
    getTileType: (col: number, row: number): TileType | null => {
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
      return grid[row]![col]!;
    },
  };
}

/**
 * Builds a TileVariantMap from a grid, simulating what AutoTileSystem produces.
 * For simplicity, generates deterministic variant keys per tile type:
 * - path: tile-path-{bitmask placeholder} (we use tile-path-10 for testing)
 * - buildable: tile-buildable-{index}
 * - blocked: tile-blocked-{index}
 * - spawn: tile-spawn-e
 * - objective: tile-objective-w
 */
function createVariantMap(grid: TileType[][]): TileVariantMap {
  const map: TileVariantMap = new Map();
  let buildableIdx = 1;
  let blockedIdx = 1;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[0]?.length ?? 0); col++) {
      const t = grid[row]![col]!;
      const key = `${col},${row}`;
      switch (t) {
        case 'path':
          map.set(key, 'tile-path-10');
          break;
        case 'buildable':
          map.set(key, `tile-buildable-${((buildableIdx++ - 1) % 5) + 1}`);
          break;
        case 'blocked':
          map.set(key, `tile-blocked-${((blockedIdx++ - 1) % 3) + 1}`);
          break;
        case 'spawn':
          map.set(key, 'tile-spawn-e');
          break;
        case 'objective':
          map.set(key, 'tile-objective-w');
          break;
      }
    }
  }
  return map;
}

/** Helper: fires the named event on the mock scene by invoking registered listener. */
function fireEvent(mockScene: ReturnType<typeof createMockScene>, eventName: string): void {
  const listener = mockScene._listeners.find((l) => l.event === eventName);
  if (listener) {
    listener.callback.call(listener.context);
  }
}

// ---------------------------------------------------------------------------
// Init Tests
// ---------------------------------------------------------------------------

describe('MapRendererSystem', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let system: MapRendererSystem;

  beforeEach(() => {
    mockScene = createMockScene();
    gameState = createMockGameState();
    system = new MapRendererSystem(mockScene as never, gameState);
  });

  describe('init', () => {
    it('should register an AUTO_TILE_READY listener', () => {
      system.init();
      expect(mockScene.events.on).toHaveBeenCalledWith(
        GAME_EVENTS.AUTO_TILE_READY,
        expect.any(Function),
        expect.anything(),
      );
    });

    it('should register a MAP_READY fallback listener', () => {
      system.init();
      expect(mockScene.events.on).toHaveBeenCalledWith(
        GAME_EVENTS.MAP_READY,
        expect.any(Function),
        expect.anything(),
      );
    });

    it('should check registry for existing TileVariantMap on init', () => {
      system.init();
      expect(mockScene.registry.get).toHaveBeenCalledWith(
        REGISTRY_KEYS.TILE_VARIANT_MAP,
      );
    });

    it('should render immediately if TileVariantMap and mapData are already on registry', () => {
      const grid: TileType[][] = [
        ['path', 'buildable'],
      ];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      mockScene._registryStore.set('mapData', mapData);

      system.init();

      /* Two tiles should be rendered. */
      expect(mockScene._createdImages.length).toBe(2);
    });

    it('should NOT render on init if only mapData is present (no TileVariantMap)', () => {
      const grid: TileType[][] = [['path', 'buildable']];
      const mapData = createMockMapData(grid);
      mockScene._registryStore.set('mapData', mapData);

      system.init();

      /* No rendering yet -- waiting for AUTO_TILE_READY or MAP_READY. */
      expect(mockScene._createdImages.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // AUTO_TILE_READY Event Tests
  // ---------------------------------------------------------------------------

  describe('AUTO_TILE_READY handling', () => {
    it('should render tiles when AUTO_TILE_READY fires', () => {
      const grid: TileType[][] = [
        ['spawn', 'path', 'path', 'objective'],
        ['buildable', 'buildable', 'blocked', 'buildable'],
      ];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();

      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);

      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* 8 tiles in the 4x2 grid. */
      expect(mockScene._createdImages.length).toBe(8);
    });

    it('should use variant sprite keys from TileVariantMap', () => {
      const grid: TileType[][] = [
        ['path', 'buildable', 'spawn'],
      ];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      expect(keys).toContain('tile-path-10');
      expect(keys).toContain('tile-buildable-1');
      expect(keys).toContain('tile-spawn-e');
    });

    it('should use variant key for objective tile', () => {
      const grid: TileType[][] = [['objective']];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(mockScene._createdImages[0]!.key).toBe('tile-objective-w');
    });

    it('should use variant key for blocked tile', () => {
      const grid: TileType[][] = [['blocked']];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(mockScene._createdImages[0]!.key).toBe('tile-blocked-1');
    });

    it('should log error if AUTO_TILE_READY fires without mapData', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      system.init();
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AUTO_TILE_READY fired but no mapData'),
      );
      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Fallback Path Tests (MAP_READY without TileVariantMap)
  // ---------------------------------------------------------------------------

  describe('MAP_READY fallback handling', () => {
    it('should render tiles using legacy flat keys when MAP_READY fires without TileVariantMap', () => {
      const grid: TileType[][] = [
        ['path', 'buildable', 'blocked'],
      ];
      const mapData = createMockMapData(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      /* Legacy flat keys (no variant suffixes). */
      expect(keys).toEqual(['tile-path', 'tile-buildable', 'tile-blocked']);
    });

    it('should render spawn tile with legacy key when no variant map', () => {
      const grid: TileType[][] = [['spawn']];
      const mapData = createMockMapData(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);

      expect(mockScene._createdImages[0]!.key).toBe('tile-spawn');
    });

    it('should render objective tile with legacy key when no variant map', () => {
      const grid: TileType[][] = [['objective']];
      const mapData = createMockMapData(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);

      expect(mockScene._createdImages[0]!.key).toBe('tile-objective');
    });

    it('should skip rendering on MAP_READY if tiles are already rendered', () => {
      const grid: TileType[][] = [['path', 'buildable']];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      /* Pre-populate everything so init renders immediately. */
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      system.init();

      /* 2 tiles rendered by init fallback. */
      expect(mockScene._createdImages.length).toBe(2);

      /* Fire MAP_READY -- should NOT double-render. */
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);
      expect(mockScene._createdImages.filter((i) => !i.destroyed).length).toBe(2);
    });

    it('should log error if MAP_READY fires without mapData on registry', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      system.init();
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MAP_READY fired but no mapData'),
      );
      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Two-Tier Lookup: Fallback for Missing Variant Entries
  // ---------------------------------------------------------------------------

  describe('two-tier sprite key lookup', () => {
    it('should fall back to legacy key for tiles missing from TileVariantMap', () => {
      const grid: TileType[][] = [['path', 'buildable']];
      const mapData = createMockMapData(grid);

      /* Variant map only has an entry for the path tile, not buildable. */
      const partialVariantMap: TileVariantMap = new Map();
      partialVariantMap.set('0,0', 'tile-path-5');

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, partialVariantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      /* Path gets variant key, buildable gets legacy flat key. */
      expect(keys[0]).toBe('tile-path-5');
      expect(keys[1]).toBe('tile-buildable');
    });

    it('should use variant key when present in map', () => {
      const grid: TileType[][] = [['buildable']];
      const mapData = createMockMapData(grid);
      const variantMap: TileVariantMap = new Map();
      variantMap.set('0,0', 'tile-buildable-3');

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(mockScene._createdImages[0]!.key).toBe('tile-buildable-3');
    });

    it('should handle empty TileVariantMap gracefully (all tiles use legacy keys)', () => {
      const grid: TileType[][] = [['path', 'buildable', 'blocked']];
      const mapData = createMockMapData(grid);
      const emptyVariantMap: TileVariantMap = new Map();

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, emptyVariantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      expect(keys).toEqual(['tile-path', 'tile-buildable', 'tile-blocked']);
    });
  });

  // ---------------------------------------------------------------------------
  // Re-Render Tests
  // ---------------------------------------------------------------------------

  describe('re-render behavior', () => {
    it('should destroy existing sprites when re-rendering on AUTO_TILE_READY', () => {
      const grid: TileType[][] = [['path', 'buildable']];
      const mapData = createMockMapData(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);

      /* First render via MAP_READY (legacy keys). */
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);
      expect(mockScene._createdImages.length).toBe(2);

      /* Now AUTO_TILE_READY fires with variant map -- should re-render. */
      const variantMap = createVariantMap(grid);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* Original 2 sprites should be destroyed. */
      expect(mockScene._createdImages[0]!.destroyed).toBe(true);
      expect(mockScene._createdImages[1]!.destroyed).toBe(true);

      /* 2 new sprites should be created (total 4 in tracking array). */
      expect(mockScene._createdImages.length).toBe(4);
      expect(mockScene._createdImages[2]!.destroyed).toBe(false);
      expect(mockScene._createdImages[3]!.destroyed).toBe(false);
    });

    it('should use variant keys after re-render (not legacy keys)', () => {
      const grid: TileType[][] = [['path']];
      const mapData = createMockMapData(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);

      /* First render via MAP_READY -- legacy key. */
      fireEvent(mockScene, GAME_EVENTS.MAP_READY);
      expect(mockScene._createdImages[0]!.key).toBe('tile-path');

      /* Re-render via AUTO_TILE_READY -- variant key. */
      const variantMap: TileVariantMap = new Map();
      variantMap.set('0,0', 'tile-path-6');
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* The most recent sprite (index 1, after original at index 0). */
      const activeSprites = mockScene._createdImages.filter((i) => !i.destroyed);
      expect(activeSprites.length).toBe(1);
      expect(activeSprites[0]!.key).toBe('tile-path-6');
    });
  });

  // ---------------------------------------------------------------------------
  // Sprite Positioning Tests
  // ---------------------------------------------------------------------------

  describe('tile sprite positioning', () => {
    it('should position sprites at tile center (col*64+32, row*64+32)', () => {
      const grid: TileType[][] = [
        ['path', 'buildable'],
        ['blocked', 'spawn'],
      ];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* (0,0) -> x=32, y=32 */
      expect(mockScene._createdImages[0]).toMatchObject({ x: 32, y: 32 });
      /* (1,0) -> x=96, y=32 */
      expect(mockScene._createdImages[1]).toMatchObject({ x: 96, y: 32 });
      /* (0,1) -> x=32, y=96 */
      expect(mockScene._createdImages[2]).toMatchObject({ x: 32, y: 96 });
      /* (1,1) -> x=96, y=96 */
      expect(mockScene._createdImages[3]).toMatchObject({ x: 96, y: 96 });
    });

    it('should set depth to 0 for all tile sprites', () => {
      const grid: TileType[][] = [['path', 'buildable', 'spawn']];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      for (const img of mockScene._createdImages) {
        expect(img.depth).toBe(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Destroy Tests
  // ---------------------------------------------------------------------------

  describe('destroy', () => {
    it('should destroy all tile sprites on system destroy', () => {
      const grid: TileType[][] = [['path', 'buildable', 'blocked']];
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(mockScene._createdImages.length).toBe(3);

      system.destroy();

      /* All sprites should be marked destroyed. */
      for (const img of mockScene._createdImages) {
        expect(img.destroyed).toBe(true);
      }
    });

    it('should clean up event listeners via super.destroy()', () => {
      system.init();
      const listenerCountBefore = mockScene._listeners.length;
      expect(listenerCountBefore).toBeGreaterThan(0);

      system.destroy();

      /* events.off should have been called for each tracked listener. */
      expect(mockScene.events.off).toHaveBeenCalled();
    });

    it('should handle destroy when no tiles have been rendered', () => {
      system.init();
      expect(() => system.destroy()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Update Tests
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('should be a no-op (does not throw)', () => {
      system.init();
      expect(() => system.update(0, 16)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // All 27 Variant Sprite Keys Integration Test
  // ---------------------------------------------------------------------------

  describe('full variant map integration', () => {
    it('should render all 27 tile variant sprite keys without errors', () => {
      /* Build a grid that exercises all 5 tile types. */
      const grid: TileType[][] = [
        ['spawn', 'path', 'path', 'path', 'objective'],
        ['buildable', 'buildable', 'buildable', 'blocked', 'blocked'],
      ];
      const mapData = createMockMapData(grid);

      /* Build a complete variant map with distinct keys per cell. */
      const variantMap: TileVariantMap = new Map();
      variantMap.set('0,0', 'tile-spawn-e');
      variantMap.set('1,0', 'tile-path-10');
      variantMap.set('2,0', 'tile-path-10');
      variantMap.set('3,0', 'tile-path-8');
      variantMap.set('4,0', 'tile-objective-w');
      variantMap.set('0,1', 'tile-buildable-1');
      variantMap.set('1,1', 'tile-buildable-2');
      variantMap.set('2,1', 'tile-buildable-3');
      variantMap.set('3,1', 'tile-blocked-1');
      variantMap.set('4,1', 'tile-blocked-2');

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* All 10 tiles should render. */
      expect(mockScene._createdImages.length).toBe(10);

      /* Verify each sprite used the variant key (not a legacy key). */
      const keys = mockScene._createdImages.map((img) => img.key);
      expect(keys).toEqual([
        'tile-spawn-e',
        'tile-path-10',
        'tile-path-10',
        'tile-path-8',
        'tile-objective-w',
        'tile-buildable-1',
        'tile-buildable-2',
        'tile-buildable-3',
        'tile-blocked-1',
        'tile-blocked-2',
      ]);
    });

    it('should render all 11 path bitmask variants correctly', () => {
      /* 11 path tiles in a row, each with a specific variant key. */
      const pathMasks = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12];
      const grid: TileType[][] = [pathMasks.map(() => 'path' as TileType)];
      const mapData = createMockMapData(grid);

      const variantMap: TileVariantMap = new Map();
      pathMasks.forEach((mask, col) => {
        variantMap.set(`${col},0`, `tile-path-${mask}`);
      });

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      pathMasks.forEach((mask, idx) => {
        expect(keys[idx]).toBe(`tile-path-${mask}`);
      });
    });

    it('should render all 4 spawn direction variants', () => {
      const directions = ['n', 'e', 's', 'w'];
      const grid: TileType[][] = [directions.map(() => 'spawn' as TileType)];
      const mapData = createMockMapData(grid);

      const variantMap: TileVariantMap = new Map();
      directions.forEach((dir, col) => {
        variantMap.set(`${col},0`, `tile-spawn-${dir}`);
      });

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      directions.forEach((dir, idx) => {
        expect(keys[idx]).toBe(`tile-spawn-${dir}`);
      });
    });

    it('should render all 4 objective direction variants', () => {
      const directions = ['n', 'e', 's', 'w'];
      const grid: TileType[][] = [directions.map(() => 'objective' as TileType)];
      const mapData = createMockMapData(grid);

      const variantMap: TileVariantMap = new Map();
      directions.forEach((dir, col) => {
        variantMap.set(`${col},0`, `tile-objective-${dir}`);
      });

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      directions.forEach((dir, idx) => {
        expect(keys[idx]).toBe(`tile-objective-${dir}`);
      });
    });

    it('should render all 5 grass variant keys', () => {
      const grid: TileType[][] = [
        ['buildable', 'buildable', 'buildable', 'buildable', 'buildable'],
      ];
      const mapData = createMockMapData(grid);

      const variantMap: TileVariantMap = new Map();
      for (let i = 0; i < 5; i++) {
        variantMap.set(`${i},0`, `tile-buildable-${i + 1}`);
      }

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      for (let i = 0; i < 5; i++) {
        expect(keys[i]).toBe(`tile-buildable-${i + 1}`);
      }
    });

    it('should render all 3 blocked variant keys', () => {
      const grid: TileType[][] = [['blocked', 'blocked', 'blocked']];
      const mapData = createMockMapData(grid);

      const variantMap: TileVariantMap = new Map();
      for (let i = 0; i < 3; i++) {
        variantMap.set(`${i},0`, `tile-blocked-${i + 1}`);
      }

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      const keys = mockScene._createdImages.map((img) => img.key);
      for (let i = 0; i < 3; i++) {
        expect(keys[i]).toBe(`tile-blocked-${i + 1}`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle a 1x1 grid with variant map', () => {
      const grid: TileType[][] = [['path']];
      const mapData = createMockMapData(grid);
      const variantMap: TileVariantMap = new Map([['0,0', 'tile-path-0']]);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      expect(mockScene._createdImages.length).toBe(1);
      expect(mockScene._createdImages[0]!.key).toBe('tile-path-0');
    });

    it('should skip null tiles returned by getTileType', () => {
      /* Simulate a grid where some cells return null (shouldn't happen
       * with real MapData, but tests the guard). */
      const grid: TileType[][] = [['path', 'buildable']];
      const mapData = {
        seed: 'test',
        getGridDimensions: () => ({ cols: 3, rows: 1 }),
        getTileType: (col: number, _row: number): TileType | null => {
          if (col === 2) return null;
          return grid[0]![col]!;
        },
      };

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* Only 2 tiles rendered (col=2 skipped because null). */
      expect(mockScene._createdImages.length).toBe(2);
    });

    it('should handle a large 20x11 grid without errors', () => {
      const grid: TileType[][] = [];
      for (let r = 0; r < 11; r++) {
        const row: TileType[] = [];
        for (let c = 0; c < 20; c++) {
          row.push('buildable');
        }
        grid.push(row);
      }
      const mapData = createMockMapData(grid);
      const variantMap = createVariantMap(grid);

      system.init();
      mockScene._registryStore.set('mapData', mapData);
      mockScene._registryStore.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);
      fireEvent(mockScene, GAME_EVENTS.AUTO_TILE_READY);

      /* 220 tiles. */
      expect(mockScene._createdImages.length).toBe(220);
    });
  });
});
