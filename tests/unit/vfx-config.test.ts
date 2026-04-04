/**
 * Unit tests for VFX configuration constants and quality presets.
 *
 * Validates that quality presets are correctly defined with expected
 * scaling factors, that all VFX duration/count constants are positive,
 * and that per-archetype death burst colors cover all Phase 1 enemies.
 */
import { describe, it, expect } from 'vitest';
import {
  QUALITY_PRESETS,
  DEATH_BURST_COLORS,
  DEATH_BURST_DEFAULT_COLORS,
  DEATH_BURST_BASE_COUNT,
  DEATH_BURST_LIFESPAN_MS,
  DEATH_BURST_SPEED,
  MUZZLE_FLASH_BASE_COUNT,
  MUZZLE_FLASH_LIFESPAN_MS,
  IMPACT_BURST_BASE_COUNT,
  IMPACT_BURST_LIFESPAN_MS,
  SHOCKWAVE_RING_DURATION_MS,
  SHOCKWAVE_PARTICLE_BASE_COUNT,
  UPGRADE_SHOWER_BASE_COUNT,
  UPGRADE_PARTICLE_LIFESPAN_MS,
  HIT_FLASH_OVERLAY_DURATION_MS,
  HIT_FLASH_OVERLAY_ALPHA,
  TOWER_RECOIL_SCALE,
  TOWER_RECOIL_DURATION_MS,
  SCREEN_SHAKE_INTENSITY,
  SCREEN_SHAKE_DURATION_MS,
  ENEMY_ROTATION_LERP_SPEED,
  TRAIL_ARROW_FREQUENCY,
  TRAIL_MISSILE_FREQUENCY,
  DEATH_FADE_DURATION_MS,
  DEATH_SCALE_TARGET,
  type VFXQuality,
} from '../../src/vfx/vfx-config';

describe('VFX Quality Presets', () => {
  it('should define three quality levels: high, medium, low', () => {
    expect(QUALITY_PRESETS).toHaveProperty('high');
    expect(QUALITY_PRESETS).toHaveProperty('medium');
    expect(QUALITY_PRESETS).toHaveProperty('low');
  });

  it('high quality should have full particle multiplier (1.0)', () => {
    expect(QUALITY_PRESETS.high.particleMultiplier).toBe(1.0);
    expect(QUALITY_PRESETS.high.lifespanMultiplier).toBe(1.0);
  });

  it('medium quality should reduce particles but keep trails', () => {
    expect(QUALITY_PRESETS.medium.particleMultiplier).toBeLessThan(1.0);
    expect(QUALITY_PRESETS.medium.particleMultiplier).toBeGreaterThan(0);
    expect(QUALITY_PRESETS.medium.enableTrails).toBe(true);
  });

  it('low quality should have minimal particles and disable trails', () => {
    expect(QUALITY_PRESETS.low.particleMultiplier).toBeLessThan(
      QUALITY_PRESETS.medium.particleMultiplier,
    );
    expect(QUALITY_PRESETS.low.enableTrails).toBe(false);
    expect(QUALITY_PRESETS.low.enableScreenShake).toBe(false);
  });

  it('high quality should enable screen shake, low should not', () => {
    expect(QUALITY_PRESETS.high.enableScreenShake).toBe(true);
    expect(QUALITY_PRESETS.low.enableScreenShake).toBe(false);
  });

  it('all quality levels should have positive multipliers', () => {
    const levels: VFXQuality[] = ['high', 'medium', 'low'];
    for (const level of levels) {
      expect(QUALITY_PRESETS[level].particleMultiplier).toBeGreaterThan(0);
      expect(QUALITY_PRESETS[level].lifespanMultiplier).toBeGreaterThan(0);
    }
  });
});

