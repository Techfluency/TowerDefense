/**
 * Map tile renderer system.
 *
 * Listens for the MAP_READY event, then creates a Phaser.GameObjects.Image
 * sprite for each tile in the grid. Each tile is positioned at its cell center
 * and assigned the appropriate sprite key based on tile type.
 *
 * This system is display-only -- no logic. It reads MapData from the registry
 * and renders the visual representation. All tile sprites are tracked for
 * cleanup in destroy() to prevent visual artifacts on scene restart.
 *
 * Tile sprites use BOLT-001 placeholder PNGs:
 * - tile-buildable (green 64x64)
 * - tile-path (brown 64x64)
 * - tile-spawn (orange 64x64)
 * - tile-objective (purple 64x64)
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { MapData } from '../data/map-data';
import { TILE_SIZE } from '../config/performance-budget';
import { GAME_EVENTS, type GameState, type TileType } from '../types/game-types';

/** Maps tile types to their corresponding sprite texture keys. */
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
   * Registers the MAP_READY listener. When the map generator fires,
   * this system reads the MapData from the registry and renders all tiles.
   */
  init(): void {
    this.listen(
      GAME_EVENTS.MAP_READY,
      this.handleMapReady as (...args: never[]) => void,
    );

    /* If map data is already on the registry (synchronous init order),
     * render immediately. This handles the case where MapGeneratorSystem.init()
     * runs before this system's listener is registered. */
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (mapData) {
      this.renderMap(mapData);
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
   * Handles the MAP_READY event by reading MapData and rendering tiles.
   */
  private handleMapReady(): void {
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (!mapData) {
      console.error('[MapRenderer] MAP_READY fired but no mapData on registry.');
      return;
    }
    this.renderMap(mapData);
  }

  /**
   * Creates a Phaser Image sprite for every tile in the grid.
   * Each sprite is positioned at the center of its grid cell.
   *
   * @param mapData - The generated map data to render.
   */
  private renderMap(mapData: MapData): void {
    const { cols, rows } = mapData.getGridDimensions();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileType = mapData.getTileType(col, row);
        if (!tileType) continue;

        const spriteKey = TILE_SPRITE_KEYS[tileType];

        /* Position at tile center: col * 64 + 32, row * 64 + 32.
         * Phaser Images default to origin(0.5, 0.5) so this centers them. */
        const worldX = col * TILE_SIZE + TILE_SIZE / 2;
        const worldY = row * TILE_SIZE + TILE_SIZE / 2;

        const sprite = this.scene.add.image(worldX, worldY, spriteKey);

        /* Set depth to 0 so tiles render behind all game entities. */
        sprite.setDepth(0);

        this.tileSprites.push(sprite);
      }
    }
  }
}
