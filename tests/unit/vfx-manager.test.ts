/**
 * Unit tests for VFXManager.
 *
 * Tests quality tier switching, particle count scaling, VFX method calls,
 * trail enable/disable logic, and the death tween config API. Uses a mock
 * Phaser scene to verify that VFX objects are created with correct parameters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Mock Phaser before importing source files -- Phaser requires browser APIs. */
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
      Math: {
        Angle: {
          RotateTo: vi.fn((current: number, target: number, maxDelta: number) => {
            /* Simplified RotateTo: move toward target by maxDelta. */
            const diff = target - current;
            if (Math.abs(diff) <= maxDelta) return target;
            return current + Math.sign(diff) * maxDelta;
          }),
        },
        RandomDataGenerator: class {},
      },
      Geom: { Rectangle: class {}, Point: class {} },
      Time: { TimerEvent: class {} },
    },
  };
});

import { VFXManager } from '../../src/vfx/vfx-manager';
import {
  QUALITY_PRESETS,
  HIT_FLASH_OVERLAY_DURATION_MS,
  DEATH_FADE_DURATION_MS,
  DEATH_SCALE_TARGET,
  DEATH_BURST_BASE_COUNT,
  MUZZLE_FLASH_BASE_COUNT,
  IMPACT_BURST_BASE_COUNT,
  SHOCKWAVE_PARTICLE_BASE_COUNT,
  UPGRADE_SHOWER_BASE_COUNT,
} from '../../src/vfx/vfx-config';

/** Creates a minimal mock Phaser scene for VFXManager. */
function createMockScene() {
  const destroyFn = vi.fn();
  const setDepthFn = vi.fn();
  const setOriginFn = vi.fn();

  return {
    add: {
      rectangle: vi.fn(() => ({
        setDepth: setDepthFn,
        setOrigin: setOriginFn,
        destroy: destroyFn,
        x: 0,
        y: 0,
        alpha: 1,
      })),
      circle: vi.fn(() => ({
        setDepth: setDepthFn,
        destroy: destroyFn,
        x: 0,
        y: 0,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
      })),
      graphics: vi.fn(() => ({
        setDepth: setDepthFn,
        clear: vi.fn(),
        lineStyle: vi.fn(),
        strokeCircle: vi.fn(),
        destroy: destroyFn,
      })),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        /* Simulate tween completing instantly for test purposes. */
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
        return { stop: vi.fn() };
      }),
    },
    cameras: {
      main: {
        shake: vi.fn(),
      },
    },
    _destroyFn: destroyFn,
    _setDepthFn: setDepthFn,
  };
}

