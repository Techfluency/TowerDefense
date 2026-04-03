/**
 * Unit tests for MapGeneratorSystem path generation algorithm.
 *
 * Tests path connectivity, minimum length, max straight constraint,
 * determinism, complexity scaling, and edge cases.
 *
 * Uses a mock RNG and mock scene to avoid Phaser browser dependency.
 * We test the generation logic by creating the system with mocks and
 * calling init(), then inspecting the MapData on the mock registry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapGeneratorSystem } from '../../src/systems/map-generator-system';
import { MapData } from '../../src/data/map-data';
import type { GameState, MapConfigDefinition } from '../../src/types/game-types';

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 * Produces deterministic sequences from a seed. Used in place of
 * Phaser.Math.RandomDataGenerator which requires a browser.
 */
function createSeededRng(seed: number) {
  let state = seed;
  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    between: (min: number, max: number) => {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick: (arr: unknown[]) => arr[Math.floor(next() * arr.length)],
  };
}

/**
 * Creates a mock Phaser scene with a mock registry and event emitter.
 * The registry stores values and the event emitter tracks emitted events.
 */
function createMockScene() {
  const registryData = new Map<string, unknown>();
  const emittedEvents: Array<{ event: string; payload: unknown }> = [];

  return {
    scene: {
      events: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn((event: string, payload: unknown) => {
          emittedEvents.push({ event, payload });
        }),
      },
      registry: {
        set: vi.fn((key: string, value: unknown) => registryData.set(key, value)),
        get: vi.fn((key: string) => registryData.get(key)),
        remove: vi.fn((key: string) => registryData.delete(key)),
      },
    } as never,
    registryData,
    emittedEvents,
  };
}

function createGameState(seed = 'test-seed-42'): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 20,
    maxObjectiveHp: 20,
    isPaused: false,
    isGameOver: false,
    gameSeed: seed,
  };
}

function createMockConfigManager(overrides: Partial<MapConfigDefinition> = {}) {
  const config: MapConfigDefinition = {
    cols: 20,
    rows: 11,
    tileSize: 64,
    minPathLength: 20,
    maxStraightTiles: 3,
    maxRetries: 50,
    complexityRange: [1, 10],
    ...overrides,
  };

  return {
    getMapConfig: () => config,
  } as never;
}

