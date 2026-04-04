/**
 * Unit tests for UI animation utilities (BOLT-016).
 *
 * Tests: fadeTransition, fadeIn, slideInFromRight, slideOutToRight,
 * scaleIn, slideDownFrom, countUp, spawnAnimatedFloatingText,
 * attachButtonHoverEffects, fadeInTooltip, staggerFadeIn.
 *
 * Uses mock Phaser scene to verify tween configurations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Mock Phaser before importing source files. */
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class {},
      GameObjects: {
        Sprite: class {},
        Group: class {},
        Container: class {},
        Graphics: class {},
        Text: class {},
      },
      Math: { RandomDataGenerator: class {} },
      Geom: { Rectangle: class {}, Point: class {} },
    },
  };
});

import {
  fadeTransition,
  fadeIn,
  slideInFromRight,
  slideOutToRight,
  scaleIn,
  slideDownFrom,
  countUp,
  spawnAnimatedFloatingText,
  attachButtonHoverEffects,
  fadeInTooltip,
  staggerFadeIn,
  FADE_DURATION_MS,
  PANEL_SLIDE_MS,
  COUNT_UP_MS,
} from '../../src/ui/ui-animations';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCamera() {
  const handlers: Record<string, Function> = {};
  return {
    fadeOut: vi.fn((_duration: number) => {
      /* Simulate immediate callback for tests. */
    }),
    fadeIn: vi.fn(),
    once: vi.fn((event: string, cb: Function) => {
      handlers[event] = cb;
    }),
    _handlers: handlers,
  };
}

function createMockScene() {
  const cam = createMockCamera();
  const tweenConfigs: unknown[] = [];

  return {
    cameras: { main: cam },
    tweens: {
      add: vi.fn((config: unknown) => {
        tweenConfigs.push(config);
        return { destroy: vi.fn(), stop: vi.fn() };
      }),
    },
    add: {
      text: vi.fn((_x: number, _y: number, _content: string, _style: unknown) => ({
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setText: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
        alpha: 1,
      })),
    },
    _cam: cam,
    _tweenConfigs: tweenConfigs,
  };
}

