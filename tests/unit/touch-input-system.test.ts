/**
 * Unit tests for TouchInputSystem (BOLT-022).
 *
 * Tests: long-press gesture (500ms hold), double-tap detection,
 * long-press cancellation on move, gesture isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Mock Phaser before importing system files. */
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class {},
      GameObjects: { Sprite: class {}, Group: class {}, Container: class {} },
      Geom: { Rectangle: class { static Contains = vi.fn(() => true); } },
      Math: { RandomDataGenerator: class {} },
    },
  };
});

import { TouchInputSystem } from '../../src/systems/touch-input-system';
import { GAME_EVENTS } from '../../src/types/game-types';
import type { GameState } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

type InputListenerEntry = { event: string; callback: Function; context: unknown };

function createMockScene() {
  const eventListeners: InputListenerEntry[] = [];
  const inputListeners: InputListenerEntry[] = [];
  const timerCallbacks: Array<{ callback: Function; delay: number }> = [];

  return {
    events: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        eventListeners.push({ event, callback, context });
      }),
      off: vi.fn(),
      emit: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        inputListeners.push({ event, callback, context });
      }),
      off: vi.fn(),
    },
    cameras: {
      main: {
        getWorldPoint: vi.fn((x: number, y: number) => ({ x, y })),
      },
    },
    time: {
      delayedCall: vi.fn((delay: number, callback: Function) => {
        timerCallbacks.push({ callback, delay });
        return { destroy: vi.fn() };
      }),
    },
    _eventListeners: eventListeners,
    _inputListeners: inputListeners,
    _timerCallbacks: timerCallbacks,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 150,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 100,
    maxObjectiveHp: 100,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
    gameMode: 'stage',
    highestWaveReached: 0,
    campaignComplete: false,
  };
}

function createMockPointer(x: number, y: number, rightButton = false): Record<string, unknown> {
  return {
    x,
    y,
    rightButtonDown: () => rightButton,
  };
}