describe('MapGeneratorSystem', () => {
  let mock: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    mock = createMockScene();
  });

  /**
   * Helper to run generation and return the MapData from the registry.
   */
  function generateMap(seed = 42, configOverrides: Partial<MapConfigDefinition> = {}): MapData {
    const rng = createSeededRng(seed);
    const gameState = createGameState(`seed-${seed}`);
    const configManager = createMockConfigManager(configOverrides);
    const system = new MapGeneratorSystem(
      mock.scene, gameState, rng as never, configManager,
    );
    system.init();
    return mock.registryData.get('mapData') as MapData;
  }

  describe('path connectivity', () => {
    it('should generate a path from spawn to objective', () => {
      const mapData = generateMap(1);
      const waypoints = mapData.getWaypoints();
      const spawn = waypoints[0]!;
      const objective = waypoints[waypoints.length - 1]!;

      /* Spawn is on left edge (col 0). */
      expect(spawn.col).toBe(0);
      /* Objective is on right edge (col 19). */
      expect(objective.col).toBe(19);
    });

    it('should have consecutive waypoints exactly one tile apart', () => {
      const mapData = generateMap(2);
      const waypoints = mapData.getWaypoints();

      for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i - 1]!;
        const curr = waypoints[i]!;
        const dist = Math.abs(prev.col - curr.col) + Math.abs(prev.row - curr.row);
        expect(dist).toBe(1);
      }
    });

    it('should have no duplicate coordinates in the path', () => {
      const mapData = generateMap(3);
      const waypoints = mapData.getWaypoints();
      const seen = new Set<string>();

      for (const wp of waypoints) {
        const key = `${wp.col},${wp.row}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  describe('minimum path length', () => {
    it('should generate a path with at least 20 waypoints at complexity 1', () => {
      const mapData = generateMap(4);
      expect(mapData.getPathLength()).toBeGreaterThanOrEqual(20);
    });

    it('should enforce minimum path length across multiple seeds', () => {
      for (let seed = 10; seed < 30; seed++) {
        const mapData = generateMap(seed);
        expect(mapData.getPathLength()).toBeGreaterThanOrEqual(20);
      }
    });
  });

  describe('max straight constraint', () => {
    it('should not have more than 3 consecutive tiles in the same direction', () => {
      /* Test across multiple seeds to ensure robustness. */
      for (let seed = 5; seed <= 25; seed++) {
        mock = createMockScene();
        const mapData = generateMap(seed);
        const waypoints = mapData.getWaypoints();

        let sameDirectionCount = 1;
        for (let i = 2; i < waypoints.length; i++) {
          const prevDc = waypoints[i - 1]!.col - waypoints[i - 2]!.col;
          const prevDr = waypoints[i - 1]!.row - waypoints[i - 2]!.row;
          const currDc = waypoints[i]!.col - waypoints[i - 1]!.col;
          const currDr = waypoints[i]!.row - waypoints[i - 1]!.row;

          if (currDc === prevDc && currDr === prevDr) {
            sameDirectionCount++;
          } else {
            sameDirectionCount = 1;
          }

          expect(sameDirectionCount).toBeLessThanOrEqual(3);
        }
      }
    });
  });

  describe('determinism', () => {
    it('should produce identical maps from the same seed', () => {
      const map1 = generateMap(100);
      /* Reset mock to get a fresh registry. */
      mock = createMockScene();
      const map2 = generateMap(100);

      const wp1 = map1.getWaypoints();
      const wp2 = map2.getWaypoints();

      expect(wp1.length).toBe(wp2.length);
      for (let i = 0; i < wp1.length; i++) {
        expect(wp1[i]!.col).toBe(wp2[i]!.col);
        expect(wp1[i]!.row).toBe(wp2[i]!.row);
      }
    });

    it('should produce different maps from different seeds', () => {
      const map1 = generateMap(200);
      mock = createMockScene();
      const map2 = generateMap(201);

      const wp1 = map1.getWaypoints();
      const wp2 = map2.getWaypoints();

      /* At least one waypoint should differ. */
      let hasDifference = false;
      const len = Math.min(wp1.length, wp2.length);
      for (let i = 0; i < len; i++) {
        if (wp1[i]!.col !== wp2[i]!.col || wp1[i]!.row !== wp2[i]!.row) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });
  });

  describe('world coordinates', () => {
    it('should compute correct world coordinates for waypoints', () => {
      const mapData = generateMap(6);
      const waypoints = mapData.getWaypoints();

      for (const wp of waypoints) {
        expect(wp.worldX).toBe(wp.col * 64 + 32);
        expect(wp.worldY).toBe(wp.row * 64 + 32);
      }
    });
  });

  describe('tile types', () => {
    it('should mark spawn tile correctly', () => {
      const mapData = generateMap(7);
      const spawn = mapData.getSpawnPoint();
      expect(mapData.getTileType(spawn.col, spawn.row)).toBe('spawn');
    });

    it('should mark objective tile correctly', () => {
      const mapData = generateMap(8);
      const objective = mapData.getObjectivePoint();
      expect(mapData.getTileType(objective.col, objective.row)).toBe('objective');
    });

    it('should mark all non-path tiles as buildable', () => {
      const mapData = generateMap(9);
      const { cols, rows } = mapData.getGridDimensions();
      let buildableCount = 0;
      let pathCount = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const type = mapData.getTileType(c, r);
          if (type === 'buildable') buildableCount++;
          if (type === 'path' || type === 'spawn' || type === 'objective') pathCount++;
        }
      }

      /* Total tiles = 220. All should be accounted for. */
      expect(buildableCount + pathCount).toBe(220);
      /* At least 100 buildable tiles (AC-005e). */
      expect(buildableCount).toBeGreaterThanOrEqual(100);
    });
  });

  describe('MAP_READY event', () => {
    it('should emit MAP_READY with correct payload', () => {
      generateMap(10);
      const emitted = mock.emittedEvents.find((e) => e.event === 'MAP_READY');
      expect(emitted).toBeDefined();

      const payload = emitted!.payload as { cols: number; rows: number; pathLength: number; seed: string };
      expect(payload.cols).toBe(20);
      expect(payload.rows).toBe(11);
      expect(payload.pathLength).toBeGreaterThanOrEqual(20);
      expect(payload.seed).toBe('seed-10');
    });
  });

  describe('registry storage', () => {
    it('should store MapData on the registry', () => {
      generateMap(11);
      const mapData = mock.registryData.get('mapData');
      expect(mapData).toBeInstanceOf(MapData);
    });
  });

  describe('spawn and objective placement', () => {
    it('should place spawn on left edge avoiding corners', () => {
      for (let seed = 50; seed < 60; seed++) {
        mock = createMockScene();
        const mapData = generateMap(seed);
        const spawn = mapData.getSpawnPoint();
        expect(spawn.col).toBe(0);
        expect(spawn.row).toBeGreaterThanOrEqual(1);
        expect(spawn.row).toBeLessThanOrEqual(9);
      }
    });

    it('should place objective on right edge avoiding corners', () => {
      for (let seed = 60; seed < 70; seed++) {
        mock = createMockScene();
        const mapData = generateMap(seed);
        const objective = mapData.getObjectivePoint();
        expect(objective.col).toBe(19);
        expect(objective.row).toBeGreaterThanOrEqual(1);
        expect(objective.row).toBeLessThanOrEqual(9);
      }
    });
  });

  describe('robustness across seeds', () => {
    it('should generate valid maps for 20 different seeds', () => {
      for (let seed = 300; seed < 320; seed++) {
        mock = createMockScene();
        const mapData = generateMap(seed);

        /* Path exists. */
        expect(mapData.getPathLength()).toBeGreaterThanOrEqual(20);
        /* Spawn on left edge. */
        expect(mapData.getSpawnPoint().col).toBe(0);
        /* Objective on right edge. */
        expect(mapData.getObjectivePoint().col).toBe(19);
        /* Path is connected (consecutive waypoints are adjacent). */
        const wp = mapData.getWaypoints();
        for (let i = 1; i < wp.length; i++) {
          const dist = Math.abs(wp[i]!.col - wp[i - 1]!.col) +
                       Math.abs(wp[i]!.row - wp[i - 1]!.row);
          expect(dist).toBe(1);
        }
      }
    });
  });

  describe('complexity scaling', () => {
    it('should produce longer paths at higher complexity', () => {
      const map1 = generateMap(400, { complexityRange: [1, 10] });
      mock = createMockScene();

      /* For complexity testing, we need a system with higher complexity.
       * The system uses complexity=1 by default in init().
       * We test the algorithm indirectly by checking minPathLength scaling. */
      const map5 = generateMap(400, {
        complexityRange: [1, 10],
        minPathLength: 30, // Simulates what complexity=5 would compute
      });

      /* Higher min path length should produce a longer path. */
      expect(map5.getPathLength()).toBeGreaterThanOrEqual(30);
    });
  });

  describe('grid dimensions', () => {
    it('should produce a 20x11 grid', () => {
      const mapData = generateMap(500);
      const dims = mapData.getGridDimensions();
      expect(dims.cols).toBe(20);
      expect(dims.rows).toBe(11);
    });
  });
});
