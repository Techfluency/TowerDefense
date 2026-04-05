/**
 * Input system -- translates raw Phaser pointer events into game-meaningful
 * grid-coordinate events.
 *
 * This system is the ONLY place that reads raw Phaser input. All other
 * systems subscribe to the typed events emitted here (TILE_CLICKED,
 * TILE_HOVER_CHANGED, INPUT_CANCEL) rather than accessing Phaser input
 * directly. This prevents duplicated input logic across bolts.
 *
 * Grid coordinates are computed from pixel positions using the TILE_SIZE
 * constant (64px). Pointer positions are converted from screen space to
 * world space to account for camera scrolling (relevant in BOLT-002+).
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState } from '../types/game-types';
import type { TileClickedPayload, TileHoverPayload } from '../types/events';
import { TILE_SIZE, MAP_OFFSET_Y } from '../config/performance-budget';

export class InputSystem extends BaseSystem {
  /** Track the last hovered tile to only emit on tile boundary crossings. */
  private lastHoverCol = -1;
  private lastHoverRow = -1;

  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers Phaser input event handlers.
   * Called after all systems are constructed so event listeners are safe.
   */
  init(): void {
    /* Listen for pointer clicks on the game canvas. */
    this.scene.input.on('pointerdown', this.handlePointerDown, this);

    /* Listen for pointer movement for hover events. */
    this.scene.input.on('pointermove', this.handlePointerMove, this);

    /* Listen for right-click and Escape for cancel events. */
    this.scene.input.on('pointerdown', this.handleRightClick, this);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.on('keydown-ESC', this.handleEscape, this);
    }
  }

  /**
   * No per-frame logic needed -- input is event-driven.
   * Required by BaseSystem contract.
   */
  update(_time: number, _delta: number): void {
    /* Input processing is event-driven, not per-frame. */
  }

  /**
   * Cleans up Phaser input listeners. These are registered on Phaser's
   * input plugin (not scene.events), so BaseSystem's auto-cleanup does
   * not cover them. We must remove them explicitly.
   */
  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerdown', this.handleRightClick, this);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.off('keydown-ESC', this.handleEscape, this);
    }
    super.destroy();
  }

  /**
   * Handles left-click: converts pixel position to grid coordinates
   * and emits TILE_CLICKED.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    /* Only handle left clicks. Right-click is handled separately. */
    if (pointer.rightButtonDown()) return;

    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / TILE_SIZE);
    const row = Math.floor((worldPoint.y - MAP_OFFSET_Y) / TILE_SIZE);

    /* Ignore clicks outside the positive grid space. */
    if (col < 0 || row < 0) return;

    const payload: TileClickedPayload = {
      col,
      row,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    };

    this.emit(GAME_EVENTS.TILE_CLICKED, payload);
  }

  /**
   * Handles pointer movement: emits TILE_HOVER_CHANGED only when the
   * pointer crosses a tile boundary (not every pixel move).
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / TILE_SIZE);
    const row = Math.floor((worldPoint.y - MAP_OFFSET_Y) / TILE_SIZE);

    /* Only emit when the tile actually changes -- prevents flooding. */
    if (col === this.lastHoverCol && row === this.lastHoverRow) return;
    if (col < 0 || row < 0) return;

    this.lastHoverCol = col;
    this.lastHoverRow = row;

    const payload: TileHoverPayload = {
      col,
      row,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    };

    this.emit(GAME_EVENTS.TILE_HOVER_CHANGED, payload);
  }

  /**
   * Handles right-click: emits INPUT_CANCEL.
   * Used by the placement system to cancel in-progress tower placement.
   */
  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (!pointer.rightButtonDown()) return;
    this.emit(GAME_EVENTS.INPUT_CANCEL);
  }

  /**
   * Handles Escape key: emits INPUT_CANCEL.
   */
  private handleEscape(): void {
    this.emit(GAME_EVENTS.INPUT_CANCEL);
  }
}
