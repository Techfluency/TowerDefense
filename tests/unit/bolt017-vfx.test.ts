/**
 * Unit tests for BOLT-017 VFX config constants and VFXManager shield/aura methods.
 *
 * Validates that all new VFX constants have sensible values and that
 * the VFXManager's shield break burst and aura expire burst create
 * particles correctly at the given quality tier.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

/* Must mock Phaser before importing source files that transitively use it. */
vi.mock('phaser', () => ({
  default: {
    Math: {
      Angle: {
        RotateTo: vi.fn((current: number, target: number, step: number) => {
          const diff = target - current;
          return Math.abs(diff) < step ? target : current + Math.sign(diff) * step;
        }),
      },
    },
  },
}));

import {
  SHIELD_OVERLAY_COLOR,
  SHIELD_OVERLAY_ALPHA,
  SHIELD_BREAK_BURST_BASE_COUNT,
  SHIELD_BREAK_BURST_LIFESPAN_MS,
  SHIELD_BREAK_BURST_SPEED,
  SHIELD_BREAK_COLORS,
  SHIELD_REGEN_FADE_IN_MS,
  SHIELD_BAR_COLOR,
  SHIELD_BAR_HEIGHT,
  SHIELD_BAR_Y_OFFSET,
  SUPPORT_AURA_COLOR,
  SUPPORT_AURA_ALPHA,
  SUPPORT_AURA_LINE_WIDTH,
  SUPPORT_AURA_LINE_ALPHA,
  AURA_EXPIRE_BURST_BASE_COUNT,
  AURA_EXPIRE_BURST_LIFESPAN_MS,
  DEATH_BURST_COLORS,
} from '../../src/vfx/vfx-config';
import { VFXManager } from '../../src/vfx/vfx-manager';