describe('VFXManager', () => {
  let scene: ReturnType<typeof createMockScene>;
  let manager: VFXManager;

  beforeEach(() => {
    scene = createMockScene();
    manager = new VFXManager(scene as unknown as Phaser.Scene, 'high');
  });

  // -------------------------------------------------------------------------
  // Quality control
  // -------------------------------------------------------------------------

  describe('quality control', () => {
    it('should default to high quality', () => {
      expect(manager.getQuality()).toBe('high');
    });

    it('should switch to medium quality', () => {
      manager.setQuality('medium');
      expect(manager.getQuality()).toBe('medium');
      expect(manager.getQualityScaling()).toEqual(QUALITY_PRESETS.medium);
    });

    it('should switch to low quality', () => {
      manager.setQuality('low');
      expect(manager.getQuality()).toBe('low');
      expect(manager.getQualityScaling()).toEqual(QUALITY_PRESETS.low);
    });

    it('should return correct scaling for high quality', () => {
      expect(manager.getQualityScaling().particleMultiplier).toBe(1.0);
      expect(manager.getQualityScaling().enableTrails).toBe(true);
      expect(manager.getQualityScaling().enableScreenShake).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Hit flash
  // -------------------------------------------------------------------------

  describe('playHitFlash', () => {
    it('should create a rectangle overlay and tween it', () => {
      const mockSprite = { x: 100, y: 200, displayWidth: 32, displayHeight: 32 };
      manager.playHitFlash(mockSprite as unknown as Phaser.GameObjects.Sprite);

      expect(scene.add.rectangle).toHaveBeenCalledWith(
        100, 200, 32, 32, 0xFFFFFF, expect.any(Number),
      );
      expect(scene.tweens.add).toHaveBeenCalled();

      /* Verify the tween targets the overlay with correct duration. */
      const tweenConfig = (scene.tweens.add as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(tweenConfig.alpha).toBe(0);
      expect(tweenConfig.duration).toBe(HIT_FLASH_OVERLAY_DURATION_MS);
    });
  });

  // -------------------------------------------------------------------------
  // Death burst
  // -------------------------------------------------------------------------

  describe('playDeathBurst', () => {
    it('should create particles for known archetype', () => {
      manager.playDeathBurst(100, 200, 'runner');
      expect(scene.add.circle).toHaveBeenCalledTimes(DEATH_BURST_BASE_COUNT);
    });

    it('should create particles for unknown archetype using defaults', () => {
      manager.playDeathBurst(100, 200, 'unknown_enemy');
      expect(scene.add.circle).toHaveBeenCalledTimes(DEATH_BURST_BASE_COUNT);
    });

    it('should create fewer particles at low quality', () => {
      manager.setQuality('low');
      manager.playDeathBurst(100, 200, 'runner');

      const expectedCount = Math.floor(
        DEATH_BURST_BASE_COUNT * QUALITY_PRESETS.low.particleMultiplier,
      );
      expect(scene.add.circle).toHaveBeenCalledTimes(expectedCount);
    });

    it('should create scaled particles at medium quality', () => {
      manager.setQuality('medium');
      manager.playDeathBurst(100, 200, 'runner');

      const expectedCount = Math.floor(
        DEATH_BURST_BASE_COUNT * QUALITY_PRESETS.medium.particleMultiplier,
      );
      expect(scene.add.circle).toHaveBeenCalledTimes(expectedCount);
    });
  });

  describe('getDeathTweenConfig', () => {
    it('should return correct fade duration and scale target', () => {
      const config = manager.getDeathTweenConfig();
      expect(config.duration).toBe(DEATH_FADE_DURATION_MS);
      expect(config.targetScale).toBe(DEATH_SCALE_TARGET);
    });
  });

  // -------------------------------------------------------------------------
  // Muzzle flash
  // -------------------------------------------------------------------------

  describe('playMuzzleFlash', () => {
    it('should create particles at the given position', () => {
      manager.playMuzzleFlash(50, 75);
      expect(scene.add.circle).toHaveBeenCalledTimes(MUZZLE_FLASH_BASE_COUNT);
    });

    it('should scale particle count by quality', () => {
      manager.setQuality('low');
      manager.playMuzzleFlash(50, 75);

      const expectedCount = Math.floor(
        MUZZLE_FLASH_BASE_COUNT * QUALITY_PRESETS.low.particleMultiplier,
      );
      expect(scene.add.circle).toHaveBeenCalledTimes(expectedCount);
    });
  });

  // -------------------------------------------------------------------------
  // Tower recoil
  // -------------------------------------------------------------------------

  describe('playTowerRecoil', () => {
    it('should create a scale tween on the sprite', () => {
      const mockSprite = { scaleX: 1, scaleY: 1 };
      manager.playTowerRecoil(mockSprite as unknown as Phaser.GameObjects.Sprite);

      expect(scene.tweens.add).toHaveBeenCalled();
      const tweenConfig = (scene.tweens.add as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(tweenConfig.yoyo).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Impact burst
  // -------------------------------------------------------------------------

  describe('playImpactBurst', () => {
    it('should create particles for arrow projectile', () => {
      manager.playImpactBurst(100, 200, 'arrow');
      expect(scene.add.circle).toHaveBeenCalledTimes(IMPACT_BURST_BASE_COUNT);
    });

    it('should create particles for missile projectile', () => {
      manager.playImpactBurst(100, 200, 'missile');
      expect(scene.add.circle).toHaveBeenCalledTimes(IMPACT_BURST_BASE_COUNT);
    });
  });

  // -------------------------------------------------------------------------
  // Shockwave burst
  // -------------------------------------------------------------------------

  describe('playShockwaveBurst', () => {
    it('should create graphics for expanding ring plus particles', () => {
      manager.playShockwaveBurst(100, 200, 150);

      /* One graphics object for the ring. */
      expect(scene.add.graphics).toHaveBeenCalledTimes(1);
      /* Plus particles. */
      expect(scene.add.circle).toHaveBeenCalledTimes(SHOCKWAVE_PARTICLE_BASE_COUNT);
    });

    it('should scale particle count at lower quality', () => {
      manager.setQuality('medium');
      manager.playShockwaveBurst(100, 200, 150);

      const expectedCount = Math.floor(
        SHOCKWAVE_PARTICLE_BASE_COUNT * QUALITY_PRESETS.medium.particleMultiplier,
      );
      expect(scene.add.circle).toHaveBeenCalledTimes(expectedCount);
    });
  });

  // -------------------------------------------------------------------------
  // Upgrade VFX
  // -------------------------------------------------------------------------

  describe('playUpgradeVFX', () => {
    it('should create golden particles and a glow tween', () => {
      const mockSprite = {
        scaleX: 1,
        scaleY: 1,
        setTint: vi.fn(),
        clearTint: vi.fn(),
        setScale: vi.fn(),
      };
      manager.playUpgradeVFX(
        mockSprite as unknown as Phaser.GameObjects.Sprite,
        100, 200,
      );

      /* Golden particle shower. */
      expect(scene.add.circle).toHaveBeenCalledTimes(UPGRADE_SHOWER_BASE_COUNT);

      /* Glow pulse tint applied. */
      expect(mockSprite.setTint).toHaveBeenCalledWith(0xFFD700);
    });
  });

  // -------------------------------------------------------------------------
  // Trails
  // -------------------------------------------------------------------------

  describe('trails', () => {
    it('areTrailsEnabled should return true at high quality', () => {
      expect(manager.areTrailsEnabled()).toBe(true);
    });

    it('areTrailsEnabled should return false at low quality', () => {
      manager.setQuality('low');
      expect(manager.areTrailsEnabled()).toBe(false);
    });

    it('emitTrailParticle should create a dot for arrow type', () => {
      manager.emitTrailParticle(100, 200, 'arrow');
      expect(scene.add.circle).toHaveBeenCalledTimes(1);
    });

    it('emitTrailParticle should create a smoke particle for missile type', () => {
      manager.emitTrailParticle(100, 200, 'missile');
      expect(scene.add.circle).toHaveBeenCalledTimes(1);
    });

    it('emitTrailParticle should do nothing at low quality', () => {
      manager.setQuality('low');
      manager.emitTrailParticle(100, 200, 'arrow');
      expect(scene.add.circle).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Screen shake
  // -------------------------------------------------------------------------

  describe('playScreenShake', () => {
    it('should call camera shake at high quality', () => {
      manager.playScreenShake();
      expect(scene.cameras.main.shake).toHaveBeenCalledTimes(1);
    });

    it('should NOT call camera shake at medium quality', () => {
      manager.setQuality('medium');
      manager.playScreenShake();
      expect(scene.cameras.main.shake).not.toHaveBeenCalled();
    });

    it('should NOT call camera shake at low quality', () => {
      manager.setQuality('low');
      manager.playScreenShake();
      expect(scene.cameras.main.shake).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Rotation lerp
  // -------------------------------------------------------------------------

  describe('lerpRotation', () => {
    it('should interpolate sprite rotation toward target angle', () => {
      const mockSprite = { rotation: 0 };
      const targetAngle = Math.PI / 2;
      const dt = 0.1;
      const speed = 10;

      manager.lerpRotation(
        mockSprite as unknown as Phaser.GameObjects.Sprite,
        targetAngle,
        speed,
        dt,
      );

      /* Rotation should move toward target but not overshoot. */
      expect(mockSprite.rotation).toBeGreaterThan(0);
      expect(mockSprite.rotation).toBeLessThanOrEqual(targetAngle);
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('should not throw when called', () => {
      expect(() => manager.destroy()).not.toThrow();
    });
  });
});
