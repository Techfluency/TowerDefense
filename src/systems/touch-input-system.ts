/**
 * Touch input system -- extends the base InputSystem with mobile gestures.
 *
 * BOLT-022: Adds long-press (500ms) and double-tap detection on top of
 * the existing pointer-based input. On desktop, this system is inert --
 * the gestures only activate when a touch device is detected.
 *
 * Gesture mapping:
 * - Long-press on placed tower: opens upgrade panel (replaces right-click)
 * - Long-press on enemy: shows enemy info tooltip
 * - Double-tap on placed tower: triggers sell (replaces right-click sell)
 * - Single tap: delegates to existing TILE_CLICKED flow
 *
 * This system fires events that the existing TowerPlacementSystem and
 * UpgradeSystem already listen to, using the same event payloads.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState } from '../types/game-types';
import { TILE_SIZE } from '../config/performance-budget';
import { LONG_PRESS_DURATION_MS } from '../utils/mobile-detect';

/** Maximum movement in pixels before a long-press is cancelled. */
const LONG_PRESS_MOVE_TOLERANCE = 10;

/** Maximum time in ms between taps to count as a double-tap. */
const DOUBLE_TAP_INTERVAL_MS = 300;

/**
 * Tracks the state of a potential long-press gesture.
 * Created on pointerdown, resolved or cancelled on pointerup/pointermove.
 */
interface LongPressState {
  /** Phaser delayed call timer for the long-press threshold. */
  timer: Phaser.Time.TimerEvent;
  /** Original pointer X at the start of the press. */
  startX: number;
  /** Original pointer Y at the start of the press. */
  startY: number;
  /** Whether the long-press has already fired (prevents re-fire on pointerup). */
  fired: boolean;
}

export class TouchInputSystem extends BaseSystem {
  /** Active long-press tracking state. Null when no press is in progress. */
  private longPressState: LongPressState | null = null;

  /** Timestamp of the last single tap (for double-tap detection). */
  private lastTapTime = 0;

  /** Grid column of the last single tap (for double-tap same-tile check). */
  private lastTapCol = -1;

  /** Grid row of the last single tap. */
  private lastTapRow = -1;

  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers touch gesture listeners.
   * Uses Phaser's input events which fire for both mouse and touch.
   */
  init(): void {
    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
  }

  /**
   * No per-frame logic -- touch gestures are event-driven.
   */
  update(_time: number, _delta: number): void {
    /* Touch gesture processing is event-driven, not per-frame. */
  }

  /**
   * Starts long-press timer on pointer down.
   * Only starts for left-button / primary touch -- right-clicks are handled
   * by the existing InputSystem.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    /* Ignore right-clicks (handled by InputSystem for desktop sell). */
    if (pointer.rightButtonDown()) return;

    /* Cancel any existing long-press timer. */
    this.cancelLongPress();

    /* Start a new long-press timer. */
    const timer = this.scene.time.delayedCall(LONG_PRESS_DURATION_MS, () => {
      this.fireLongPress(pointer);
    });

    this.longPressState = {
      timer,
      startX: pointer.x,
      startY: pointer.y,
      fired: false,
    };
  }

  /**
   * Cancels long-press if the pointer moves too far from the start position.
   * This prevents long-press from firing during drag gestures.
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.longPressState || this.longPressState.fired) return;

    const dx = pointer.x - this.longPressState.startX;
    const dy = pointer.y - this.longPressState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > LONG_PRESS_MOVE_TOLERANCE) {
      this.cancelLongPress();
    }
  }

  /**
   * Handles pointer up: detects double-tap if the long-press didn't fire.
   * If the long-press already fired, this is a no-op (the gesture was consumed).
   */
  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) return;

    const longPressFired = this.longPressState?.fired ?? false;
    this.cancelLongPress();

    /* If the long-press consumed this gesture, skip double-tap detection. */
    if (longPressFired) return;

    /* Convert pointer position to grid coordinates. */
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / TILE_SIZE);
    const row = Math.floor(worldPoint.y / TILE_SIZE);

    if (col < 0 || row < 0) return;

    /* Double-tap detection: same tile, within the interval threshold. */
    const now = Date.now();
    if (
      now - this.lastTapTime < DOUBLE_TAP_INTERVAL_MS &&
      col === this.lastTapCol &&
      row === this.lastTapRow
    ) {
      /* Fire double-tap event. The UpgradeSystem and TowerPlacementSystem
       * listen to this to trigger sell on a placed tower. */
      this.emit(GAME_EVENTS.TOUCH_DOUBLE_TAP, { col, row, worldX: worldPoint.x, worldY: worldPoint.y });
      /* Reset to prevent triple-tap from triggering another double-tap. */
      this.lastTapTime = 0;
      this.lastTapCol = -1;
      this.lastTapRow = -1;
      return;
    }

    this.lastTapTime = now;
    this.lastTapCol = col;
    this.lastTapRow = row;
  }

  /**
   * Fires the long-press event at the pointer's current grid position.
   * Called by the delayed timer after LONG_PRESS_DURATION_MS of holding.
   */
  private fireLongPress(pointer: Phaser.Input.Pointer): void {
    if (!this.longPressState) return;
    this.longPressState.fired = true;

    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / TILE_SIZE);
    const row = Math.floor(worldPoint.y / TILE_SIZE);

    if (col < 0 || row < 0) return;

    this.emit(GAME_EVENTS.TOUCH_LONG_PRESS, { col, row, worldX: worldPoint.x, worldY: worldPoint.y });
  }

  /**
   * Cancels any in-progress long-press timer.
   */
  private cancelLongPress(): void {
    if (this.longPressState) {
      this.longPressState.timer.destroy();
      this.longPressState = null;
    }
  }

  /**
   * Cleans up Phaser input listeners not tracked by BaseSystem.listen().
   */
  destroy(): void {
    this.cancelLongPress();
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    super.destroy();
  }
}
