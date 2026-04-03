/**
 * Unit tests for BaseSystem abstract class.
 *
 * Tests lifecycle methods (init/update/destroy), automatic event
 * listener tracking via listen(), and emit() convenience wrapper.
 * Uses a concrete test subclass since BaseSystem is abstract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseSystem } from '../../src/systems/base-system';
import type { GameState } from '../../src/types/game-types';

/** Concrete subclass for testing the abstract BaseSystem. */
class TestSystem extends BaseSystem {
  initCalled = false;
  updateCalled = false;
  destroyCalled = false;
  lastTime = 0;
  lastDelta = 0;

  init(): void {
    this.initCalled = true;
  }

  update(time: number, delta: number): void {
    this.updateCalled = true;
    this.lastTime = time;
    this.lastDelta = delta;
  }

  destroy(): void {
    this.destroyCalled = true;
    super.destroy();
  }

  /** Expose protected listen() for testing. */
  testListen(event: string, callback: (...args: never[]) => void): void {
    this.listen(event, callback);
  }

  /** Expose protected emit() for testing. */
  testEmit(event: string, payload?: unknown): void {
    this.emit(event, payload);
  }
}

/** Creates a mock Phaser scene with a mock EventEmitter. */
function createMockScene() {
  const listeners: Array<{ event: string; callback: Function; context: unknown }> = [];

  return {
    events: {
      on: vi.fn((event: string, callback: Function, context: unknown) => {
        listeners.push({ event, callback, context });
      }),
      off: vi.fn((event: string, callback: Function, context: unknown) => {
        const idx = listeners.findIndex(
          (l) => l.event === event && l.callback === callback && l.context === context,
        );
        if (idx >= 0) listeners.splice(idx, 1);
      }),
      emit: vi.fn(),
    },
    _listeners: listeners,
  };
}

function createMockGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 20,
    maxObjectiveHp: 20,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
  };
}

describe('BaseSystem', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let system: TestSystem;

  beforeEach(() => {
    mockScene = createMockScene();
    gameState = createMockGameState();
    system = new TestSystem(mockScene as never, gameState);
  });

  describe('lifecycle', () => {
    it('should store scene and gameState references', () => {
      /* System should have access to scene and gameState. */
      expect(system).toBeDefined();
    });

    it('should call init when invoked', () => {
      system.init();
      expect(system.initCalled).toBe(true);
    });

    it('should call update with time and delta', () => {
      system.update(1000, 16.67);
      expect(system.updateCalled).toBe(true);
      expect(system.lastTime).toBe(1000);
      expect(system.lastDelta).toBe(16.67);
    });

    it('should call destroy when invoked', () => {
      system.destroy();
      expect(system.destroyCalled).toBe(true);
    });
  });

  describe('listen()', () => {
    it('should register a listener on scene.events', () => {
      const callback = vi.fn();
      system.testListen('TEST_EVENT', callback);

      expect(mockScene.events.on).toHaveBeenCalledWith('TEST_EVENT', callback, system);
    });

    it('should track listeners for cleanup', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      system.testListen('EVENT_A', callback1);
      system.testListen('EVENT_B', callback2);

      /* Both should be registered. */
      expect(mockScene._listeners.length).toBe(2);
    });
  });

  describe('emit()', () => {
    it('should emit events on scene.events', () => {
      const payload = { value: 42 };
      system.testEmit('TEST_EVENT', payload);

      expect(mockScene.events.emit).toHaveBeenCalledWith('TEST_EVENT', payload);
    });

    it('should emit events without payload', () => {
      system.testEmit('SIMPLE_EVENT');
      expect(mockScene.events.emit).toHaveBeenCalledWith('SIMPLE_EVENT', undefined);
    });
  });

  describe('destroy() cleanup', () => {
    it('should remove all tracked listeners on destroy', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      system.testListen('EVENT_A', callback1);
      system.testListen('EVENT_B', callback2);

      system.destroy();

      /* scene.events.off should have been called for each tracked listener. */
      expect(mockScene.events.off).toHaveBeenCalledTimes(2);
      expect(mockScene.events.off).toHaveBeenCalledWith('EVENT_A', callback1, system);
      expect(mockScene.events.off).toHaveBeenCalledWith('EVENT_B', callback2, system);
    });

    it('should handle destroy with no listeners gracefully', () => {
      /* No listeners registered -- destroy should not throw. */
      expect(() => system.destroy()).not.toThrow();
    });
  });
});
