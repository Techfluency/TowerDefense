/**
 * VFX configuration -- quality tiers, particle counts, and VFX constants.
 *
 * Centralizes all VFX tuning values so the VFXManager and consuming systems
 * reference one source of truth. Quality tiers (high/medium/low) control
 * particle counts and effect intensity, allowing players to reduce visual
 * load for better performance on lower-end hardware.
 *
 * Consumed by:
 * - VFXManager (applies quality scaling to all particle effects)
 * - BOLT-009 settings panel (reads/writes the active quality tier)
 */

// ---------------------------------------------------------------------------
// Quality tier definitions
// ---------------------------------------------------------------------------

/** Available VFX quality levels. Stored in game settings. */
export type VFXQuality = 'high' | 'medium' | 'low';

/**
 * Per-quality scaling factors. Applied as multipliers to base particle
 * counts and effect durations. 'high' is the baseline (1.0).
 */
export interface QualityScaling {
  /** Multiplier for particle quantity in emitters. */
  particleMultiplier: number;
  /** Multiplier for particle lifespan (shorter = less GPU work). */
  lifespanMultiplier: number;
  /** Whether to enable trail effects on projectiles. */
  enableTrails: boolean;
  /** Whether to enable screen shake on boss hits. */
  enableScreenShake: boolean;
}

/** Quality presets keyed by VFXQuality level. */
export const QUALITY_PRESETS: Record<VFXQuality, QualityScaling> = {
  high: {
    particleMultiplier: 1.0,
    lifespanMultiplier: 1.0,
    enableTrails: true,
    enableScreenShake: true,
  },
  medium: {
    particleMultiplier: 0.6,
    lifespanMultiplier: 0.8,
    enableTrails: true,
    enableScreenShake: false,
  },
  low: {
    particleMultiplier: 0.3,
    lifespanMultiplier: 0.5,
    enableTrails: false,
    enableScreenShake: false,
  },
};

// ---------------------------------------------------------------------------
// Hit flash VFX constants
// ---------------------------------------------------------------------------

/** Duration in ms for the white overlay hit flash. */
export const HIT_FLASH_OVERLAY_DURATION_MS = 120;

/** Starting alpha for the white overlay (fades to 0). */
export const HIT_FLASH_OVERLAY_ALPHA = 0.7;

// ---------------------------------------------------------------------------
// Death VFX constants -- per-archetype particle configurations
// ---------------------------------------------------------------------------

/** Base particle count for death burst (scaled by quality). */
export const DEATH_BURST_BASE_COUNT = 12;

/** Death burst particle lifespan in ms. */
export const DEATH_BURST_LIFESPAN_MS = 400;

/** Death burst speed range (min, max) in pixels per second. */
export const DEATH_BURST_SPEED: [number, number] = [40, 120];

/** Death fade + scale-down duration in ms (replaces old 200ms). */
export const DEATH_FADE_DURATION_MS = 300;

/** Death scale-down target (enemy shrinks to this). */
export const DEATH_SCALE_TARGET = 0.3;

/**
 * Per-archetype death burst colors. Keys match EnemyDefinition.id.
 * Each entry is an array of hex colors used as tint for particles.
 */
export const DEATH_BURST_COLORS: Record<string, number[]> = {
  runner:   [0xD94A4A, 0xFF6B6B, 0xFF9999],
  tank:     [0x8B2020, 0xAA4444, 0x663333],
  fast:     [0xFF6B35, 0xFFAA77, 0xFFCC99],
  flyer:    [0x4AC8D9, 0x77DDEE, 0xAAEEFF],
  swarm:    [0xD94A8B, 0xFF77AA, 0xFFAACC],
  shielded: [0x44CCFF, 0x88DDFF, 0xAAEEFF], // BOLT-017: cyan shield particles
  support:  [0x44FF44, 0x88FF88, 0xCCFFCC], // BOLT-017: green aura particles
};

/** Default death burst color when archetype is not in the lookup. */
export const DEATH_BURST_DEFAULT_COLORS = [0xFFFFFF, 0xCCCCCC, 0x999999];

// ---------------------------------------------------------------------------
// Muzzle flash VFX constants
// ---------------------------------------------------------------------------

/** Muzzle flash particle count (base, scaled by quality). */
export const MUZZLE_FLASH_BASE_COUNT = 6;

/** Muzzle flash particle lifespan in ms. */
export const MUZZLE_FLASH_LIFESPAN_MS = 150;

/** Muzzle flash spread in pixels. */
export const MUZZLE_FLASH_SPREAD = 8;

/** Muzzle flash color. */
export const MUZZLE_FLASH_COLOR = 0xFFFF88;

// ---------------------------------------------------------------------------
// Tower recoil (fire animation) constants
// ---------------------------------------------------------------------------

/** Recoil scale multiplier (tower briefly scales up). */
export const TOWER_RECOIL_SCALE = 1.12;

/** Recoil duration (scale up + return) in ms. */
export const TOWER_RECOIL_DURATION_MS = 120;

// ---------------------------------------------------------------------------
// Projectile trail constants
// ---------------------------------------------------------------------------

/** Arrow trail particle lifespan in ms. */
export const TRAIL_ARROW_LIFESPAN_MS = 200;

/** Arrow trail emit frequency in ms. */
export const TRAIL_ARROW_FREQUENCY = 30;

