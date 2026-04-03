/**
 * Abstract base class for all game systems.
 *
 * Every gameplay system (enemy, wave, tower combat, input, etc.) extends
 * this class. It provides:
 * - Lifecycle hooks: init(), update(), destroy()
 * - Automatic event listener tracking and cleanup via listen()
 * - Convenience emit() wrapper for scene.events
 *
 * The lifecycle prevents the #1 game engine failure mode: forgotten event
 * listener cleanup causing memory leaks and ghost handlers after scene
 * restart. All listeners registered through listen() are automatically
 * removed when destroy() is called.
 *
 * Usage pattern:
 * 1. Gameplay.create() instantiates all systems (constructor stores refs).
 * 2. Gameplay.create() calls init() on each system in order.
 * 3. Gameplay.update() calls update() on each active system per frame.
 * 4. On scene shutdown, Gameplay calls destroy() in reverse order.
 */
import Phaser from 'phaser';
import type { GameState } from '../types/game-types';

/** Tracked listener entry for automatic cleanup in destroy(). */
interface TrackedListener {
  event: string;
  callback: (...args: never[]) => void;
  context: unknown;
}

export abstract class BaseSystem {
  /** The Phaser scene this system belongs to. Used for event emitter access. */
  protected readonly scene: Phaser.Scene;

  /** The shared game state for this run. Systems read and modify this. */
  protected readonly gameState: GameState;

  /**
   * All event listeners registered through listen(). Stored so destroy()
   * can remove them all, preventing ghost listeners after scene restart.
   */
  private readonly trackedListeners: TrackedListener[] = [];

  /**
   * @param scene - The Phaser scene this system belongs to.
   * @param gameState - The per-run game state shared across systems.
   */
  constructor(scene: Phaser.Scene, gameState: GameState) {
    this.scene = scene;
    this.gameState = gameState;
  }

  /**
   * Called after ALL systems are constructed. Register event listeners here,
   * not in the constructor, so that all systems exist before any system
   * wires listeners. This prevents init-order dependency bugs.
   */
  abstract init(): void;

  /**
   * Called every frame by the Gameplay scene's update loop.
   *
   * @param time - Total elapsed time in ms since game start.
   * @param delta - Milliseconds since the last frame.
   */
  abstract update(time: number, delta: number): void;

  /**
   * Called on scene shutdown. Removes all tracked event listeners.
   * Subclasses that hold additional resources (pools, timers) should
   * override this and call super.destroy() at the end.
   */
  destroy(): void {
    for (const tracked of this.trackedListeners) {
      this.scene.events.off(tracked.event, tracked.callback, tracked.context);
    }
    this.trackedListeners.length = 0;
  }

  /**
   * Registers a listener on scene.events AND tracks it for automatic
   * removal in destroy(). Always use this instead of scene.events.on()
   * directly -- direct registration bypasses cleanup tracking.
   *
   * @param event - The event name (use GAME_EVENTS constants).
   * @param callback - The handler function.
   * @param context - The `this` context for the callback (defaults to this system).
   */
  protected listen(
    event: string,
    callback: (...args: never[]) => void,
    context?: unknown,
  ): void {
    const ctx = context ?? this;
    this.scene.events.on(event, callback, ctx);
    this.trackedListeners.push({ event, callback, context: ctx });
  }

  /**
   * Emits an event on scene.events. Convenience wrapper so systems
   * do not need to reference scene.events directly.
   *
   * @param event - The event name (use GAME_EVENTS constants).
   * @param payload - The typed payload for the event.
   */
  protected emit(event: string, payload?: unknown): void {
    this.scene.events.emit(event, payload);
  }
}
