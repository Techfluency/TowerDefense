/**
 * Procedural map generator system.
 *
 * Generates a valid tower defense map using a constrained random walk algorithm.
 * Produces a single connected path from a left-edge spawn to a right-edge objective,
 * with all remaining tiles marked as buildable. The result is stored on the Phaser
 * registry as 'mapData' and a MAP_READY event is emitted.
 *
 * This system is pure logic -- no rendering. It runs once during init() and has
 * no per-frame update work. MapRendererSystem handles the visual representation.
 *
 * Algorithm overview:
 * 1. Pick spawn (col 0) and objective (last col) rows randomly.
 * 2. Constrained random walk from spawn toward objective.
 * 3. Enforces: min path length, max consecutive straight tiles, no 2x2 blocks.
 * 4. Backtracking on dead ends. Full retry if backtracking fails.
 * 5. Build MapData from the completed path + grid.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { MapData } from '../data/map-data';
import { TILE_SIZE, MAP_OFFSET_Y } from '../config/performance-budget';
import {
  GAME_EVENTS,
  type GameState,
  type MapCell,
  type GridPoint,
  type MapConfigDefinition,
} from '../types/game-types';
import type { MapReadyPayload } from '../types/events';
import type { ConfigManager } from '../utils/config-manager';

/** Cardinal direction vectors for path generation. */
const DIRECTIONS = {
  RIGHT: { dc: 1, dr: 0 },
  LEFT: { dc: -1, dr: 0 },
  DOWN: { dc: 0, dr: 1 },
  UP: { dc: 0, dr: -1 },
} as const;

type Direction = keyof typeof DIRECTIONS;
const ALL_DIRECTIONS: Direction[] = ['RIGHT', 'LEFT', 'DOWN', 'UP'];

export class MapGeneratorSystem extends BaseSystem {
  /** Seeded RNG from the Gameplay scene -- all randomness flows through this. */
  private readonly rng: Phaser.Math.RandomDataGenerator;

