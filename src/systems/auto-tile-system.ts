/**
 * Auto-tile bitmask engine and variant assignment system.
 *
 * Runs after MapGeneratorSystem (on MAP_READY) and before MapRendererSystem.
 * Iterates every cell in the grid and assigns a sprite variant key:
 * - Path tiles: 4-bit cardinal bitmask selects one of 11 directional sprites.
 * - Buildable/blocked tiles: seeded deterministic RNG picks a variant.
 * - Spawn tiles: directional portal facing the first path waypoint (BOLT-012).
 * - Objective tiles: directional gate facing the last path waypoint (BOLT-012).
 *
 * The result is a TileVariantMap stored on the Phaser registry under
 * REGISTRY_KEYS.TILE_VARIANT_MAP. Downstream systems (BOLT-013) consume it
 * after the AUTO_TILE_READY event fires.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { MapData } from '../data/map-data';
import {
  GAME_EVENTS,
  REGISTRY_KEYS,
  type GameState,
  type TileType,
  type TileVariantMap,
} from '../types/game-types';
import type { AutoTileReadyPayload } from '../types/events';

// ---------------------------------------------------------------------------
// Pure Functions (exported for unit testing and reuse by BOLT-012)
// ---------------------------------------------------------------------------

/**
 * Determines whether a tile type should be treated as "path-like" for
 * bitmask connectivity. Spawn and objective tiles connect seamlessly
 * with path tiles so the visual join is unbroken.
 *
 * @param tileType - The tile type to check, or null for out-of-bounds.
 * @returns True if the tile is path, spawn, or objective.
 */
export function isPathLike(tileType: TileType | null): boolean {
  return tileType === 'path' || tileType === 'spawn' || tileType === 'objective';
}

/**
 * Computes a 4-bit cardinal bitmask for a path tile based on its neighbors.
 *
 * Bit layout: N=1, E=2, S=4, W=8. Each bit is set if the corresponding
 * cardinal neighbor is path-like. Out-of-bounds neighbors (null from
 * getTileType) produce a 0 bit via isPathLike(null) returning false.
 *
 * Only 11 of the 16 possible masks can occur with the single-path generator:
 * 0-6, 8-10, 12. Masks 7, 11, 13, 14, 15 (T-junctions/crossroads) are
 * unreachable but not explicitly blocked -- the function returns the
 * mathematically correct mask for any neighbor configuration.
 *
 * @param col - Column of the tile to compute the mask for.
 * @param row - Row of the tile to compute the mask for.
 * @param getTileType - Accessor that returns TileType or null for out-of-bounds.
 * @returns Integer bitmask 0-15.
 */
export function computeBitmask(
  col: number,
  row: number,
  getTileType: (c: number, r: number) => TileType | null,
): number {
  let mask = 0;

  // North neighbor (bit 0, value 1)
  if (isPathLike(getTileType(col, row - 1))) mask |= 1;
  // East neighbor (bit 1, value 2)
  if (isPathLike(getTileType(col + 1, row))) mask |= 2;
  // South neighbor (bit 2, value 4)
  if (isPathLike(getTileType(col, row + 1))) mask |= 4;
  // West neighbor (bit 3, value 8)
  if (isPathLike(getTileType(col - 1, row))) mask |= 8;

  return mask;
}

// ---------------------------------------------------------------------------
// Simple deterministic hash (djb2) for per-cell seeded variant selection.
// Avoids constructing a full Phaser.Math.RandomDataGenerator per cell.
// ---------------------------------------------------------------------------

/**
 * djb2 string hash producing a positive 32-bit integer.
 * Used to derive a deterministic variant index from seed + cell coordinates.
 *
 * @param str - Input string to hash.
 * @returns Positive integer hash.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Ensure positive by unsigned right shift
  return hash >>> 0;
}

/**
 * Returns a deterministic variant number for a cell given the map seed.
 * Combines seed with cell coordinates to ensure per-cell uniqueness
 * while remaining fully reproducible from the same seed.
 *
 * @param seed - The map seed string.
 * @param col - Cell column.
 * @param row - Cell row.
 * @param variantCount - Number of variants available (e.g. 5 for buildable).
 * @returns Integer in range [1, variantCount].
 */
export function seededVariant(
  seed: string,
  col: number,
  row: number,
  variantCount: number,
): number {
  const cellSeed = `${seed}:${col},${row}`;
  return (djb2Hash(cellSeed) % variantCount) + 1;
}

// ---------------------------------------------------------------------------
// BOLT-012: Cardinal direction detection for spawn/objective tiles.
// Given a tile's position, finds which cardinal neighbor is a path tile
// and returns the direction letter (n/e/s/w) that faces toward it.
// ---------------------------------------------------------------------------

