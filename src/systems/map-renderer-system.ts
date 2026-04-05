/**
 * Map tile renderer system.
 *
 * Listens for the AUTO_TILE_READY event (BOLT-013), then creates a
 * Phaser.GameObjects.Image sprite for each tile in the grid. Each tile is
 * positioned at its cell center and assigned the appropriate sprite key.
 *
 * Sprite key resolution (BOLT-013 two-tier lookup):
 * 1. Check the TileVariantMap on the registry for a per-cell variant key
 *    (produced by AutoTileSystem in BOLT-011/012). This gives contextual
 *    sprites: bitmask-selected path corners/straights, seeded grass variants,
 *    directional spawn/objective portals.
 * 2. Fall back to the legacy TILE_SPRITE_KEYS[tileType] flat lookup when
 *    no variant entry exists. This preserves backward compatibility if
 *    AutoTileSystem is not initialized (e.g., tests, future scenes).
 *
 * This system is display-only -- no logic. It reads MapData from the registry
 * and renders the visual representation. All tile sprites are tracked for
 * cleanup in destroy() to prevent visual artifacts on scene restart.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { MapData } from '../data/map-data';
import { TILE_SIZE, MAP_OFFSET_Y } from '../config/performance-budget';
import {
  GAME_EVENTS,
  REGISTRY_KEYS,
  type GameState,
  type TileType,
  type TileVariantMap,
} from '../types/game-types';

/** Maps tile types to their corresponding legacy sprite texture keys. */
const TILE_SPRITE_KEYS: Record<TileType, string> = {
  buildable: 'tile-buildable',
  path: 'tile-path',
  blocked: 'tile-blocked',
  spawn: 'tile-spawn',
  objective: 'tile-objective',
};

export class MapRendererSystem extends BaseSystem {
  /** All created tile sprites, stored for cleanup in destroy(). */
  private tileSprites: Phaser.GameObjects.Image[] = [];

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Per-run game state.
   */
  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers the AUTO_TILE_READY listener. When AutoTileSystem fires after
   * computing the TileVariantMap, this system reads MapData and the variant
   * map from the registry, then renders all tiles with contextual sprites.
   *
   * Also registers a MAP_READY fallback listener: if AutoTileSystem is not
   * present (TileVariantMap never stored), the renderer still renders using
   * legacy flat sprite keys when MAP_READY fires.
   */
  init(): void {
    /* Primary listener: AUTO_TILE_READY fires after AutoTileSystem has
     * stored the TileVariantMap on the registry. This is the normal
     * code path when the full auto-tile pipeline is active. */
    this.listen(
      GAME_EVENTS.AUTO_TILE_READY,
      this.handleAutoTileReady as (...args: never[]) => void,
    );

    /* Fallback listener: MAP_READY fires before AUTO_TILE_READY. If
     * AutoTileSystem is NOT initialized (no BOLT-011), AUTO_TILE_READY
     * never fires, so MAP_READY is the only trigger. The render pass
     * checks for the TileVariantMap and falls back to flat keys when
     * absent -- backward compatibility preserved per brief.md. */
    this.listen(
      GAME_EVENTS.MAP_READY,
      this.handleMapReady as (...args: never[]) => void,
    );

    /* If map data is already on the registry (synchronous init order),
     * render immediately. Checks for the TileVariantMap too in case
     * AutoTileSystem already ran. */
    const tileVariantMap = this.scene.registry.get(
      REGISTRY_KEYS.TILE_VARIANT_MAP,
    ) as TileVariantMap | undefined;
    if (tileVariantMap) {
      /* AutoTileSystem already ran -- render with variant sprites. */
      const mapData = this.scene.registry.get('mapData') as MapData | undefined;
      if (mapData) {
        this.renderMap(mapData, tileVariantMap);
      }
    }
  }

  /** No per-frame work -- tiles are static after rendering. */
  update(_time: number, _delta: number): void {
    /* No-op: tile sprites do not change after initial render. */
  }

