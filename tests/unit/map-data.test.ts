/**
 * Unit tests for MapData query API.
 *
 * Tests all public methods: getWaypoints, getSpawnPoint, getObjectivePoint,
 * getSpawnWorldPos, getObjectiveWorldPos, isBuildable, getTileType,
 * getGridDimensions, getPathLength.
 *
 * Uses a small 5x3 grid for clarity. Real grids are 20x11.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MapData } from '../../src/data/map-data';
import type { MapCell, GridPoint } from '../../src/types/game-types';

/** TILE_SIZE matches performance-budget.ts. */
const TILE_SIZE = 64;

/**
 * Creates a small 5x3 test grid with a simple path:
 * Row 0: B B B B B
 * Row 1: S P P P O
 * Row 2: B B B B B
 *
 * S=spawn, P=path, O=objective, B=buildable
 */
function createTestMapData(): MapData {
  const cols = 5;
  const rows = 3;

  /* Build grid. */
  const grid: MapCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: MapCell[] = [];
    for (let c = 0; c < cols; c++) {
      let tileType: MapCell['tileType'] = 'buildable';
      if (r === 1) {
        if (c === 0) tileType = 'spawn';
        else if (c === cols - 1) tileType = 'objective';
        else tileType = 'path';
      }
      row.push({ col: c, row: r, tileType, occupied: false });
    }
    grid.push(row);
  }

  /* Simple left-to-right path through row 1. */
  const waypoints: GridPoint[] = [];
  for (let c = 0; c < cols; c++) {
    waypoints.push({
      col: c,
      row: 1,
      worldX: c * TILE_SIZE + TILE_SIZE / 2,
      worldY: 1 * TILE_SIZE + TILE_SIZE / 2,
    });
  }

  return new MapData(grid, waypoints, cols, rows, 1, 'test-seed');
}

describe('MapData', () => {
  let mapData: MapData;

  beforeEach(() => {
    mapData = createTestMapData();
  });

  describe('getWaypoints', () => {
    it('should return all waypoints in order', () => {
      const wp = mapData.getWaypoints();
      expect(wp).toHaveLength(5);
      expect(wp[0]!.col).toBe(0);
      expect(wp[4]!.col).toBe(4);
    });

    it('should have spawn as the first waypoint', () => {
      const wp = mapData.getWaypoints();
      expect(wp[0]!.col).toBe(0);
      expect(wp[0]!.row).toBe(1);
    });

    it('should have objective as the last waypoint', () => {
      const wp = mapData.getWaypoints();
      expect(wp[wp.length - 1]!.col).toBe(4);
      expect(wp[wp.length - 1]!.row).toBe(1);
    });
  });

  describe('getSpawnPoint', () => {
    it('should return spawn coordinates at column 0', () => {
      const spawn = mapData.getSpawnPoint();
      expect(spawn.col).toBe(0);
      expect(spawn.row).toBe(1);
    });

    it('should have correct world coordinates', () => {
      const spawn = mapData.getSpawnPoint();
      expect(spawn.worldX).toBe(32); // 0 * 64 + 32
      expect(spawn.worldY).toBe(96); // 1 * 64 + 32
    });
  });

  describe('getObjectivePoint', () => {
    it('should return objective coordinates at last column', () => {
      const obj = mapData.getObjectivePoint();
      expect(obj.col).toBe(4);
      expect(obj.row).toBe(1);
    });

    it('should have correct world coordinates', () => {
      const obj = mapData.getObjectivePoint();
      expect(obj.worldX).toBe(4 * TILE_SIZE + TILE_SIZE / 2);
      expect(obj.worldY).toBe(1 * TILE_SIZE + TILE_SIZE / 2);
    });
  });

  describe('getSpawnWorldPos', () => {
    it('should return pixel coordinates at tile center', () => {
      const pos = mapData.getSpawnWorldPos();
      expect(pos.x).toBe(32);
      expect(pos.y).toBe(96);
    });
  });

  describe('getObjectiveWorldPos', () => {
    it('should return pixel coordinates at tile center', () => {
      const pos = mapData.getObjectiveWorldPos();
      expect(pos.x).toBe(4 * TILE_SIZE + TILE_SIZE / 2);
      expect(pos.y).toBe(1 * TILE_SIZE + TILE_SIZE / 2);
    });
  });

  describe('isBuildable', () => {
    it('should return true for buildable tiles', () => {
      expect(mapData.isBuildable(0, 0)).toBe(true);
      expect(mapData.isBuildable(2, 0)).toBe(true);
      expect(mapData.isBuildable(4, 2)).toBe(true);
    });

    it('should return false for path tiles', () => {
      expect(mapData.isBuildable(1, 1)).toBe(false);
      expect(mapData.isBuildable(2, 1)).toBe(false);
      expect(mapData.isBuildable(3, 1)).toBe(false);
    });

    it('should return false for spawn tile', () => {
      expect(mapData.isBuildable(0, 1)).toBe(false);
    });

    it('should return false for objective tile', () => {
      expect(mapData.isBuildable(4, 1)).toBe(false);
    });

    it('should return false for out-of-bounds coordinates', () => {
      expect(mapData.isBuildable(-1, 0)).toBe(false);
      expect(mapData.isBuildable(0, -1)).toBe(false);
      expect(mapData.isBuildable(5, 0)).toBe(false);
      expect(mapData.isBuildable(0, 3)).toBe(false);
    });
  });

  describe('getTileType', () => {
    it('should return buildable for non-path tiles', () => {
      expect(mapData.getTileType(0, 0)).toBe('buildable');
    });

    it('should return path for path tiles', () => {
      expect(mapData.getTileType(2, 1)).toBe('path');
    });

    it('should return spawn for the spawn tile', () => {
      expect(mapData.getTileType(0, 1)).toBe('spawn');
    });

    it('should return objective for the objective tile', () => {
      expect(mapData.getTileType(4, 1)).toBe('objective');
    });

    it('should return null for out-of-bounds', () => {
      expect(mapData.getTileType(-1, 0)).toBeNull();
      expect(mapData.getTileType(5, 0)).toBeNull();
      expect(mapData.getTileType(0, -1)).toBeNull();
      expect(mapData.getTileType(0, 3)).toBeNull();
    });
  });

  describe('getGridDimensions', () => {
    it('should return correct dimensions', () => {
      const dims = mapData.getGridDimensions();
      expect(dims.cols).toBe(5);
      expect(dims.rows).toBe(3);
    });
  });

  describe('getPathLength', () => {
    it('should return the waypoint count', () => {
      expect(mapData.getPathLength()).toBe(5);
    });
  });

  describe('metadata', () => {
    it('should store seed', () => {
      expect(mapData.seed).toBe('test-seed');
    });

    it('should store complexity', () => {
      expect(mapData.complexity).toBe(1);
    });
  });
});
