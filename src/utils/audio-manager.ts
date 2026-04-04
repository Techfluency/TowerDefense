/**
 * AudioManager -- centralized audio playback and volume control.
 *
 * Wraps Phaser's SoundManager to provide:
 * - Independent SFX and music volume channels
 * - SFX rate limiting to prevent audio spam from rapid game events
 * - Music crossfade for smooth track transitions
 * - Mute/unmute that preserves volume levels
 * - Integration with the settings panel volume sliders (registry-based)
 *
 * This class does NOT listen to game events directly. The AudioSystem
 * (a BaseSystem subclass) handles event subscriptions and calls
 * AudioManager methods. This separation keeps AudioManager testable
 * without needing the full Phaser event emitter.
 *
 * BOLT-015 implementation.
 */
import Phaser from 'phaser';
import type { SfxKey, MusicKey, RateLimitConfig } from '../config/audio-config';
import {
  SFX_RATE_LIMITS,
  SFX_VOLUME_MULTIPLIERS,
  MUSIC_CROSSFADE_DURATION_MS,
} from '../config/audio-config';

/** Settings shape stored on the Phaser registry by MainMenu (BOLT-009). */
interface SettingsState {
  sfxVolume: number;
  musicVolume: number;
  reduceVisualIntensity: boolean;
}

export class AudioManager {
  /** Reference to the Phaser scene for sound manager access. */
  private readonly scene: Phaser.Scene;

  /** Global SFX volume (0.0 - 1.0). Derived from settings sfxVolume (0-100). */
  private sfxVolume: number;

  /** Global music volume (0.0 - 1.0). Derived from settings musicVolume (0-100). */
  private musicVolume: number;

  /** Whether all audio output is muted. */
  private muted: boolean = false;

  /**
   * Timestamps of the last play call for each rate-limited SFX key.
   * Used to enforce minimum intervals between duplicate sounds.
   */
  private readonly lastPlayTime: Map<string, number> = new Map();

  /** Currently playing background music key (null if none). */
  private currentMusicKey: string | null = null;