/** Cardinal direction letter used in sprite key suffixes (tile-spawn-n, etc.). */
export type CardinalDirection = 'n' | 'e' | 's' | 'w';

/**
 * Cardinal neighbor offsets ordered N, E, S, W.
 * Each entry maps a direction letter to its column/row delta.
 */
const CARDINAL_OFFSETS: ReadonlyArray<{
  dir: CardinalDirection;
  dc: number;
  dr: number;
}> = [
  { dir: 'n', dc: 0, dr: -1 },
  { dir: 'e', dc: 1, dr: 0 },
  { dir: 's', dc: 0, dr: 1 },
  { dir: 'w', dc: -1, dr: 0 },
];

/**
 * Determines the cardinal direction from a tile toward a specific neighbor.
 *
 * Checks each cardinal neighbor of (col, row) and returns the direction
 * whose neighbor matches the target (targetCol, targetRow). If no cardinal
 * neighbor matches the target, falls back to scanning for any adjacent
 * path tile. If still no match, returns the provided fallback direction.
 *
 * Two-phase lookup rationale: the waypoint list gives us the exact neighbor
 * we want (e.g. waypoints[1] for spawn), but defensive fallback handles
 * edge cases where the waypoint is not cardinally adjacent.
 *
 * @param col - Column of the tile to compute direction for.
 * @param row - Row of the tile to compute direction for.
 * @param targetCol - Column of the preferred neighbor (from waypoint list).
 * @param targetRow - Row of the preferred neighbor (from waypoint list).
 * @param getTileType - Accessor returning TileType or null for OOB.
 * @param fallback - Direction to return if no adjacent path is found.
 * @returns Cardinal direction letter facing the path neighbor.
 */
export function computeDirectionToNeighbor(
  col: number,
  row: number,
  targetCol: number,
  targetRow: number,
  getTileType: (c: number, r: number) => TileType | null,
  fallback: CardinalDirection,
): CardinalDirection {
  // Phase 1: exact waypoint match -- check if the target is a cardinal neighbor
  for (const { dir, dc, dr } of CARDINAL_OFFSETS) {
    if (col + dc === targetCol && row + dr === targetRow) {
      return dir;
    }
  }

  // Phase 2: fallback scan -- find any adjacent path tile
  // This handles edge cases where the waypoint is not cardinally adjacent
  // (should not occur with the current generator, but defensive).
  for (const { dir, dc, dr } of CARDINAL_OFFSETS) {
    const neighborType = getTileType(col + dc, row + dr);
    if (neighborType === 'path') {
      return dir;
    }
  }

  // Phase 3: no adjacent path found -- use the provided default direction
  // and log a warning so developers notice the anomaly.
  console.warn(
    `AutoTileSystem: no adjacent path tile found for special tile at (${col},${row}). ` +
      `Falling back to '${fallback}'.`,
  );
  return fallback;
}

// ---------------------------------------------------------------------------
// AutoTileSystem Class
// ---------------------------------------------------------------------------

export class AutoTileSystem extends BaseSystem {
  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Per-run game state.
   */
  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers the MAP_READY listener and checks for mapData already on the
   * registry (fallback for synchronous init order). Follows the same
   * defensive pattern used by MapRendererSystem.
   */
  init(): void {
    this.listen(
      GAME_EVENTS.MAP_READY,
      this.handleMapReady as (...args: never[]) => void,
    );

    // Fallback: if MapGeneratorSystem.init() already ran and emitted
    // MAP_READY before our listener was registered, process now.
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (mapData) {
      this.resolveAutoTiles(mapData);
    }
  }

  /** No per-frame work -- auto-tiling is a run-once computation. */
  update(_time: number, _delta: number): void {
    /* No-op: TileVariantMap is static after initial computation. */
  }

  /**
   * Removes the TileVariantMap from the registry to prevent stale data
   * leaking across scene restarts. Calls super.destroy() to clean up
   * tracked event listeners.
   */
  destroy(): void {
    this.scene.registry.remove(REGISTRY_KEYS.TILE_VARIANT_MAP);
    super.destroy();
  }

  /**
   * MAP_READY event handler. Reads MapData from the registry and resolves
   * all tile variants.
   */
  private handleMapReady(): void {
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (mapData) {
      this.resolveAutoTiles(mapData);
    }
  }