function createMockContainer() {
  return {
    x: 0,
    y: 0,
    alpha: 1,
    setScale: vi.fn(),
    setAlpha: vi.fn(),
    destroy: vi.fn(),
    scaleX: 1,
    scaleY: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UI Animations', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  // --- fadeTransition ---

  describe('fadeTransition', () => {
    it('should call camera fadeOut with correct duration', () => {
      const cb = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeTransition(scene as any, cb);
      expect(scene._cam.fadeOut).toHaveBeenCalledWith(FADE_DURATION_MS, 0, 0, 0);
    });

    it('should register a camerafadeoutcomplete handler', () => {
      const cb = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeTransition(scene as any, cb);
      expect(scene._cam.once).toHaveBeenCalledWith('camerafadeoutcomplete', expect.any(Function));
    });

    it('should invoke the midpoint callback when fade completes', () => {
      const cb = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeTransition(scene as any, cb);
      /* Simulate the camera fade completing. */
      const handler = scene._cam._handlers['camerafadeoutcomplete'];
      expect(handler).toBeDefined();
      handler!();
      expect(cb).toHaveBeenCalledOnce();
    });

    it('should accept a custom duration', () => {
      const cb = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeTransition(scene as any, cb, 200);
      expect(scene._cam.fadeOut).toHaveBeenCalledWith(200, 0, 0, 0);
    });
  });

  // --- fadeIn ---

  describe('fadeIn', () => {
    it('should call camera fadeIn with default duration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeIn(scene as any);
      expect(scene._cam.fadeIn).toHaveBeenCalledWith(FADE_DURATION_MS, 0, 0, 0);
    });

    it('should accept a custom duration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeIn(scene as any, 500);
      expect(scene._cam.fadeIn).toHaveBeenCalledWith(500, 0, 0, 0);
    });
  });

  // --- slideInFromRight ---

  describe('slideInFromRight', () => {
    it('should position container off-screen and tween to target', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideInFromRight(scene as any, container as any, 500);
      /* Container should start at targetX + 400 = 900. */
      expect(container.x).toBe(900);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.x).toBe(500);
      expect(config.ease).toBe('Back.easeOut');
    });

    it('should use custom offscreen X when provided', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideInFromRight(scene as any, container as any, 500, 1500);
      expect(container.x).toBe(1500);
    });

    it('should use default duration', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideInFromRight(scene as any, container as any, 500);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.duration).toBe(PANEL_SLIDE_MS);
    });
  });

  // --- slideOutToRight ---

  describe('slideOutToRight', () => {
    it('should tween container off-screen right', () => {
      const container = createMockContainer();
      container.x = 500;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideOutToRight(scene as any, container as any);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.x).toBe(900); /* 500 + 400 */
    });
  });

  // --- scaleIn ---

  describe('scaleIn', () => {
    it('should set scale to 0 and tween to 1', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scaleIn(scene as any, container as any);
      expect(container.setScale).toHaveBeenCalledWith(0);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.scaleX).toBe(1);
      expect(config.scaleY).toBe(1);
      expect(config.ease).toBe('Back.easeOut');
    });
  });

  // --- slideDownFrom ---

  describe('slideDownFrom', () => {
    it('should position above target and tween down', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideDownFrom(scene as any, container as any, 400);
      /* Default startY = targetY - 300 = 100. */
      expect(container.y).toBe(100);
      expect(container.setAlpha).toHaveBeenCalledWith(0);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.y).toBe(400);
      expect(config.alpha).toBe(1);
    });

    it('should use custom startY when provided', () => {
      const container = createMockContainer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideDownFrom(scene as any, container as any, 400, 50);
      expect(container.y).toBe(50);
    });

    it('should handle containers without setAlpha by setting alpha directly', () => {
      const container = { x: 0, y: 0, alpha: 1 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideDownFrom(scene as any, container as any, 400);
      expect(container.alpha).toBe(0);
    });
  });

  // --- countUp ---

  describe('countUp', () => {
    it('should immediately set the final value on the text object', () => {
      const textObj = { setText: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countUp(scene as any, textObj as any, 0, 100);
      expect(textObj.setText).toHaveBeenCalledWith('100');
    });

    it('should create a tween for the animation', () => {
      const textObj = { setText: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countUp(scene as any, textObj as any, 0, 100);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    });

    it('should apply prefix and suffix', () => {
      const textObj = { setText: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countUp(scene as any, textObj as any, 0, 50, 'Score: ', 'pts');
      expect(textObj.setText).toHaveBeenCalledWith('Score: 50pts');
    });

    it('should use default duration', () => {
      const textObj = { setText: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countUp(scene as any, textObj as any, 0, 100);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.duration).toBe(COUNT_UP_MS);
    });
  });

  // --- spawnAnimatedFloatingText ---

  describe('spawnAnimatedFloatingText', () => {
    it('should create a text object at the specified position', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnAnimatedFloatingText(scene as any, 100, 200, '+25g', { color: '#FFD700' }, 99);
      expect(scene.add.text).toHaveBeenCalledWith(100, 200, '+25g', { color: '#FFD700' });
    });

    it('should add a rise-and-fade tween', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnAnimatedFloatingText(scene as any, 100, 200, '+25g', { color: '#FFD700' }, 99);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.y).toBe(200 - 35); /* default rise = 35 */
      expect(config.ease).toBe('Cubic.easeOut');
    });

    it('should accept custom rise and duration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnAnimatedFloatingText(scene as any, 0, 100, 'test', {}, 99, 50, 800);
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.y).toBe(50); /* 100 - 50 */
      expect(config.duration).toBe(800);
    });
  });

  // --- attachButtonHoverEffects ---

  describe('attachButtonHoverEffects', () => {
    it('should register pointerover and pointerout listeners on hitZone', () => {
      const target = { setScale: vi.fn() };
      const hitZone = { on: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachButtonHoverEffects(scene as any, target, hitZone as any);
      expect(hitZone.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
      expect(hitZone.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
    });

    it('should add a scale tween on pointerover', () => {
      const target = { setScale: vi.fn() };
      const hitZone = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'pointerover') cb();
        }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachButtonHoverEffects(scene as any, target, hitZone as any);
      expect(scene.tweens.add).toHaveBeenCalled();
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.scaleX).toBeGreaterThan(1);
    });
  });

  // --- fadeInTooltip ---

  describe('fadeInTooltip', () => {
    it('should set alpha to 0 and offset Y before tweening in', () => {
      const container = createMockContainer();
      container.y = 300;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fadeInTooltip(scene as any, container as any);
      expect(container.setAlpha).toHaveBeenCalledWith(0);
      expect(container.y).toBe(308); /* 300 + 8 */
      const config = scene._tweenConfigs[0] as Record<string, unknown>;
      expect(config.alpha).toBe(1);
      expect(config.y).toBe(300); /* original Y */
    });
  });

  // --- staggerFadeIn ---

  describe('staggerFadeIn', () => {
    it('should add tweens for each item with increasing delays', () => {
      const items = [
        { y: 100, alpha: 1, setAlpha: vi.fn() },
        { y: 120, alpha: 1, setAlpha: vi.fn() },
        { y: 140, alpha: 1, setAlpha: vi.fn() },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      staggerFadeIn(scene as any, items as any[]);
      expect(scene.tweens.add).toHaveBeenCalledTimes(3);

      /* Each tween should have an increasing delay. */
      const delays = scene._tweenConfigs.map((c: unknown) => (c as Record<string, number>).delay);
      expect(delays[0]).toBe(0);
      expect(delays[1]).toBe(80); /* default stagger = 80ms */
      expect(delays[2]).toBe(160);
    });

    it('should set alpha to 0 and offset Y for each item', () => {
      const items = [
        { y: 100, alpha: 1, setAlpha: vi.fn() },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      staggerFadeIn(scene as any, items as any[]);
      expect(items[0]!.setAlpha).toHaveBeenCalledWith(0);
      expect(items[0]!.y).toBe(112); /* 100 + 12 */
    });
  });
});
