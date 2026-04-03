/**
 * Map data query API for the generated map.
 *
 * This class holds the complete state of a generated map: the tile grid,
 * the ordered path waypoints, and spawn/objective positions. It exposes
 * read-only query methods consumed by downstream systems:
 * - BOLT-003 (enemy system): getWaypoints(), getSpawnWorldPos()
 * - BOLT-004 (wave system): getSpawnWorldPos()
 * - BOLT-005 (tower placement): isBuildable(), getTileType()
 * - BOLT-009 (HUD): getGridDimensions()
 *
 * MapData is a pure data class with no Phaser dependency -- fully unit-testable.
 * It is stored on the Phaser registry by MapGeneratorSystem and read by any system.
 */
import type { MapCell, TileType, GridPoint } from '../types/game-types';

export class MapData {
  /** 2D tile grid indexed as grid[row][col]. */
  private readonly grid: MapCell[][];

  /** Ordered path from spawn (first) to objective (last). */
  private readonly waypoints: GridPoint[];

  /** Spawn tile coordinates. */
  private readonly spawnPoint: GridPoint;

  /** Objective tile coordinates. */
  private readonly objectivePoint: GridPoint;

  /** Grid column count. */
  private readonly cols: number;

  /** Grid row count. */
  private readonly rows: number;

  /** Complexity value used for this generation. */
  public readonly complexity: number;

  /** Seed that produced this map. */
  public readonly seed: string;

  /**
   * @param grid - 2D array of MapCells indexed as [row][col].
   * @param waypoints - Ordered path coordinates from spawn to objective.
   * @param cols - Number of tile columns.
   * @param rows - Number of tile rows.
   * @param complexity - Complexity value used for generation.
   * @param seed - Seed string used for generation.
   */
  constructor(
    grid: MapCell[][],
    waypoints: GridPoint[],
    cols: number,
    rows: number,
    complexity: number,
    seed: string,
  ) {
    this.grid = grid;
    this.waypoints = waypoints;
    this.spawnPoint = waypoints[0]!;
    this.objectivePoint = waypoints[waypoints.length - 1]!;
    this.cols = cols;
    this.rows = rows;
    this.complexity = complexity;
    this.seed = seed;
  }

  /**
   * Returns the ordered path from spawn to objective.
   * Each point has both grid coordinates and world-pixel coordinates.
   *
   * @returns Array of GridPoints ordered spawn-first, objective-last.
   */
  getWaypoints(): GridPoint[] {
    return this.waypoints;
  }

  /**
   * Returns the spawn tile coordinates.
   *
   * @returns GridPoint for the spawn tile (always column 0).
   */
  getSpawnPoint(): GridPoint {
    return this.spawnPoint;
  }

  /**
   * Returns the objective tile coordinates.
   *
   * @returns GridPoint for the objective tile (always last column).
   */
  getObjectivePoint(): GridPoint {
    return this.objectivePoint;
  }

  /**
   * Returns the spawn tile center in world-pixel coordinates.
   * Convenience method for BOLT-003/004 enemy positioning.
   *
   * @returns Pixel position at the center of the spawn tile.
   */
  getSpawnWorldPos(): { x: number; y: number } {
    return { x: this.spawnPoint.worldX, y: this.spawnPoint.worldY };
  }

  /**
   * Returns the objective tile center in world-pixel coordinates.
   *
   * @returns Pixel position at the center of the objective tile.
   */
  getObjectiveWorldPos(): { x: number; y: number } {
    return { x: this.objectivePoint.worldX, y: this.objectivePoint.worldY };
  }

  /**
   * Checks whether a tile is a legal tower placement zone.
   * Returns false for path, spawn, objective, and out-of-bounds coordinates.
   *
   * @param col - Grid column to check.
   * @param row - Grid row to check.
   * @returns True if the tile is buildable.
   */
  isBuildable(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return false;
    }
    return this.grid[row]![col]!.tileType === 'buildable';
  }

  /**
   * Returns the tile type at the given grid coordinates.
   *
   * @param col - Grid column.
   * @param row - Grid row.
   * @returns The TileType, or null if coordinates are out of bounds.
   */
  getTileType(col: number, row: number): TileType | null {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return null;
    }
    return this.grid[row]![col]!.tileType;
  }

  /**
   * Returns the grid dimensions.
   *
   * @returns Object with cols and rows counts.
   */
  getGridDimensions(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  /**
   * Returns the number of waypoints in the path.
   *
   * @returns Path length (waypoint count).
   */
  getPathLength(): number {
    return this.waypoints.length;
  }
}