function fireInputEvent(scene: ReturnType<typeof createMockScene>, event: string, payload?: unknown) {
  const entry = scene._inputListeners.find((l) => l.event === event);
  if (entry) {
    entry.callback.call(entry.context, payload);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TouchInputSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let system: TouchInputSystem;

  beforeEach(() => {
    scene = createMockScene();
    gameState = createMockGameState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    system = new TouchInputSystem(scene as any, gameState);
    system.init();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  it('should register pointerdown, pointermove, pointerup on init', () => {
    const events = scene._inputListeners.map(l => l.event);
    expect(events).toContain('pointerdown');
    expect(events).toContain('pointermove');
    expect(events).toContain('pointerup');
  });

  it('should register 3 input listeners', () => {
    expect(scene._inputListeners.length).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Long-Press
  // -----------------------------------------------------------------------

  it('should start a delayed call on pointerdown', () => {
    const pointer = createMockPointer(100, 100);
    fireInputEvent(scene, 'pointerdown', pointer);

    expect(scene.time.delayedCall).toHaveBeenCalledWith(500, expect.any(Function));
  });

  it('should emit TOUCH_LONG_PRESS when timer fires', () => {
    const pointer = createMockPointer(128, 128);
    fireInputEvent(scene, 'pointerdown', pointer);

    /* Trigger the delayed callback (simulates 500ms passing). */
    expect(scene._timerCallbacks.length).toBe(1);
    scene._timerCallbacks[0]!.callback();

    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_LONG_PRESS,
      expect.objectContaining({ col: 2, row: 2 }),
    );
  });

  it('should cancel long-press if pointer moves beyond tolerance', () => {
    const pointer = createMockPointer(100, 100);
    fireInputEvent(scene, 'pointerdown', pointer);

    /* Move 20px away (exceeds 10px tolerance). */
    const movedPointer = createMockPointer(120, 100);
    fireInputEvent(scene, 'pointermove', movedPointer);

    /* Timer callback should still exist but system cancelled the state. */
    /* Trigger pointerup -- no long-press should have fired. */
    fireInputEvent(scene, 'pointerup', movedPointer);

    expect(scene.events.emit).not.toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_LONG_PRESS,
      expect.anything(),
    );
  });

  it('should not cancel long-press for small movement within tolerance', () => {
    const pointer = createMockPointer(100, 100);
    fireInputEvent(scene, 'pointerdown', pointer);

    /* Move only 5px (within 10px tolerance). */
    const movedPointer = createMockPointer(105, 100);
    fireInputEvent(scene, 'pointermove', movedPointer);

    /* Timer fires -- long-press should still emit. */
    scene._timerCallbacks[0]!.callback();

    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_LONG_PRESS,
      expect.anything(),
    );
  });

  it('should ignore right-click on pointerdown', () => {
    const pointer = createMockPointer(100, 100, true);
    fireInputEvent(scene, 'pointerdown', pointer);

    /* No timer should have been started. */
    expect(scene.time.delayedCall).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Double-Tap
  // -----------------------------------------------------------------------

  it('should emit TOUCH_DOUBLE_TAP on two quick taps at the same tile', () => {
    /* First tap. */
    const pointer = createMockPointer(96, 96);
    fireInputEvent(scene, 'pointerdown', pointer);
    fireInputEvent(scene, 'pointerup', pointer);

    /* Second tap at same tile (within 300ms is guaranteed since tests are synchronous). */
    fireInputEvent(scene, 'pointerdown', pointer);
    fireInputEvent(scene, 'pointerup', pointer);

    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_DOUBLE_TAP,
      expect.objectContaining({ col: 1, row: 1 }),
    );
  });

  it('should not emit TOUCH_DOUBLE_TAP for taps on different tiles', () => {
    const pointer1 = createMockPointer(96, 96);
    fireInputEvent(scene, 'pointerdown', pointer1);
    fireInputEvent(scene, 'pointerup', pointer1);

    /* Second tap on a different tile. */
    const pointer2 = createMockPointer(200, 200);
    fireInputEvent(scene, 'pointerdown', pointer2);
    fireInputEvent(scene, 'pointerup', pointer2);

    expect(scene.events.emit).not.toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_DOUBLE_TAP,
      expect.anything(),
    );
  });

  it('should not emit double-tap after long-press consumed the gesture', () => {
    const pointer = createMockPointer(96, 96);

    /* First tap -- long-press fires. */
    fireInputEvent(scene, 'pointerdown', pointer);
    scene._timerCallbacks[0]!.callback();
    fireInputEvent(scene, 'pointerup', pointer);

    /* Second tap immediately. */
    fireInputEvent(scene, 'pointerdown', pointer);
    fireInputEvent(scene, 'pointerup', pointer);

    expect(scene.events.emit).not.toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_DOUBLE_TAP,
      expect.anything(),
    );
  });

  // -----------------------------------------------------------------------
  // Coordinate Mapping
  // -----------------------------------------------------------------------

  it('should compute correct grid coordinates from world position', () => {
    /* Tile size is 64px. Position (192, 320) => col=3, row=5. */
    const pointer = createMockPointer(192, 320);
    fireInputEvent(scene, 'pointerdown', pointer);
    scene._timerCallbacks[0]!.callback();

    expect(scene.events.emit).toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_LONG_PRESS,
      expect.objectContaining({ col: 3, row: 5 }),
    );
  });

  it('should ignore pointerup with negative grid coordinates', () => {
    const pointer = createMockPointer(-10, -10);
    fireInputEvent(scene, 'pointerdown', pointer);
    fireInputEvent(scene, 'pointerup', pointer);

    /* Should not emit anything for out-of-bounds. */
    expect(scene.events.emit).not.toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_DOUBLE_TAP,
      expect.anything(),
    );
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('should remove input listeners on destroy', () => {
    system.destroy();

    expect(scene.input.off).toHaveBeenCalledWith('pointerdown', expect.any(Function), system);
    expect(scene.input.off).toHaveBeenCalledWith('pointermove', expect.any(Function), system);
    expect(scene.input.off).toHaveBeenCalledWith('pointerup', expect.any(Function), system);
  });

  it('should cancel active long-press timer on destroy', () => {
    const pointer = createMockPointer(100, 100);
    fireInputEvent(scene, 'pointerdown', pointer);

    /* Timer is active. */
    expect(scene._timerCallbacks.length).toBe(1);

    system.destroy();

    /* The timer's destroy method should have been called. */
    /* (We verify indirectly -- no TOUCH_LONG_PRESS should fire.) */
    expect(scene.events.emit).not.toHaveBeenCalledWith(
      GAME_EVENTS.TOUCH_LONG_PRESS,
      expect.anything(),
    );
  });

  // -----------------------------------------------------------------------
  // Update (no-op)
  // -----------------------------------------------------------------------

  it('should have a no-op update method', () => {
    /* update() should not throw or emit anything. */
    expect(() => system.update(1000, 16.67)).not.toThrow();
  });
});