  /**
   * Creates the AudioManager and reads initial volume from settings.
   *
   * @param scene - The Phaser scene providing the sound manager.
   */
  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    /* Read initial volume from registry settings (set by MainMenu). */
    const settings = this.getSettings();
    this.sfxVolume = settings.sfxVolume / 100;
    this.musicVolume = settings.musicVolume / 100;
  }

  // -------------------------------------------------------------------------
  // SFX Playback
  // -------------------------------------------------------------------------

  /**
   * Plays a sound effect by key, respecting volume and rate limiting.
   *
   * The effective volume is: globalSfxVolume * perSfxMultiplier.
   * If the sound is rate-limited and was played too recently, this is a no-op.
   *
   * @param key - The SFX asset key (must be preloaded in ASSET_MANIFEST).
   * @returns True if the sound was played, false if skipped (muted or rate-limited).
   */
  playSfx(key: SfxKey): boolean {
    if (this.muted || this.sfxVolume <= 0) return false;

    /* Check rate limit before playing. */
    if (!this.passesRateLimit(key)) return false;

    /* Calculate effective volume: global * per-sound multiplier. */
    const perSfxMult = SFX_VOLUME_MULTIPLIERS[key] ?? 1.0;
    const effectiveVolume = this.sfxVolume * perSfxMult;

    /* Attempt to play via Phaser's sound manager.
     * If the audio key is missing (placeholder not loaded), this is a no-op
     * rather than a crash -- Phaser.Sound.BaseSoundManager.play returns false
     * for missing keys in some builds, but may also throw. We guard both. */
    try {
      if (!this.scene.sound || !this.scene.cache.audio.exists(key)) {
        return false;
      }
      this.scene.sound.play(key, { volume: effectiveVolume });
      this.lastPlayTime.set(key, Date.now());
      return true;
    } catch {
      /* Graceful degradation: missing audio should not crash the game. */
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Music Playback
  // -------------------------------------------------------------------------

  /**
   * Starts playing background music, crossfading from any current track.
   *
   * If the requested track is already playing, this is a no-op.
   * The music loops indefinitely until stopped or replaced.
   *
   * @param key - The music asset key.
   */
  playMusic(key: MusicKey): void {
    if (this.currentMusicKey === key) return;
    if (!this.scene.sound || !this.scene.cache.audio.exists(key)) return;

    /* Fade out the current track if one is playing. */
    if (this.currentMusicKey) {
      this.fadeOutMusic(this.currentMusicKey);
    }

    /* Start the new track at zero volume and fade in. */
    const effectiveVolume = this.muted ? 0 : this.musicVolume;
    try {
      this.scene.sound.play(key, {
        volume: 0,
        loop: true,
      });
      this.currentMusicKey = key;

      /* Fade in using a Phaser tween on the sound's volume. */
      const sound = this.scene.sound.get(key);
      if (sound && this.scene.tweens) {
        this.scene.tweens.add({
          targets: sound,
          volume: effectiveVolume,
          duration: MUSIC_CROSSFADE_DURATION_MS,
          ease: 'Linear',
        });
      }
    } catch {
      /* Graceful degradation for missing music assets. */
      this.currentMusicKey = null;
    }
  }

  /**
   * Stops any currently playing background music with a fade-out.
   */
  stopMusic(): void {
    if (this.currentMusicKey) {
      this.fadeOutMusic(this.currentMusicKey);
      this.currentMusicKey = null;
    }
  }

  /**
   * Returns the key of the currently playing music track, or null.
   */
  getCurrentMusicKey(): string | null {
    return this.currentMusicKey;
  }

  // -------------------------------------------------------------------------
  // Volume Control
  // -------------------------------------------------------------------------

  /**
   * Sets the SFX volume from a 0-100 slider value.
   * Updates all future playSfx calls. Does not retroactively
   * change sounds already in flight.
   *
   * @param value - Volume level (0 = silent, 100 = full).
   */
  setSfxVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, value / 100));
  }

  /**
   * Sets the music volume from a 0-100 slider value.
   * Immediately adjusts the currently playing music track volume.
   *
   * @param value - Volume level (0 = silent, 100 = full).
   */
  setMusicVolume(value: number): void {
    this.musicVolume = Math.max(0, Math.min(1, value / 100));

    /* Update the currently playing music track in real time. */
    if (this.currentMusicKey && this.scene.sound) {
      const sound = this.scene.sound.get(this.currentMusicKey);
      if (sound) {
        (sound as Phaser.Sound.WebAudioSound).setVolume(
          this.muted ? 0 : this.musicVolume,
        );
      }
    }
  }

  /**
   * Returns the current SFX volume as a 0-100 integer.
   */
  getSfxVolume(): number {
    return Math.round(this.sfxVolume * 100);
  }

  /**
   * Returns the current music volume as a 0-100 integer.
   */
  getMusicVolume(): number {
    return Math.round(this.musicVolume * 100);
  }

  // -------------------------------------------------------------------------
  // Mute Control
  // -------------------------------------------------------------------------

  /**
   * Toggles mute state. When muted, no sounds play and music volume
   * drops to zero. Volume levels are preserved for restoration on unmute.
   */
  toggleMute(): void {
    this.muted = !this.muted;

    /* Apply mute to the currently playing music track. */
    if (this.currentMusicKey && this.scene.sound) {
      const sound = this.scene.sound.get(this.currentMusicKey);
      if (sound) {
        (sound as Phaser.Sound.WebAudioSound).setVolume(
          this.muted ? 0 : this.musicVolume,
        );
      }
    }
  }

  /**
   * Returns whether audio is currently muted.
   */
  isMuted(): boolean {
    return this.muted;
  }

  // -------------------------------------------------------------------------
  // Settings Sync
  // -------------------------------------------------------------------------

  /**
   * Reads the latest volume settings from the registry and applies them.
   * Called by AudioSystem on each frame so slider changes take effect
   * immediately without requiring a settings-close callback.
   */
  syncFromSettings(): void {
    const settings = this.getSettings();
    const newSfx = settings.sfxVolume / 100;
    const newMusic = settings.musicVolume / 100;

    /* Only update if values actually changed to avoid unnecessary work. */
    if (Math.abs(newSfx - this.sfxVolume) > 0.001) {
      this.sfxVolume = newSfx;
    }

    if (Math.abs(newMusic - this.musicVolume) > 0.001) {
      this.musicVolume = newMusic;

      /* Live-update the music track volume. */
      if (this.currentMusicKey && this.scene.sound) {
        const sound = this.scene.sound.get(this.currentMusicKey);
        if (sound) {
          (sound as Phaser.Sound.WebAudioSound).setVolume(
            this.muted ? 0 : this.musicVolume,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Stops all audio and clears state. Called on scene shutdown.
   */
  destroy(): void {
    if (this.currentMusicKey && this.scene.sound) {
      const sound = this.scene.sound.get(this.currentMusicKey);
      if (sound) sound.destroy();
    }
    this.currentMusicKey = null;
    this.lastPlayTime.clear();
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Checks if a sound passes its rate limit (enough time since last play).
   *
   * @param key - The SFX key to check.
   * @returns True if enough time has elapsed (or no limit applies).
   */
  private passesRateLimit(key: SfxKey): boolean {
    const config: RateLimitConfig | undefined = SFX_RATE_LIMITS[key];
    if (!config || config.minIntervalMs <= 0) return true;

    const lastTime = this.lastPlayTime.get(key) ?? 0;
    const elapsed = Date.now() - lastTime;
    return elapsed >= config.minIntervalMs;
  }

  /**
   * Fades out a music track and stops it after the fade completes.
   *
   * @param key - The music asset key to fade out.
   */
  private fadeOutMusic(key: string): void {
    if (!this.scene.sound) return;

    const sound = this.scene.sound.get(key);
    if (!sound) return;

    if (this.scene.tweens) {
      this.scene.tweens.add({
        targets: sound,
        volume: 0,
        duration: MUSIC_CROSSFADE_DURATION_MS,
        ease: 'Linear',
        onComplete: () => {
          sound.destroy();
        },
      });
    } else {
      sound.destroy();
    }
  }

  /**
   * Reads settings from the Phaser registry with safe defaults.
   *
   * @returns The current settings state.
   */
  private getSettings(): SettingsState {
    const settings = this.scene.registry?.get('gameSettings') as SettingsState | undefined;
    return settings ?? { sfxVolume: 100, musicVolume: 100, reduceVisualIntensity: false };
  }
}