/** Arrow trail particle alpha. */
export const TRAIL_ARROW_ALPHA = 0.5;

/** Missile smoke trail particle lifespan. */
export const TRAIL_MISSILE_LIFESPAN_MS = 350;

/** Missile smoke emit frequency in ms. */
export const TRAIL_MISSILE_FREQUENCY = 25;

/** Missile smoke particle scale range. */
export const TRAIL_MISSILE_SCALE: [number, number] = [0.4, 0.8];

/** Missile smoke color. */
export const TRAIL_MISSILE_COLOR = 0xAAAAAA;

// ---------------------------------------------------------------------------
// Impact VFX constants
// ---------------------------------------------------------------------------

/** Impact particle burst base count (scaled by quality). */
export const IMPACT_BURST_BASE_COUNT = 8;

/** Impact particle lifespan in ms. */
export const IMPACT_BURST_LIFESPAN_MS = 200;

/** Impact particle speed range. */
export const IMPACT_BURST_SPEED: [number, number] = [30, 80];

// ---------------------------------------------------------------------------
// Shockwave burst improvement constants
// ---------------------------------------------------------------------------

/** Shockwave ring duration in ms (expanding + fading). */
export const SHOCKWAVE_RING_DURATION_MS = 350;

/** Shockwave particle count (the ring's companion particles). */
export const SHOCKWAVE_PARTICLE_BASE_COUNT = 10;

/** Shockwave particle lifespan. */
export const SHOCKWAVE_PARTICLE_LIFESPAN_MS = 300;

// ---------------------------------------------------------------------------
// Upgrade VFX constants
// ---------------------------------------------------------------------------

/** Golden particle count for upgrade shower (base). */
export const UPGRADE_SHOWER_BASE_COUNT = 16;

/** Upgrade particle lifespan in ms. */
export const UPGRADE_PARTICLE_LIFESPAN_MS = 600;

/** Upgrade glow pulse duration in ms. */
export const UPGRADE_GLOW_PULSE_DURATION_MS = 400;

/** Upgrade gold color. */
export const UPGRADE_GOLD_COLOR = 0xFFD700;

/** Upgrade particle speed range. */
export const UPGRADE_PARTICLE_SPEED: [number, number] = [20, 80];

// ---------------------------------------------------------------------------
// Screen shake constants
// ---------------------------------------------------------------------------

/** Shake intensity in pixels for boss damage hits. */
export const SCREEN_SHAKE_INTENSITY = 3;

/** Shake duration in ms. */
export const SCREEN_SHAKE_DURATION_MS = 100;

// ---------------------------------------------------------------------------
// Shield VFX constants (BOLT-017)
// ---------------------------------------------------------------------------

/** Color for the shield overlay (cyan/blue). */
export const SHIELD_OVERLAY_COLOR = 0x44CCFF;

/** Shield overlay alpha when shield is active. */
export const SHIELD_OVERLAY_ALPHA = 0.35;

/** Shield break burst particle count (base, scaled by quality). */
export const SHIELD_BREAK_BURST_BASE_COUNT = 10;

/** Shield break burst particle lifespan in ms. */
export const SHIELD_BREAK_BURST_LIFESPAN_MS = 350;

/** Shield break burst particle speed range. */
export const SHIELD_BREAK_BURST_SPEED: [number, number] = [30, 90];

/** Shield break burst colors (cyan shards). */
export const SHIELD_BREAK_COLORS = [0x44CCFF, 0x88DDFF, 0xAAEEFF];

/** Shield regen fade-in duration in ms. */
export const SHIELD_REGEN_FADE_IN_MS = 500;

/** Shield bar color. */
export const SHIELD_BAR_COLOR = 0x44CCFF;

/** Shield bar height in pixels. */
export const SHIELD_BAR_HEIGHT = 3;

/** Shield bar vertical offset above health bar. */
export const SHIELD_BAR_Y_OFFSET = 4;

// ---------------------------------------------------------------------------
// Support aura VFX constants (BOLT-017)
// ---------------------------------------------------------------------------

/** Support aura circle color (green glow). */
export const SUPPORT_AURA_COLOR = 0x44FF44;

/** Support aura circle alpha. */
export const SUPPORT_AURA_ALPHA = 0.15;

/** Support aura circle line width. */
export const SUPPORT_AURA_LINE_WIDTH = 2;

/** Support aura line alpha (border ring). */
export const SUPPORT_AURA_LINE_ALPHA = 0.4;

/** Aura expire burst particle count when support unit dies (base). */
export const AURA_EXPIRE_BURST_BASE_COUNT = 6;

/** Aura expire burst lifespan in ms. */
export const AURA_EXPIRE_BURST_LIFESPAN_MS = 300;

/** Death burst colors for shielded archetype. */
export const DEATH_BURST_COLORS_SHIELDED = [0x44CCFF, 0x88DDFF, 0xAAEEFF];

/** Death burst colors for support archetype. */
export const DEATH_BURST_COLORS_SUPPORT = [0x44FF44, 0x88FF88, 0xCCFFCC];

// ---------------------------------------------------------------------------
// Movement interpolation constants
// ---------------------------------------------------------------------------

/** Rotation easing speed in radians per second for enemy movement. */
export const ENEMY_ROTATION_LERP_SPEED = 10;