  /** Typed config accessor for map generation parameters. */
  private readonly configManager: ConfigManager;

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Per-run game state.
   * @param rng - Seeded RNG instance from Gameplay.
   * @param configManager - Config accessor for map-config.json values.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    rng: Phaser.Math.RandomDataGenerator,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.rng = rng;
    this.configManager = configManager;
  }

  /**
   * Runs the map generation algorithm, stores the result on the registry,
   * and emits MAP_READY. Called once during Gameplay.create().
   */
  init(): void {
    const config = this.configManager.getMapConfig();
    const complexity = 1; // Phase 1: default complexity; future bolts pass run number
    const mapData = this.generate(config, complexity);

    /* Store on registry for downstream systems (same pattern as 'poolManager'). */
    this.scene.registry.set('mapData', mapData);

    const payload: MapReadyPayload = {
      cols: config.cols,
      rows: config.rows,
      pathLength: mapData.getPathLength(),
      seed: this.gameState.gameSeed,
    };
    this.emit(GAME_EVENTS.MAP_READY, payload);

    /* Debug logging when VITE_DEBUG is enabled. */
    if (import.meta.env.VITE_DEBUG === 'true') {
      const spawn = mapData.getSpawnPoint();
      const obj = mapData.getObjectivePoint();
      console.log(
        `[MapGenerator] seed=${this.gameState.gameSeed} complexity=${complexity} ` +
        `path=${mapData.getPathLength()} spawn=(${spawn.col},${spawn.row}) ` +
        `objective=(${obj.col},${obj.row})`,
      );
    }
  }

  /** No per-frame work -- map is static after generation. */
  update(_time: number, _delta: number): void {
    /* No-op: map does not change after generation. */
  }

  /**
   * Cleans up registry entry on scene shutdown to prevent stale data.
   */
  destroy(): void {
    this.scene.registry.remove('mapData');
    super.destroy();
  }

  /**
   * Generates a complete MapData object with a valid path.
   * Retries up to maxRetries times if the algorithm cannot find a valid path.
   *
   * @param config - Map generation parameters.
   * @param complexity - Difficulty parameter (1-10) affecting path length and turns.
   * @returns A valid MapData instance.
   */
  private generate(config: MapConfigDefinition, complexity: number): MapData {
    /* Scale min path length and max straight tiles based on complexity.
     * complexity=1: minLength=20, maxStraight=3
     * complexity=10: minLength=~40, maxStraight=2 */
    const clampedComplexity = Math.max(
      config.complexityRange[0],
      Math.min(config.complexityRange[1], complexity),
    );
    const minPathLength = Math.floor(
      config.minPathLength + (clampedComplexity - 1) * 2.2,
    );
    /* Use config value directly. Higher complexity reduces max straight.
     * complexity=1: maxStraight = config value (3).
     * complexity=4+: maxStraight decreases by 1 per 4 complexity levels, min 2. */
    const maxStraight = Math.max(
      2,
      config.maxStraightTiles - Math.floor((clampedComplexity - 1) / 4),
    );

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      const result = this.attemptGeneration(
        config.cols,
        config.rows,
        minPathLength,
        maxStraight,
      );
      if (result) {
        return this.buildMapData(result, config.cols, config.rows, clampedComplexity);
      }
    }

    /* Generation failed after all retries -- this should not happen in practice. */
    console.error(
      `[MapGenerator] FAILED after ${config.maxRetries} retries. ` +
      `seed=${this.gameState.gameSeed} complexity=${complexity}`,
    );
    throw new Error(
      `Map generation failed after ${config.maxRetries} retries. ` +
      `seed=${this.gameState.gameSeed}`,
    );
  }

  /**
   * Single generation attempt using constrained random walk with backtracking.
   *
   * @param cols - Grid columns.
   * @param rows - Grid rows.
   * @param minPathLength - Minimum waypoints required.
   * @param maxStraight - Maximum consecutive tiles in one direction.
   * @returns Array of grid coordinates forming the path, or null on failure.
   */
  private attemptGeneration(
    cols: number,
    rows: number,
    minPathLength: number,
    maxStraight: number,
  ): Array<{ col: number; row: number }> | null {
    /* Pick spawn on left edge, avoiding corners for path flexibility. */
    const spawnRow = this.rng.between(1, rows - 2);
    /* Pick objective on right edge, avoiding corners. */
    const objectiveRow = this.rng.between(1, rows - 2);

    /* Track visited tiles to prevent path crossing itself. */
    const visited: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      visited.push(new Array<boolean>(cols).fill(false));
    }

    const path: Array<{ col: number; row: number }> = [];
    let currentCol = 0;
    let currentRow = spawnRow;

    /* Mark spawn and add to path. */
    visited[currentRow]![currentCol] = true;
    path.push({ col: currentCol, row: currentRow });

    let lastDirection: Direction | null = null;
    let straightCount = 0;

    /* Maximum steps to prevent infinite loops -- generous upper bound. */
    const maxSteps = cols * rows * 4;

    for (let step = 0; step < maxSteps; step++) {
      /* Check if we can reach the objective. */
      if (this.canReachObjective(
        currentCol, currentRow, cols - 1, objectiveRow,
        path.length, minPathLength, maxStraight, path,
      )) {
        /* Step onto objective. */
        visited[objectiveRow]![cols - 1] = true;
        path.push({ col: cols - 1, row: objectiveRow });
        return path;
      }

      /* Build list of valid moves. */
      const validMoves = this.getValidMoves(
        currentCol, currentRow, cols, rows,
        visited, maxStraight, lastDirection, straightCount, path,
      );

      if (validMoves.length === 0) {
        /* Dead end -- backtrack. */
        if (path.length <= 1) {
          /* Cannot backtrack past spawn -- this attempt failed. */
          return null;
        }
        const removed = path.pop()!;
        visited[removed.row]![removed.col] = false;

        const prev = path[path.length - 1]!;
        currentCol = prev.col;
        currentRow = prev.row;

        /* Recalculate direction and straight count by scanning backward
         * through the path to count consecutive same-direction steps. */
        if (path.length >= 2) {
          const prevPrev = path[path.length - 2]!;
          lastDirection = this.getDirection(prevPrev, prev);
          straightCount = this.countTrailingStraight(path);
        } else {
          lastDirection = null;
          straightCount = 0;
        }
        continue;
      }

      /* Rank moves: prefer directions that make progress toward the objective.
       * Bias RIGHT to make horizontal progress; bias toward objective row. */
      const ranked = this.rankMoves(
        validMoves, currentCol, currentRow,
        cols - 1, objectiveRow, path.length, minPathLength,
      );

      /* Pick from ranked moves using weighted random selection. */
      const chosen = this.weightedPick(ranked);
      const dir = DIRECTIONS[chosen];
      const nextCol = currentCol + dir.dc;
      const nextRow = currentRow + dir.dr;

      /* Update straight count. */
      if (chosen === lastDirection) {
        straightCount++;
      } else {
        straightCount = 1;
      }
      lastDirection = chosen;

      visited[nextRow]![nextCol] = true;
      path.push({ col: nextCol, row: nextRow });
      currentCol = nextCol;
      currentRow = nextRow;
    }

    /* Exceeded max steps -- this attempt failed. */
    return null;
  }

  /**
   * Checks if the path can step directly to the objective.
   * Allows reaching the objective only if the path is long enough,
   * the current position is adjacent to the objective tile, and
   * the step would not violate the max straight constraint.
   */
  private canReachObjective(
    col: number, row: number,
    objCol: number, objRow: number,
    pathLength: number, minPathLength: number,
    maxStraight: number,
    path: Array<{ col: number; row: number }>,
  ): boolean {
    /* Must have enough waypoints (not counting the objective itself). */
    if (pathLength < minPathLength - 1) return false;

    /* Must be adjacent to the objective tile (cardinal only). */
    const dc = objCol - col;
    const dr = objRow - row;
    if (Math.abs(dc) + Math.abs(dr) !== 1) return false;

    /* Determine the direction of this final step. */
    let stepDir: Direction | null = null;
    if (dc === 1 && dr === 0) stepDir = 'RIGHT';
    else if (dc === -1 && dr === 0) stepDir = 'LEFT';
    else if (dc === 0 && dr === 1) stepDir = 'DOWN';
    else if (dc === 0 && dr === -1) stepDir = 'UP';

    /* Check max straight constraint using the actual path history. */
    if (stepDir && this.wouldExceedStraight(path, stepDir, maxStraight)) return false;

    return true;
  }

  /**
   * Returns valid move directions from the current position.
   * Filters out: out-of-bounds, visited, exceeds max straight, creates 2x2 block.
   * Uses path history (not just the tracked counts) for robust straight enforcement.
   */
  private getValidMoves(
    col: number, row: number,
    cols: number, rows: number,
    visited: boolean[][],
    maxStraight: number,
    _lastDirection: Direction | null,
    _straightCount: number,
    path: Array<{ col: number; row: number }>,
  ): Direction[] {
    const valid: Direction[] = [];

    for (const dir of ALL_DIRECTIONS) {
      const d = DIRECTIONS[dir];
      const nc = col + d.dc;
      const nr = row + d.dr;

      /* Bounds check. */
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

      /* Already visited. */
      if (visited[nr]![nc]) continue;

      /* Max straight constraint: check the last maxStraight tiles in the path
       * to see if they all go in the same direction as this candidate move.
       * This is more robust than tracking counts, which can drift after backtrack. */
      if (this.wouldExceedStraight(path, dir, maxStraight)) continue;

      /* 2x2 block constraint -- reject if this tile would create a 2x2 path block. */
      if (this.wouldCreate2x2(nc, nr, visited, cols, rows)) continue;

      valid.push(dir);
    }

    return valid;
  }

  /**
   * Checks if adding a move in the given direction would exceed the max straight
   * constraint by examining the actual path history.
   */
  private wouldExceedStraight(
    path: Array<{ col: number; row: number }>,
    candidateDir: Direction,
    maxStraight: number,
  ): boolean {
    /* Count how many of the last tiles form a consecutive run in candidateDir. */
    const d = DIRECTIONS[candidateDir];
    let count = 0;

    for (let i = path.length - 1; i >= 1; i--) {
      const dc = path[i]!.col - path[i - 1]!.col;
      const dr = path[i]!.row - path[i - 1]!.row;
      if (dc === d.dc && dr === d.dr) {
        count++;
      } else {
        break;
      }
    }

    /* The candidate move would add one more to this run. */
    return count >= maxStraight;
  }

  /**
   * Checks if placing a path tile at (col, row) would create a 2x2 block
   * of path tiles. This prevents wide blobs that look unnatural.
   */
  private wouldCreate2x2(
    col: number, row: number,
    visited: boolean[][],
    cols: number, rows: number,
  ): boolean {
    /* Check all four possible 2x2 blocks that include (col, row). */
    const offsets = [
      [0, 0, 1, 0, 0, 1, 1, 1],   // (col,row), (col+1,row), (col,row+1), (col+1,row+1)
      [-1, 0, 0, 0, -1, 1, 0, 1],  // (col-1,row), (col,row), (col-1,row+1), (col,row+1)
      [0, -1, 1, -1, 0, 0, 1, 0],  // (col,row-1), (col+1,row-1), (col,row), (col+1,row)
      [-1, -1, 0, -1, -1, 0, 0, 0], // (col-1,row-1), (col,row-1), (col-1,row), (col,row)
    ];

    for (const o of offsets) {
      const c1 = col + o[0]!, r1 = row + o[1]!;
      const c2 = col + o[2]!, r2 = row + o[3]!;
      const c3 = col + o[4]!, r3 = row + o[5]!;
      const c4 = col + o[6]!, r4 = row + o[7]!;

      /* All four cells must be in bounds. */
      if (c1 < 0 || c1 >= cols || r1 < 0 || r1 >= rows) continue;
      if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) continue;
      if (c3 < 0 || c3 >= cols || r3 < 0 || r3 >= rows) continue;
      if (c4 < 0 || c4 >= cols || r4 < 0 || r4 >= rows) continue;

      /* The candidate tile (col, row) is one of these four.
       * Check if the OTHER three are all already visited (path). */
      let pathCount = 0;
      if (visited[r1]![c1]) pathCount++;
      if (visited[r2]![c2]) pathCount++;
      if (visited[r3]![c3]) pathCount++;
      if (visited[r4]![c4]) pathCount++;

      /* pathCount includes the candidate tile if it's in the block --
       * but it's not visited yet. So if the other 3 are all path = 3 visited. */
      if (pathCount >= 3) return true;
    }

    return false;
  }

  /**
   * Ranks move directions by desirability. Prefers directions that make
   * progress toward the objective, with some randomness for variety.
   * When far from the minimum path length, prefer vertical moves to
   * extend the path.
   */
  private rankMoves(
    moves: Direction[],
    col: number, row: number,
    objCol: number, objRow: number,
    pathLength: number, minPathLength: number,
  ): Array<{ dir: Direction; weight: number }> {
    const needsLength = pathLength < minPathLength - 5;
    const ranked: Array<{ dir: Direction; weight: number }> = [];

    for (const dir of moves) {
      let weight = 1;
      const d = DIRECTIONS[dir];
      const nc = col + d.dc;
      const nr = row + d.dr;

      /* Horizontal progress toward objective. */
      const horizProgress = nc > col && nc <= objCol;
      /* Vertical progress toward objective row. */
      const vertProgress = Math.abs(nr - objRow) < Math.abs(row - objRow);

      if (needsLength) {
        /* Need more path length -- prefer vertical moves to create detours. */
        if (dir === 'UP' || dir === 'DOWN') {
          weight += 3;
        }
        /* Avoid moving directly toward objective too fast. */
        if (dir === 'RIGHT') {
          weight = 1;
        }
        if (dir === 'LEFT') {
          weight += 2;
        }
      } else {
        /* Have enough length -- prefer progress toward objective. */
        if (horizProgress) weight += 4;
        if (vertProgress) weight += 2;
        /* Small penalty for going backward. */
        if (dir === 'LEFT') weight = Math.max(1, weight - 2);
      }

      ranked.push({ dir, weight });
    }

    return ranked;
  }

  /**
   * Picks a direction from weighted options using the seeded RNG.
   */
  private weightedPick(options: Array<{ dir: Direction; weight: number }>): Direction {
    const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
    let roll = this.rng.between(0, totalWeight - 1);

    for (const option of options) {
      roll -= option.weight;
      if (roll < 0) return option.dir;
    }

    /* Fallback -- should not be reached. */
    return options[options.length - 1]!.dir;
  }

  /**
   * Counts how many consecutive tiles at the end of the path go in the
   * same direction. Used after backtracking to restore accurate straight count.
   */
  private countTrailingStraight(path: Array<{ col: number; row: number }>): number {
    if (path.length < 2) return 0;

    let count = 1;
    const lastDir = this.getDirection(
      path[path.length - 2]!,
      path[path.length - 1]!,
    );

    for (let i = path.length - 2; i >= 1; i--) {
      const dir = this.getDirection(path[i - 1]!, path[i]!);
      if (dir === lastDir) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  /**
   * Determines the direction between two adjacent path tiles.
   */
  private getDirection(
    from: { col: number; row: number },
    to: { col: number; row: number },
  ): Direction | null {
    const dc = to.col - from.col;
    const dr = to.row - from.row;
    if (dc === 1 && dr === 0) return 'RIGHT';
    if (dc === -1 && dr === 0) return 'LEFT';
    if (dc === 0 && dr === 1) return 'DOWN';
    if (dc === 0 && dr === -1) return 'UP';
    return null;
  }

  /**
   * Builds the complete MapData from a successful path generation.
   * Creates the 2D tile grid and converts path coordinates to GridPoints
   * with both grid and world coordinates.
   */
  private buildMapData(
    path: Array<{ col: number; row: number }>,
    cols: number,
    rows: number,
    complexity: number,
  ): MapData {
    /* Create a set of path coordinates for O(1) lookup. */
    const pathSet = new Set<string>();
    for (const p of path) {
      pathSet.add(`${p.col},${p.row}`);
    }

    /* Build the 2D grid. */
    const grid: MapCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: MapCell[] = [];
      for (let c = 0; c < cols; c++) {
        const key = `${c},${r}`;
        let tileType: MapCell['tileType'] = 'buildable';

        if (pathSet.has(key)) {
          /* Determine if this is spawn, objective, or regular path. */
          if (c === path[0]!.col && r === path[0]!.row) {
            tileType = 'spawn';
          } else if (
            c === path[path.length - 1]!.col &&
            r === path[path.length - 1]!.row
          ) {
            tileType = 'objective';
          } else {
            tileType = 'path';
          }
        }

        row.push({ col: c, row: r, tileType, occupied: false });
      }
      grid.push(row);
    }

    /* Convert path to GridPoints with world coordinates. */
    const waypoints: GridPoint[] = path.map((p) => ({
      col: p.col,
      row: p.row,
      worldX: p.col * TILE_SIZE + TILE_SIZE / 2,
      worldY: p.row * TILE_SIZE + TILE_SIZE / 2 + MAP_OFFSET_Y,
    }));

    return new MapData(grid, waypoints, cols, rows, complexity, this.gameState.gameSeed);
  }
}