describe('Death Burst Colors', () => {
  it('should define colors for all Phase 1 enemy archetypes', () => {
    const archetypes = ['runner', 'tank', 'fast', 'flyer', 'swarm'];
    for (const archetype of archetypes) {
      expect(DEATH_BURST_COLORS).toHaveProperty(archetype);
      expect(DEATH_BURST_COLORS[archetype]!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should provide default colors as fallback', () => {
    expect(DEATH_BURST_DEFAULT_COLORS.length).toBeGreaterThanOrEqual(2);
  });

  it('all color values should be valid hex numbers', () => {
    for (const colors of Object.values(DEATH_BURST_COLORS)) {
      for (const color of colors) {
        expect(typeof color).toBe('number');
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xFFFFFF);
      }
    }
  });
});

describe('VFX Duration Constants', () => {
  it('all durations should be positive milliseconds', () => {
    expect(DEATH_BURST_LIFESPAN_MS).toBeGreaterThan(0);
    expect(MUZZLE_FLASH_LIFESPAN_MS).toBeGreaterThan(0);
    expect(IMPACT_BURST_LIFESPAN_MS).toBeGreaterThan(0);
    expect(SHOCKWAVE_RING_DURATION_MS).toBeGreaterThan(0);
    expect(SHOCKWAVE_PARTICLE_BASE_COUNT).toBeGreaterThan(0);
    expect(UPGRADE_PARTICLE_LIFESPAN_MS).toBeGreaterThan(0);
    expect(HIT_FLASH_OVERLAY_DURATION_MS).toBeGreaterThan(0);
    expect(TOWER_RECOIL_DURATION_MS).toBeGreaterThan(0);
    expect(SCREEN_SHAKE_DURATION_MS).toBeGreaterThan(0);
    expect(DEATH_FADE_DURATION_MS).toBeGreaterThan(0);
  });

  it('all base counts should be positive integers', () => {
    expect(DEATH_BURST_BASE_COUNT).toBeGreaterThan(0);
    expect(MUZZLE_FLASH_BASE_COUNT).toBeGreaterThan(0);
    expect(IMPACT_BURST_BASE_COUNT).toBeGreaterThan(0);
    expect(UPGRADE_SHOWER_BASE_COUNT).toBeGreaterThan(0);
  });
});

describe('VFX Range Constants', () => {
  it('death burst speed range should be [min, max] with min < max', () => {
    expect(DEATH_BURST_SPEED[0]).toBeLessThan(DEATH_BURST_SPEED[1]);
  });

  it('hit flash overlay alpha should be between 0 and 1', () => {
    expect(HIT_FLASH_OVERLAY_ALPHA).toBeGreaterThan(0);
    expect(HIT_FLASH_OVERLAY_ALPHA).toBeLessThanOrEqual(1);
  });

  it('tower recoil scale should be > 1 (expansion)', () => {
    expect(TOWER_RECOIL_SCALE).toBeGreaterThan(1);
  });

  it('death scale target should be < 1 (shrink)', () => {
    expect(DEATH_SCALE_TARGET).toBeGreaterThan(0);
    expect(DEATH_SCALE_TARGET).toBeLessThan(1);
  });

  it('enemy rotation lerp speed should be positive', () => {
    expect(ENEMY_ROTATION_LERP_SPEED).toBeGreaterThan(0);
  });

  it('screen shake intensity should be small (subtle effect)', () => {
    expect(SCREEN_SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(SCREEN_SHAKE_INTENSITY).toBeLessThan(10);
  });
});

describe('Trail Frequency Constants', () => {
  it('trail frequencies should be positive', () => {
    expect(TRAIL_ARROW_FREQUENCY).toBeGreaterThan(0);
    expect(TRAIL_MISSILE_FREQUENCY).toBeGreaterThan(0);
  });

  it('missile trail should emit at least as often as arrow trail', () => {
    /* Missiles leave thicker smoke trails, so frequency <= arrow. */
    expect(TRAIL_MISSILE_FREQUENCY).toBeLessThanOrEqual(TRAIL_ARROW_FREQUENCY);
  });
});
