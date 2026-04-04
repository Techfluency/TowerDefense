/**
 * Unit tests for AudioManager.
 *
 * Tests volume math, mute/unmute logic, SFX rate limiting, music
 * crossfade lifecycle, and settings sync. Uses a mock Phaser scene
 * to verify AudioManager calls the correct Phaser SoundManager APIs.
 *
 * BOLT-015 implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
        Angle: { RotateTo: vi.fn() },
        RandomDataGenerator: class {},
      },
      Geom: { Rectangle: class {}, Point: class {} },
      Time: { TimerEvent: class {} },
    },
  };
});

import { AudioManager } from '../../src/utils/audio-manager';
import { SFX_KEYS, MUSIC_KEYS } from '../../src/config/audio-config';

// ---------------------------------------------------------------------------
// Mock Scene Factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Phaser scene with a mock SoundManager.
 * All sounds are tracked in the `soundStore` map for verification.
 */
function createMockScene(settings?: { sfxVolume: number; musicVolume: number }) {
  const soundStore = new Map<string, {
    volume: number;
    loop: boolean;
    destroyed: boolean;
    setVolume: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>();

  const audioCache = new Set<string>();

  const scene = {
    registry: {
      get: vi.fn((key: string) => {
        if (key === 'gameSettings') {
          return settings ?? { sfxVolume: 100, musicVolume: 100, reduceVisualIntensity: false };
        }
        return undefined;
      }),
    },
    sound: {
      play: vi.fn((key: string, config?: { volume?: number; loop?: boolean }) => {
        const sound = {
          volume: config?.volume ?? 1,
          loop: config?.loop ?? false,
          destroyed: false,
          setVolume: vi.fn((v: number) => { sound.volume = v; }),
          destroy: vi.fn(() => { sound.destroyed = true; }),
        };
        soundStore.set(key, sound);
      }),
      get: vi.fn((key: string) => soundStore.get(key) ?? null),
    },
    cache: {
      audio: {
        exists: vi.fn((key: string) => audioCache.has(key)),
      },
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        /* Simulate tween completing immediately for test purposes. */
        if (typeof config.onComplete === 'function') {
          (config.onComplete as () => void)();
        }
        /* Apply the target volume if present (for music fade). */
        if (config.targets && typeof config.volume === 'number') {
          const targets = config.targets as { volume: number };
          targets.volume = config.volume as number;
        }
        return { stop: vi.fn() };
      }),
    },
    _soundStore: soundStore,
    _audioCache: audioCache,
  };

  return scene;
}

/** Registers a set of audio keys as "loaded" in the mock cache. */
function registerAudioKeys(scene: ReturnType<typeof createMockScene>, keys: string[]): void {
  for (const key of keys) {
    scene._audioCache.add(key);
  }
}

