/**
 * Auto-tile bitmask engine and variant assignment system.
 *
 * Runs after MapGeneratorSystem (on MAP_READY) and before MapRendererSystem.
 * Iterates every cell in the grid and assigns a sprite variant key:
 * - Path tiles: 4-bit cardinal bitmask selects one of 11 directional sprites.
 * - Buildable/blocked tiles: seeded deterministic RNG picks a variant.
 * - Spawn/objective tiles: skipped (BOLT-012 handles those).
 *
 * The result is a TileVariantMap stored on the Phaser registry under
 * REGISTRY_KEYS.TILE_VARIANT_MAP. Downstream systems (BOLT-012, BOLT-013)
 * consume it after the AUTO_TILE_READY event fires.
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
   * - path tiles: bitmask -> sprite key
   * - buildable tiles: seeded RNG -> one of 5 grass variants
   * - blocked tiles: seeded RNG -> one of 3 rock variants
   * - spawn/objective: skipped (no entry -- BOLT-012 handles those)
   *
   * Stores the completed map on the registry and emits AUTO_TILE_READY.
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
        // spawn and objective: intentionally skipped (BOLT-012)
      }
    }

    // Store on registry FIRST, then emit event -- guarantees listeners
    // that read the registry in response always find the data.
    this.scene.registry.set(REGISTRY_KEYS.TILE_VARIANT_MAP, variantMap);

    const payload: AutoTileReadyPayload = {
      tileCount: variantMap.size,
      seed: mapData.seed,
    };
    this.emit(GAME_EVENTS.AUTO_TILE_READY, payload);
  }
}