/** Creates a mock Phaser scene for VFXManager testing. */
function createMockScene() {
  return {
    add: {
      circle: vi.fn(() => ({
        setDepth: vi.fn(),
        setOrigin: vi.fn(),
        destroy: vi.fn(),
      })),
      rectangle: vi.fn(() => ({
        setDepth: vi.fn(),
        setOrigin: vi.fn(),
        destroy: vi.fn(),
      })),
      graphics: vi.fn(() => ({
        setDepth: vi.fn(),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        strokeCircle: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
      }),
    },
    cameras: {
      main: {
        shake: vi.fn(),
      },
    },
  };
}

describe('BOLT-017 VFX Config Constants', () => {
  describe('shield VFX constants', () => {
    it('shield overlay color should be a valid hex color', () => {
      expect(SHIELD_OVERLAY_COLOR).toBeGreaterThan(0);
      expect(SHIELD_OVERLAY_COLOR).toBeLessThanOrEqual(0xFFFFFF);
    });

    it('shield overlay alpha should be between 0 and 1', () => {
      expect(SHIELD_OVERLAY_ALPHA).toBeGreaterThan(0);
      expect(SHIELD_OVERLAY_ALPHA).toBeLessThanOrEqual(1);
    });

    it('shield break burst count should be positive', () => {
      expect(SHIELD_BREAK_BURST_BASE_COUNT).toBeGreaterThan(0);
    });

    it('shield break burst lifespan should be positive', () => {
      expect(SHIELD_BREAK_BURST_LIFESPAN_MS).toBeGreaterThan(0);
    });

    it('shield break speed range should be [min, max] with min < max', () => {
      expect(SHIELD_BREAK_BURST_SPEED[0]).toBeLessThan(SHIELD_BREAK_BURST_SPEED[1]);
    });

    it('shield break colors should have at least one color', () => {
      expect(SHIELD_BREAK_COLORS.length).toBeGreaterThan(0);
    });

    it('shield regen fade-in should be positive', () => {
      expect(SHIELD_REGEN_FADE_IN_MS).toBeGreaterThan(0);
    });

    it('shield bar constants should be positive', () => {
      expect(SHIELD_BAR_COLOR).toBeGreaterThan(0);
      expect(SHIELD_BAR_HEIGHT).toBeGreaterThan(0);
      expect(SHIELD_BAR_Y_OFFSET).toBeGreaterThan(0);
    });
  });

  describe('support aura VFX constants', () => {
    it('aura color should be a valid hex color', () => {
      expect(SUPPORT_AURA_COLOR).toBeGreaterThan(0);
      expect(SUPPORT_AURA_COLOR).toBeLessThanOrEqual(0xFFFFFF);
    });

    it('aura alpha should be between 0 and 1', () => {
      expect(SUPPORT_AURA_ALPHA).toBeGreaterThan(0);
      expect(SUPPORT_AURA_ALPHA).toBeLessThanOrEqual(1);
    });

    it('aura line width should be positive', () => {
      expect(SUPPORT_AURA_LINE_WIDTH).toBeGreaterThan(0);
    });

    it('aura line alpha should be between 0 and 1', () => {
      expect(SUPPORT_AURA_LINE_ALPHA).toBeGreaterThan(0);
      expect(SUPPORT_AURA_LINE_ALPHA).toBeLessThanOrEqual(1);
    });

    it('aura expire burst count should be positive', () => {
      expect(AURA_EXPIRE_BURST_BASE_COUNT).toBeGreaterThan(0);
    });

    it('aura expire burst lifespan should be positive', () => {
      expect(AURA_EXPIRE_BURST_LIFESPAN_MS).toBeGreaterThan(0);
    });
  });

  describe('death burst colors for new archetypes', () => {
    it('should have death burst colors for shielded archetype', () => {
      expect(DEATH_BURST_COLORS['shielded']).toBeDefined();
      expect(DEATH_BURST_COLORS['shielded']!.length).toBeGreaterThan(0);
    });

    it('should have death burst colors for support archetype', () => {
      expect(DEATH_BURST_COLORS['support']).toBeDefined();
      expect(DEATH_BURST_COLORS['support']!.length).toBeGreaterThan(0);
    });

    it('should still have all Phase 1 archetype colors', () => {
      expect(DEATH_BURST_COLORS['runner']).toBeDefined();
      expect(DEATH_BURST_COLORS['tank']).toBeDefined();
      expect(DEATH_BURST_COLORS['fast']).toBeDefined();
      expect(DEATH_BURST_COLORS['flyer']).toBeDefined();
      expect(DEATH_BURST_COLORS['swarm']).toBeDefined();
    });
  });
});

describe('VFXManager Shield/Aura Methods (BOLT-017)', () => {
  let scene: ReturnType<typeof createMockScene>;
  let vfx: VFXManager;

  beforeEach(() => {
    scene = createMockScene();
    vfx = new VFXManager(scene as never, 'high');
  });

  describe('playShieldBreakBurst', () => {
    it('should create circle particles at the given position', () => {
      vfx.playShieldBreakBurst(100, 200);

      /* At high quality (1.0 multiplier), should create SHIELD_BREAK_BURST_BASE_COUNT particles. */
      expect(scene.add.circle).toHaveBeenCalledTimes(SHIELD_BREAK_BURST_BASE_COUNT);

      /* First particle should be at position (100, 200). */
      const firstCall = (scene.add.circle as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstCall[0]).toBe(100);
      expect(firstCall[1]).toBe(200);
    });

    it('should create fewer particles at low quality', () => {
      vfx.setQuality('low');
      vfx.playShieldBreakBurst(100, 200);

      /* Low quality: 0.3 multiplier. floor(10 * 0.3) = 3 particles. */
      expect(scene.add.circle).toHaveBeenCalledTimes(3);
    });

    it('should tween particles outward with fade', () => {
      vfx.playShieldBreakBurst(100, 200);
      expect(scene.tweens.add).toHaveBeenCalled();
    });
  });

  describe('playAuraExpireBurst', () => {
    it('should create circle particles at the given position', () => {
      vfx.playAuraExpireBurst(150, 250);

      /* At high quality, should create AURA_EXPIRE_BURST_BASE_COUNT particles. */
      expect(scene.add.circle).toHaveBeenCalledTimes(AURA_EXPIRE_BURST_BASE_COUNT);
    });

    it('should use green aura color for particles', () => {
      vfx.playAuraExpireBurst(150, 250);

      /* scene.add.circle(x, y, radius, color, alpha) -- color is arg index 3. */
      const firstCall = (scene.add.circle as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstCall[3]).toBe(SUPPORT_AURA_COLOR);
    });

    it('should create fewer particles at low quality', () => {
      vfx.setQuality('low');
      vfx.playAuraExpireBurst(150, 250);

      /* Low: floor(6 * 0.3) = 1. */
      expect(scene.add.circle).toHaveBeenCalledTimes(1);
    });
  });
});