describe('AudioManager', () => {
  let scene: ReturnType<typeof createMockScene>;
  let manager: AudioManager;

  beforeEach(() => {
    scene = createMockScene();
    manager = new AudioManager(scene as unknown as Phaser.Scene);
  });

  // -------------------------------------------------------------------------
  // Volume Control
  // -------------------------------------------------------------------------

  describe('volume control', () => {
    it('should read initial SFX volume from registry settings', () => {
      expect(manager.getSfxVolume()).toBe(100);
    });

    it('should read initial music volume from registry settings', () => {
      expect(manager.getMusicVolume()).toBe(100);
    });

    it('should read custom initial volumes from settings', () => {
      const customScene = createMockScene({ sfxVolume: 50, musicVolume: 75 });
      const customMgr = new AudioManager(customScene as unknown as Phaser.Scene);
      expect(customMgr.getSfxVolume()).toBe(50);
      expect(customMgr.getMusicVolume()).toBe(75);
    });

    it('should set SFX volume from slider value (0-100)', () => {
      manager.setSfxVolume(50);
      expect(manager.getSfxVolume()).toBe(50);
    });

    it('should clamp SFX volume to [0, 100]', () => {
      manager.setSfxVolume(150);
      expect(manager.getSfxVolume()).toBe(100);

      manager.setSfxVolume(-20);
      expect(manager.getSfxVolume()).toBe(0);
    });

    it('should set music volume from slider value (0-100)', () => {
      manager.setMusicVolume(30);
      expect(manager.getMusicVolume()).toBe(30);
    });

    it('should clamp music volume to [0, 100]', () => {
      manager.setMusicVolume(200);
      expect(manager.getMusicVolume()).toBe(100);

      manager.setMusicVolume(-10);
      expect(manager.getMusicVolume()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SFX Playback
  // -------------------------------------------------------------------------

  describe('playSfx', () => {
    it('should play a sound when audio key exists and volume > 0', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_PLACED]);
      const played = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(played).toBe(true);
      expect(scene.sound.play).toHaveBeenCalledWith(
        SFX_KEYS.TOWER_PLACED,
        expect.objectContaining({ volume: expect.any(Number) }),
      );
    });

    it('should return false when audio key is not loaded', () => {
      /* Do not register the key in the cache. */
      const played = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(played).toBe(false);
      expect(scene.sound.play).not.toHaveBeenCalled();
    });

    it('should return false when muted', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_PLACED]);
      manager.toggleMute();
      const played = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(played).toBe(false);
    });

    it('should return false when SFX volume is zero', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_PLACED]);
      manager.setSfxVolume(0);
      const played = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(played).toBe(false);
    });

    it('should apply per-SFX volume multiplier', () => {
      registerAudioKeys(scene, [SFX_KEYS.UI_CLICK]);
      manager.playSfx(SFX_KEYS.UI_CLICK);

      /* UI_CLICK has a 0.5 multiplier, so at 100% global the effective
       * volume should be 0.5. */
      const call = (scene.sound.play as ReturnType<typeof vi.fn>).mock.calls[0];
      const config = call?.[1] as { volume: number };
      expect(config.volume).toBe(0.5);
    });

    it('should scale per-SFX multiplier by global SFX volume', () => {
      registerAudioKeys(scene, [SFX_KEYS.UI_CLICK]);
      manager.setSfxVolume(50);
      manager.playSfx(SFX_KEYS.UI_CLICK);

      /* 50% global * 0.5 per-SFX = 0.25 effective. */
      const call = (scene.sound.play as ReturnType<typeof vi.fn>).mock.calls[0];
      const config = call?.[1] as { volume: number };
      expect(config.volume).toBe(0.25);
    });

    it('should use 1.0 multiplier for sounds without explicit multiplier', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_FIRE_RANGED]);
      manager.playSfx(SFX_KEYS.TOWER_FIRE_RANGED);

      const call = (scene.sound.play as ReturnType<typeof vi.fn>).mock.calls[0];
      const config = call?.[1] as { volume: number };
      /* 100% global * 1.0 default = 1.0 */
      expect(config.volume).toBe(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Rate Limiting
  // -------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('should play rate-limited sound on first call', () => {
      registerAudioKeys(scene, [SFX_KEYS.ENEMY_HIT]);
      const played = manager.playSfx(SFX_KEYS.ENEMY_HIT);
      expect(played).toBe(true);
    });

    it('should block rate-limited sound when called too quickly', () => {
      registerAudioKeys(scene, [SFX_KEYS.ENEMY_HIT]);

      /* First play succeeds. */
      manager.playSfx(SFX_KEYS.ENEMY_HIT);

      /* Immediately play again -- should be blocked by 100ms rate limit. */
      const played = manager.playSfx(SFX_KEYS.ENEMY_HIT);
      expect(played).toBe(false);
    });

    it('should allow rate-limited sound after interval passes', () => {
      registerAudioKeys(scene, [SFX_KEYS.ENEMY_HIT]);

      /* First play. */
      manager.playSfx(SFX_KEYS.ENEMY_HIT);

      /* Advance time past the rate limit (100ms for ENEMY_HIT). */
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 150);

      const played = manager.playSfx(SFX_KEYS.ENEMY_HIT);
      expect(played).toBe(true);
    });

    it('should not rate-limit sounds without a rate limit config', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_PLACED]);

      /* TOWER_PLACED has no rate limit -- should play twice in a row. */
      const first = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      const second = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Music Playback
  // -------------------------------------------------------------------------

  describe('music', () => {
    it('should start music when key exists in cache', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      expect(scene.sound.play).toHaveBeenCalledWith(
        MUSIC_KEYS.GAMEPLAY_AMBIENT,
        expect.objectContaining({ loop: true, volume: 0 }),
      );
      expect(manager.getCurrentMusicKey()).toBe(MUSIC_KEYS.GAMEPLAY_AMBIENT);
    });

    it('should not restart music if same key is already playing', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      (scene.sound.play as ReturnType<typeof vi.fn>).mockClear();

      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(scene.sound.play).not.toHaveBeenCalled();
    });

    it('should crossfade when switching music tracks', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT, MUSIC_KEYS.MENU_THEME]);

      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      manager.playMusic(MUSIC_KEYS.MENU_THEME);

      /* The old track should have been faded out (tween with volume:0). */
      expect(scene.tweens.add).toHaveBeenCalled();
      expect(manager.getCurrentMusicKey()).toBe(MUSIC_KEYS.MENU_THEME);
    });

    it('should stop music and clear current key', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      manager.stopMusic();
      expect(manager.getCurrentMusicKey()).toBeNull();
    });

    it('should handle stopMusic when no music is playing', () => {
      /* Should not throw. */
      expect(() => manager.stopMusic()).not.toThrow();
      expect(manager.getCurrentMusicKey()).toBeNull();
    });

    it('should not play music when key is not in cache', () => {
      /* Do not register the key. */
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(scene.sound.play).not.toHaveBeenCalled();
      expect(manager.getCurrentMusicKey()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Mute Control
  // -------------------------------------------------------------------------

  describe('mute', () => {
    it('should default to not muted', () => {
      expect(manager.isMuted()).toBe(false);
    });

    it('should toggle mute on', () => {
      manager.toggleMute();
      expect(manager.isMuted()).toBe(true);
    });

    it('should toggle mute back off', () => {
      manager.toggleMute();
      manager.toggleMute();
      expect(manager.isMuted()).toBe(false);
    });

    it('should preserve volume levels when muting', () => {
      manager.setSfxVolume(75);
      manager.setMusicVolume(60);
      manager.toggleMute();

      /* Volumes should still read their set values. */
      expect(manager.getSfxVolume()).toBe(75);
      expect(manager.getMusicVolume()).toBe(60);
    });

    it('should set music volume to 0 when muting', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      manager.toggleMute();

      const sound = scene._soundStore.get(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(sound?.setVolume).toHaveBeenCalledWith(0);
    });

    it('should restore music volume when unmuting', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.setMusicVolume(80);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      manager.toggleMute();
      manager.toggleMute();

      const sound = scene._soundStore.get(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      /* Last call should restore to 0.8 (80/100). */
      const calls = (sound?.setVolume as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[0]).toBe(0.8);
    });
  });

  // -------------------------------------------------------------------------
  // Settings Sync
  // -------------------------------------------------------------------------

  describe('syncFromSettings', () => {
    it('should update SFX volume from changed settings', () => {
      /* Start at 100. */
      expect(manager.getSfxVolume()).toBe(100);

      /* Simulate settings change. */
      (scene.registry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        sfxVolume: 40,
        musicVolume: 100,
        reduceVisualIntensity: false,
      });

      manager.syncFromSettings();
      expect(manager.getSfxVolume()).toBe(40);
    });

    it('should update music volume from changed settings', () => {
      (scene.registry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        sfxVolume: 100,
        musicVolume: 60,
        reduceVisualIntensity: false,
      });

      manager.syncFromSettings();
      expect(manager.getMusicVolume()).toBe(60);
    });

    it('should live-update playing music when settings change', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      (scene.registry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        sfxVolume: 100,
        musicVolume: 30,
        reduceVisualIntensity: false,
      });

      manager.syncFromSettings();

      const sound = scene._soundStore.get(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(sound?.setVolume).toHaveBeenCalledWith(0.3);
    });

    it('should use defaults when registry returns null', () => {
      (scene.registry.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      manager.syncFromSettings();
      /* Should fall back to 100/100 defaults. */
      expect(manager.getSfxVolume()).toBe(100);
      expect(manager.getMusicVolume()).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('should stop current music on destroy', () => {
      registerAudioKeys(scene, [MUSIC_KEYS.GAMEPLAY_AMBIENT]);
      manager.playMusic(MUSIC_KEYS.GAMEPLAY_AMBIENT);

      manager.destroy();

      const sound = scene._soundStore.get(MUSIC_KEYS.GAMEPLAY_AMBIENT);
      expect(sound?.destroy).toHaveBeenCalled();
      expect(manager.getCurrentMusicKey()).toBeNull();
    });

    it('should not throw when destroyed without music playing', () => {
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle null sound manager gracefully', () => {
      const brokenScene = {
        ...scene,
        sound: null,
      };
      const mgr = new AudioManager(brokenScene as unknown as Phaser.Scene);
      expect(mgr.playSfx(SFX_KEYS.TOWER_PLACED)).toBe(false);
    });

    it('should handle Phaser sound.play throwing an error', () => {
      registerAudioKeys(scene, [SFX_KEYS.TOWER_PLACED]);
      (scene.sound.play as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('WebAudio not initialized');
      });

      const played = manager.playSfx(SFX_KEYS.TOWER_PLACED);
      expect(played).toBe(false);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
