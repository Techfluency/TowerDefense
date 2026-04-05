/**
 * Unit tests for audio-config.ts.
 *
 * Validates that audio configuration constants are consistent, tower class
 * mappings cover all known classes, rate-limit values are reasonable, and
 * volume multipliers are in valid ranges.
 *
 * NOTE: SFX keys no longer need to match ASSET_MANIFEST audio entries
 * because SFX is now generated at runtime via SynthAudio (Web Audio API).
 * The audio array in ASSET_MANIFEST is empty.
 *
 * BOLT-015 implementation (updated: synth audio fix).
 */
import { describe, it, expect, vi } from 'vitest';

/* Mock Phaser before importing source files that transitively import Phaser. */
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
        Angle: { RotateTo: vi.fn() },
        RandomDataGenerator: class {},
      },
      Geom: { Rectangle: class {}, Point: class {} },
      Time: { TimerEvent: class {} },
    },
  };
});

import {
  SFX_KEYS,
  MUSIC_KEYS,
  TOWER_CLASS_FIRE_SFX,
  SFX_RATE_LIMITS,
  SFX_VOLUME_MULTIPLIERS,
  LOW_HP_ALERT_THRESHOLD,
  LOW_HP_ALERT_INTERVAL_MS,
  MUSIC_CROSSFADE_DURATION_MS,
} from '../../src/config/audio-config';
import { ASSET_MANIFEST } from '../../src/config/asset-manifest';

describe('audio-config', () => {
  // -------------------------------------------------------------------------
  // SFX Keys
  // -------------------------------------------------------------------------

  describe('SFX_KEYS', () => {
    it('should have unique values (no duplicate keys)', () => {
      const values = Object.values(SFX_KEYS);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });

    it('should have at least 15 SFX entries', () => {
      /* Brief specifies: 4 tower fire + hit + death + placed + upgraded +
       * removed + wave_start + wave_complete + victory + defeat + currency +
       * ui_click + low_hp = 16 minimum. */
      expect(Object.keys(SFX_KEYS).length).toBeGreaterThanOrEqual(15);
    });
  });

  // -------------------------------------------------------------------------
  // Music Keys
  // -------------------------------------------------------------------------

  describe('MUSIC_KEYS', () => {
    it('should have unique values', () => {
      const values = Object.values(MUSIC_KEYS);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });

    it('should include menu theme and gameplay ambient', () => {
      expect(MUSIC_KEYS.MENU_THEME).toBeDefined();
      expect(MUSIC_KEYS.GAMEPLAY_AMBIENT).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tower Class Fire SFX Mapping
  // -------------------------------------------------------------------------

  describe('TOWER_CLASS_FIRE_SFX', () => {
    it('should map all four required tower classes', () => {
      expect(TOWER_CLASS_FIRE_SFX['ranged']).toBeDefined();
      expect(TOWER_CLASS_FIRE_SFX['focused']).toBeDefined();
      expect(TOWER_CLASS_FIRE_SFX['broadcast']).toBeDefined();
      expect(TOWER_CLASS_FIRE_SFX['antiair']).toBeDefined();
    });

    it('should have a fallback for utility class', () => {
      expect(TOWER_CLASS_FIRE_SFX['utility']).toBeDefined();
    });

    it('should map to valid SFX keys', () => {
      const validKeys = new Set(Object.values(SFX_KEYS));
      for (const sfxKey of Object.values(TOWER_CLASS_FIRE_SFX)) {
        expect(validKeys.has(sfxKey)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rate Limits
  // -------------------------------------------------------------------------

  describe('SFX_RATE_LIMITS', () => {
    it('should only contain valid SFX keys', () => {
      const validKeys = new Set(Object.values(SFX_KEYS));
      for (const key of Object.keys(SFX_RATE_LIMITS)) {
        expect(validKeys.has(key as typeof SFX_KEYS[keyof typeof SFX_KEYS])).toBe(true);
      }
    });

    it('should have positive minIntervalMs for all entries', () => {
      for (const [, config] of Object.entries(SFX_RATE_LIMITS)) {
        expect(config!.minIntervalMs).toBeGreaterThan(0);
      }
    });

    it('should rate-limit high-frequency combat sounds', () => {
      /* These are the sounds most likely to cause audio spam. */
      expect(SFX_RATE_LIMITS[SFX_KEYS.ENEMY_HIT]).toBeDefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.ENEMY_DIED]).toBeDefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.TOWER_FIRE_RANGED]).toBeDefined();
    });

    it('should not rate-limit one-shot SFX (wave, upgrade, game over)', () => {
      expect(SFX_RATE_LIMITS[SFX_KEYS.WAVE_STARTED]).toBeUndefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.WAVE_COMPLETED]).toBeUndefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.GAME_VICTORY]).toBeUndefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.GAME_DEFEAT]).toBeUndefined();
      expect(SFX_RATE_LIMITS[SFX_KEYS.TOWER_UPGRADED]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Volume Multipliers
  // -------------------------------------------------------------------------

  describe('SFX_VOLUME_MULTIPLIERS', () => {
    it('should have values in range (0, 1]', () => {
      for (const [, mult] of Object.entries(SFX_VOLUME_MULTIPLIERS)) {
        expect(mult).toBeGreaterThan(0);
        expect(mult).toBeLessThanOrEqual(1);
      }
    });

    it('should make UI clicks quieter than combat sounds', () => {
      const uiClick = SFX_VOLUME_MULTIPLIERS[SFX_KEYS.UI_CLICK] ?? 1;
      const enemyDied = SFX_VOLUME_MULTIPLIERS[SFX_KEYS.ENEMY_DIED] ?? 1;
      expect(uiClick).toBeLessThan(enemyDied);
    });
  });

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  describe('constants', () => {
    it('LOW_HP_ALERT_THRESHOLD should be between 0 and 1', () => {
      expect(LOW_HP_ALERT_THRESHOLD).toBeGreaterThan(0);
      expect(LOW_HP_ALERT_THRESHOLD).toBeLessThan(1);
    });

    it('LOW_HP_ALERT_INTERVAL_MS should be at least 1 second', () => {
      expect(LOW_HP_ALERT_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
    });

    it('MUSIC_CROSSFADE_DURATION_MS should be positive and reasonable', () => {
      expect(MUSIC_CROSSFADE_DURATION_MS).toBeGreaterThan(0);
      expect(MUSIC_CROSSFADE_DURATION_MS).toBeLessThanOrEqual(5000);
    });
  });

  // -------------------------------------------------------------------------
  // ASSET_MANIFEST Audio Entries
  // -------------------------------------------------------------------------

  describe('ASSET_MANIFEST audio entries', () => {
    it('should have no audio entries (SFX now uses SynthAudio)', () => {
      /* All .ogg files have been removed. SFX is generated at runtime
       * via Web Audio API. When real music files are added, this count
       * should be updated to match. */
      expect(ASSET_MANIFEST.audio.length).toBe(0);
    });
  });
});