  /**
   * Destroys all tile sprites to free memory and prevent visual artifacts
   * if the Gameplay scene restarts.
   */
  destroy(): void {
    for (const sprite of this.tileSprites) {
      sprite.destroy();
    }
    this.tileSprites = [];
    super.destroy();
  }

  /**
   * Handles the AUTO_TILE_READY event. This is the primary render trigger
   * when the full auto-tile pipeline is active. Reads MapData and the
   * TileVariantMap from the registry, then renders tiles with variant sprites.
   */
  private handleAutoTileReady(): void {
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (!mapData) {
      console.error(
        '[MapRenderer] AUTO_TILE_READY fired but no mapData on registry.',
      );
      return;
    }

    const tileVariantMap = this.scene.registry.get(
      REGISTRY_KEYS.TILE_VARIANT_MAP,
    ) as TileVariantMap | undefined;

    this.renderMap(mapData, tileVariantMap);
  }

  /**
   * Handles the MAP_READY event as a fallback render trigger.
   *
   * Only renders if tiles have not already been rendered (by AUTO_TILE_READY
   * or the synchronous init fallback). This prevents double-rendering: when
   * AutoTileSystem is active, AUTO_TILE_READY fires after MAP_READY and
   * is the primary trigger. MAP_READY only renders if the auto-tile pipeline
   * is absent.
   */
  private handleMapReady(): void {
    /* Guard: skip if tiles are already rendered (AUTO_TILE_READY path
     * or synchronous init fallback already ran). */
    if (this.tileSprites.length > 0) return;

    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (!mapData) {
      console.error(
        '[MapRenderer] MAP_READY fired but no mapData on registry.',
      );
      return;
    }

    /* No TileVariantMap yet -- AutoTileSystem may fire later, or may not
     * exist at all. Render with flat legacy keys for now. If AUTO_TILE_READY
     * fires later, it will re-render with variant sprites (after clearing
     * the existing sprites). */
    this.renderMap(mapData);
  }

  /**
   * Creates a Phaser Image sprite for every tile in the grid.
   * Each sprite is positioned at the center of its grid cell.
   *
   * Sprite key resolution follows a two-tier lookup (BOLT-013):
   * 1. If a TileVariantMap is provided, look up the key for "col,row".
   * 2. If no variant entry exists (or no map provided), fall back to
   *    the legacy TILE_SPRITE_KEYS[tileType] flat lookup.
   *
   * Clears any previously rendered sprites before re-rendering,
   * so this method is safe to call multiple times (e.g., MAP_READY
   * followed by AUTO_TILE_READY).
   *
   * @param mapData - The generated map data to render.
   * @param tileVariantMap - Optional variant map from AutoTileSystem.
   */
  private renderMap(mapData: MapData, tileVariantMap?: TileVariantMap): void {
    /* Clear any previously rendered sprites to allow re-rendering.
     * This handles the case where MAP_READY rendered with flat keys
     * and AUTO_TILE_READY fires later with the variant map. */
    if (this.tileSprites.length > 0) {
      for (const sprite of this.tileSprites) {
        sprite.destroy();
      }
      this.tileSprites = [];
    }

    const { cols, rows } = mapData.getGridDimensions();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileType = mapData.getTileType(col, row);
        if (!tileType) continue;

        /* Two-tier sprite key lookup (BOLT-013):
         * 1. Check TileVariantMap for a contextual variant key.
         * 2. Fall back to the legacy flat sprite key by tile type. */
        const variantKey = tileVariantMap?.get(`${col},${row}`);
        const spriteKey = variantKey ?? TILE_SPRITE_KEYS[tileType];

        /* Position at tile center: col * 64 + 32, row * 64 + 32.
         * Phaser Images default to origin(0.5, 0.5) so this centers them. */
        const worldX = col * TILE_SIZE + TILE_SIZE / 2;
        const worldY = row * TILE_SIZE + TILE_SIZE / 2 + MAP_OFFSET_Y;

        const sprite = this.scene.add.image(worldX, worldY, spriteKey);

        /* Set depth to 0 so tiles render behind all game entities. */
        sprite.setDepth(0);

        this.tileSprites.push(sprite);
      }
    }
  }
}
