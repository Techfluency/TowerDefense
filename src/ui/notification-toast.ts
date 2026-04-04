/**
 * Queued toast notification system for BOLT-016.
 *
 * Displays brief messages for game events ("Wave 5 incoming!",
 * "New Best Score!", "Objective damaged!"). Toasts appear at the top-right
 * of the screen, stack vertically, and auto-dismiss after a configurable
 * duration. Queue prevents overlap by spacing sequential toasts.
 *
 * Usage: create one NotificationToast instance per Gameplay scene,
 * call show() to enqueue a message. The system handles stacking,
 * auto-dismiss, and cleanup.
 */
import Phaser from 'phaser';
import { DEPTH_OVERLAY } from '../config/depth-layers';
import { GAME_WIDTH } from '../config/game-config';
import {
  TOAST_SLIDE_MS,
  TOAST_DISPLAY_MS,
  TOAST_FADE_MS,
} from './ui-animations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum simultaneous visible toasts. */
const MAX_VISIBLE_TOASTS = 3;

/** Toast panel width. */
const TOAST_WIDTH = 260;

/** Toast panel height. */
const TOAST_HEIGHT = 36;

/** Vertical gap between stacked toasts. */
const TOAST_GAP = 6;

/** Starting Y offset from top of screen. */
const TOAST_BASE_Y = 60;

/** Starting X position for slide-in (off-screen right). */
const TOAST_OFF_X = GAME_WIDTH + TOAST_WIDTH;

/** Final X position (right-aligned with margin). */
const TOAST_TARGET_X = GAME_WIDTH - TOAST_WIDTH / 2 - 12;

/** Background styling. */
const TOAST_BG_COLOR = 0x0D0D1A;
const TOAST_BG_ALPHA = 0.9;
const TOAST_BORDER_COLOR = 0x4A4A6A;
const TOAST_CORNER_RADIUS = 4;

// ---------------------------------------------------------------------------
// Toast priority levels
// ---------------------------------------------------------------------------

/** Priority determines queue insertion order when multiple fire simultaneously. */
export type ToastPriority = 'low' | 'normal' | 'high';

/** Priority sort values. Higher = more important = shown first. */
const PRIORITY_VALUES: Record<ToastPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface QueuedToast {
  message: string;
  priority: ToastPriority;
  color: string;
}

interface ActiveToast {
  container: Phaser.GameObjects.Container;
  timer: Phaser.Time.TimerEvent;
}

// ---------------------------------------------------------------------------
// NotificationToast
// ---------------------------------------------------------------------------

export class NotificationToast {
  private readonly scene: Phaser.Scene;

  /** Currently visible toasts (newest at end). */
  private activeToasts: ActiveToast[] = [];

  /** Pending toasts waiting for a slot. */
  private queue: QueuedToast[] = [];

  /**
   * @param scene - The Phaser scene to render toasts in.
   */
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Enqueues a toast notification. If a slot is available, shows immediately.
   * Otherwise queues for display when a current toast dismisses.
   *
   * @param message - Short text to display (max ~40 chars recommended).
   * @param priority - Queue priority (high shows before low if simultaneous).
   * @param color - Text color hex string (defaults to white).
   */
  show(
    message: string,
    priority: ToastPriority = 'normal',
    color: string = '#E0E0E0',
  ): void {
    if (this.activeToasts.length < MAX_VISIBLE_TOASTS) {
      this.displayToast(message, color);
    } else {
      /* Queue with priority sorting -- higher priority inserts earlier. */
      this.queue.push({ message, priority, color });
      this.queue.sort(
        (a, b) => PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority],
      );
    }
  }

  /**
   * Cleans up all active toasts and clears the queue.
   * Call on scene shutdown to prevent ghost objects.
   */
  destroy(): void {
    for (const toast of this.activeToasts) {
      toast.timer.destroy();
      toast.container.destroy();
    }
    this.activeToasts = [];
    this.queue = [];
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Creates and animates a single toast onto the screen.
   *
   * @param message - Toast text.
   * @param color - Text color.
   */
  private displayToast(message: string, color: string): void {
    const slotIndex = this.activeToasts.length;
    const targetY = TOAST_BASE_Y + slotIndex * (TOAST_HEIGHT + TOAST_GAP);

    const container = this.scene.add.container(TOAST_OFF_X, targetY);
    container.setDepth(DEPTH_OVERLAY);

    /* Background panel. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOAST_BG_COLOR, TOAST_BG_ALPHA);
    bg.fillRoundedRect(
      -TOAST_WIDTH / 2, -TOAST_HEIGHT / 2,
      TOAST_WIDTH, TOAST_HEIGHT,
      TOAST_CORNER_RADIUS,
    );
    bg.lineStyle(1, TOAST_BORDER_COLOR, 1);
    bg.strokeRoundedRect(
      -TOAST_WIDTH / 2, -TOAST_HEIGHT / 2,
      TOAST_WIDTH, TOAST_HEIGHT,
      TOAST_CORNER_RADIUS,
    );
    container.add(bg);

    /* Message text. */
    const text = this.scene.add.text(0, 0, message, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color,
    }).setOrigin(0.5);
    container.add(text);

    /* Slide in from right. */
    this.scene.tweens.add({
      targets: container,
      x: TOAST_TARGET_X,
      duration: TOAST_SLIDE_MS,
      ease: 'Back.easeOut',
    });

    /* Auto-dismiss timer. */
    const timer = this.scene.time.delayedCall(
      TOAST_SLIDE_MS + TOAST_DISPLAY_MS,
      () => this.dismissToast(container),
    );

    this.activeToasts.push({ container, timer });
  }

  /**
   * Fades out and removes a toast, then processes the queue.
   *
   * @param container - The toast container to dismiss.
   */
  private dismissToast(container: Phaser.GameObjects.Container): void {
    /* Fade out and slide right. */
    this.scene.tweens.add({
      targets: container,
      x: TOAST_OFF_X,
      alpha: 0,
      duration: TOAST_FADE_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        /* Remove from active list. */
        const idx = this.activeToasts.findIndex((t) => t.container === container);
        if (idx !== -1) {
          this.activeToasts.splice(idx, 1);
        }
        container.destroy();

        /* Reposition remaining toasts to fill the gap. */
        this.repositionToasts();

        /* Process queue if there are pending toasts. */
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.displayToast(next.message, next.color);
        }
      },
    });
  }

  /**
   * Smoothly repositions active toasts to fill vertical gaps after a dismissal.
   */
  private repositionToasts(): void {
    for (let i = 0; i < this.activeToasts.length; i++) {
      const targetY = TOAST_BASE_Y + i * (TOAST_HEIGHT + TOAST_GAP);
      this.scene.tweens.add({
        targets: this.activeToasts[i]!.container,
        y: targetY,
        duration: 150,
        ease: 'Sine.easeOut',
      });
    }
  }
}
