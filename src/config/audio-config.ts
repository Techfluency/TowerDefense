/**
 * Audio configuration -- defines all audio asset keys, volume defaults,
 * rate-limiting thresholds, and event-to-sound mappings.
 *
 * This is the single source of truth for audio behavior tuning. The
 * AudioManager reads these values to decide which sound to play, at what
 * volume, and how aggressively to rate-limit high-frequency events.
 *
 * BOLT-015 implementation.
 */

// ---------------------------------------------------------------------------
// Audio Asset Keys
// ---------------------------------------------------------------------------

/**
 * All SFX asset keys. These must match the keys registered in ASSET_MANIFEST.
 * Tower fire SFX are keyed by tower class so each weapon sounds distinct.
 */
export const SFX_KEYS = {
  /* Tower fire -- one per tower class for aurally distinct weapons. */
  TOWER_FIRE_RANGED: 'sfx-tower-fire-ranged',
  TOWER_FIRE_FOCUSED: 'sfx-tower-fire-focused',
  TOWER_FIRE_BROADCAST: 'sfx-tower-fire-broadcast',
  TOWER_FIRE_ANTIAIR: 'sfx-tower-fire-antiair',

  /* Combat feedback. */
  ENEMY_HIT: 'sfx-enemy-hit',
  ENEMY_DIED: 'sfx-enemy-died',

  /* Tower lifecycle. */
  TOWER_PLACED: 'sfx-tower-placed',
  TOWER_UPGRADED: 'sfx-tower-upgraded',
  TOWER_REMOVED: 'sfx-tower-removed',

  /* Wave progression. */
  WAVE_STARTED: 'sfx-wave-started',
  WAVE_COMPLETED: 'sfx-wave-completed',

  /* Game state. */
  GAME_VICTORY: 'sfx-game-victory',
  GAME_DEFEAT: 'sfx-game-defeat',

  /* Economy feedback. */
  CURRENCY_GAIN: 'sfx-currency-gain',

  /* UI interaction. */
  UI_CLICK: 'sfx-ui-click',

  /* Alerts. */
  LOW_HP_ALERT: 'sfx-low-hp-alert',
} as const;

/** Union type of all SFX key values. */
export type SfxKey = (typeof SFX_KEYS)[keyof typeof SFX_KEYS];

/**
 * Music asset keys. Background loops and stingers.
 */
export const MUSIC_KEYS = {
  MENU_THEME: 'music-menu-theme',
  GAMEPLAY_AMBIENT: 'music-gameplay-ambient',
} as const;

/** Union type of all music key values. */
export type MusicKey = (typeof MUSIC_KEYS)[keyof typeof MUSIC_KEYS];

// ---------------------------------------------------------------------------
// Tower Class to Fire SFX Mapping
// ---------------------------------------------------------------------------

/**
 * Maps tower class identifiers (from TowerDefinition.towerClass) to their
 * fire SFX key. When a TOWER_FIRED event is received, the audio system
 * looks up the tower's class to play the correct weapon sound.
 */
export const TOWER_CLASS_FIRE_SFX: Record<string, SfxKey> = {
  ranged: SFX_KEYS.TOWER_FIRE_RANGED,
  focused: SFX_KEYS.TOWER_FIRE_FOCUSED,
  broadcast: SFX_KEYS.TOWER_FIRE_BROADCAST,
  antiair: SFX_KEYS.TOWER_FIRE_ANTIAIR,
  /* Utility class towers default to ranged sound if they fire. */
  utility: SFX_KEYS.TOWER_FIRE_RANGED,
};

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Rate-limit configuration per SFX key.
 * Prevents audio spam when many of the same event fire simultaneously
 * (e.g., 50 swarm enemies dying in rapid succession).
 *
 * minIntervalMs: minimum milliseconds between plays of this sound.
 * A value of 0 means no rate limiting.
 */
export interface RateLimitConfig {
  minIntervalMs: number;
}

/**
 * Rate limits for high-frequency SFX. Sounds not listed here have no limit.
 * Values chosen to prevent cacophony while preserving audio feedback:
 * - Tower fire: 80ms allows ~12 sounds/sec (enough for 30 towers at varied rates)
 * - Enemy hit: 100ms prevents projectile-spam noise
 * - Enemy died: 120ms groups rapid swarm kills into distinct sounds
 * - Currency gain: 150ms groups rapid kill rewards
 */
export const SFX_RATE_LIMITS: Partial<Record<SfxKey, RateLimitConfig>> = {
  [SFX_KEYS.TOWER_FIRE_RANGED]: { minIntervalMs: 80 },
  [SFX_KEYS.TOWER_FIRE_FOCUSED]: { minIntervalMs: 80 },
  [SFX_KEYS.TOWER_FIRE_BROADCAST]: { minIntervalMs: 80 },
  [SFX_KEYS.TOWER_FIRE_ANTIAIR]: { minIntervalMs: 80 },
  [SFX_KEYS.ENEMY_HIT]: { minIntervalMs: 100 },
  [SFX_KEYS.ENEMY_DIED]: { minIntervalMs: 120 },
  [SFX_KEYS.CURRENCY_GAIN]: { minIntervalMs: 150 },
};

// ---------------------------------------------------------------------------
// Volume Defaults
// ---------------------------------------------------------------------------

/**
 * Per-SFX volume multipliers (0.0 to 1.0), applied on top of the global
 * SFX volume. This lets loud sounds (wave horn) and quiet sounds (UI click)
 * coexist at appropriate levels relative to each other.
 */
export const SFX_VOLUME_MULTIPLIERS: Partial<Record<SfxKey, number>> = {
  [SFX_KEYS.WAVE_STARTED]: 0.8,
  [SFX_KEYS.WAVE_COMPLETED]: 0.7,
  [SFX_KEYS.GAME_VICTORY]: 0.9,
  [SFX_KEYS.GAME_DEFEAT]: 0.9,
  [SFX_KEYS.UI_CLICK]: 0.5,
  [SFX_KEYS.CURRENCY_GAIN]: 0.4,
  [SFX_KEYS.LOW_HP_ALERT]: 0.7,
  [SFX_KEYS.ENEMY_HIT]: 0.6,
  [SFX_KEYS.ENEMY_DIED]: 0.7,
  [SFX_KEYS.TOWER_PLACED]: 0.7,
  [SFX_KEYS.TOWER_UPGRADED]: 0.8,
  [SFX_KEYS.TOWER_REMOVED]: 0.6,
};

// ---------------------------------------------------------------------------
// Low HP Alert Threshold
// ---------------------------------------------------------------------------

/**
 * Objective HP percentage below which the low-HP alert sound plays.
 * At 25% HP, the player gets an audio warning even if not watching the HUD.
 */
export const LOW_HP_ALERT_THRESHOLD = 0.25;

/**
 * Minimum interval between low-HP alert plays (ms).
 * Prevents the alert from looping too aggressively.
 */
export const LOW_HP_ALERT_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Music Crossfade
// ---------------------------------------------------------------------------

/**
 * Duration in milliseconds for music crossfade transitions.
 * Smooth enough to feel intentional, short enough not to delay feedback.
 */
export const MUSIC_CROSSFADE_DURATION_MS = 1500;