  /**
   * Iterates every cell in the grid and populates the TileVariantMap.
   * - Path tiles: bitmask -> sprite key (BOLT-011).
   * - Buildable tiles: seeded RNG -> one of 5 grass variants (BOLT-011).
   * - Blocked tiles: seeded RNG -> one of 3 rock variants (BOLT-011).
   * - Spawn tile: directional portal facing first path waypoint (BOLT-012).
   * - Objective tile: directional gate facing last path waypoint (BOLT-012).
   *
   * Stores the completed map on the registry and emits AUTO_TILE_READY.
   * The TileVariantMap is complete (all tile types covered) before the
   * event fires, so downstream listeners always receive a full map.
   *
   * @param mapData - The generated map data from BOLT-002.
   */
  private resolveAutoTiles(mapData: MapData): void {
    const { cols, rows } = mapData.getGridDimensions();
    const variantMap: TileVariantMap = new Map();

    // Bind getTileType for bitmask lookups
    const getTileType = (c: number, r: number) => mapData.getTileType(c, r);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileType = mapData.getTileType(col, row);

        if (tileType === 'path') {
          const mask = computeBitmask(col, row, getTileType);
          variantMap.set(`${col},${row}`, `tile-path-${mask}`);
        } else if (tileType === 'buildable') {
          const variant = seededVariant(mapData.seed, col, row, 5);
          variantMap.set(`${col},${row}`, `tile-buildable-${variant}`);
        } else if (tileType === 'blocked') {
          const variant = seededVariant(mapData.seed, col, row, 3);
          variantMap.set(`${col},${row}`, `tile-blocked-${variant}`);
        }
        // spawn and objective handled below via waypoint-based direction detection
      }
    }

    // BOLT-012: resolve spawn and objective directional variants.
    // Must run after the main loop so the TileVariantMap is complete
    // for all path/buildable/blocked tiles before adding special tiles.
    this.resolveSpawnAndObjective(mapData, variantMap, getTileType);

    // Store on registry FIRST, then emit event -- guarantees listeners
    // that read the registry in response always find the data.
    this.scene.registry.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);

    const payload: AutoTileReadyPayload = {
      tileCount: variantMap.size,
      seed: mapData.seed,
    };
    this.emit(GAME_EVENTS.AUTO_TILE_READY, payload);
  }

  /**
   * Resolves directional sprite keys for spawn and objective tiles (BOLT-012).
   *
   * Spawn portal faces TOWARD the first path waypoint (enemies emerge through
   * the opening into the path). Objective gate faces TOWARD the last path
   * waypoint (enemies approach from that direction).
   *
   * Waypoint list structure: waypoints[0] = spawn tile, waypoints[1] = first
   * path tile adjacent to spawn, waypoints[n-2] = last path tile adjacent to
   * objective, waypoints[n-1] = objective tile.
   *
   * Fallbacks (per brief.md):
   * - Spawn with no adjacent path: defaults to east ('e').
   * - Objective with no adjacent path: defaults to west ('w').
   *
   * @param mapData - Map data with waypoints and tile type accessor.
   * @param variantMap - The variant map to write entries into.
   * @param getTileType - Tile type accessor for fallback neighbor scanning.
   */
  private resolveSpawnAndObjective(
    mapData: MapData,
    variantMap: TileVariantMap,
    getTileType: (c: number, r: number) => TileType | null,
  ): void {
    const waypoints = mapData.getWaypoints();

    // --- Spawn tile direction ---
    // waypoints[0] is the spawn tile; waypoints[1] is the first path tile.
    const spawn = mapData.getSpawnPoint();
    // Guard: only assign if the tile is actually a spawn tile in the grid.
    // The map generator guarantees spawn exists, but test grids may omit it.
    if (getTileType(spawn.col, spawn.row) === 'spawn') {
      // The target is the first path waypoint (index 1), or the spawn itself
      // if the waypoint list has fewer than 2 entries (degenerate edge case).
      const firstPathWp = waypoints.length >= 2 ? waypoints[1]! : spawn;
      const spawnDir = computeDirectionToNeighbor(
        spawn.col,
        spawn.row,
        firstPathWp.col,
        firstPathWp.row,
        getTileType,
        'e', // Fallback: east-facing per brief.md
      );
      variantMap.set(`${spawn.col},${spawn.row}`, `tile-spawn-${spawnDir}`);
    }

    // --- Objective tile direction ---
    // waypoints[n-1] is the objective tile; waypoints[n-2] is the last path tile.
    const objective = mapData.getObjectivePoint();
    // Guard: only assign if the tile is actually an objective tile in the grid.
    if (getTileType(objective.col, objective.row) === 'objective') {
      // The target is the last path waypoint (index n-2), or the objective itself
      // if the waypoint list has fewer than 2 entries (degenerate edge case).
      const lastPathWp =
        waypoints.length >= 2 ? waypoints[waypoints.length - 2]! : objective;
      const objectiveDir = computeDirectionToNeighbor(
        objective.col,
        objective.row,
        lastPathWp.col,
        lastPathWp.row,
        getTileType,
        'w', // Fallback: west-facing per brief.md
      );
      variantMap.set(
        `${objective.col},${objective.row}`,
        `tile-objective-${objectiveDir}`,
      );
    }
  }
}
