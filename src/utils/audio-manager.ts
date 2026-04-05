/**
 * AudioManager -- centralized audio playback and volume control.
 *
 * Provides:
 * - SFX playback via Web Audio API synthesizer (SynthAudio)
 * - SFX rate limiting to prevent audio spam from rapid game events
 * - Music crossfade for smooth track transitions (still via Phaser)
 * - Mute/unmute that preserves volume levels
 * - Integration with the settings panel volume sliders (registry-based)
 *
 * BUG FIX: Replaced Phaser audio loading for SFX with procedural
 * synthesis. The 18 placeholder .ogg files were 58-byte stubs that
 * browsers couldn't decode, causing 54 console errors per page load.
 * SynthAudio generates all game sounds at runtime via OscillatorNode
 * and GainNode, eliminating the need for audio files entirely.
 *
 * Music still uses Phaser's sound manager for crossfade support,
 * but gracefully handles missing music assets (no files loaded).
 *
 * This class does NOT listen to game events directly. The AudioSystem
 * (a BaseSystem subclass) handles event subscriptions and calls
 * AudioManager methods. This separation keeps AudioManager testable
 * without needing the full Phaser event emitter.
 *
 * BOLT-015 implementation (updated: synth audio fix).
 */
import Phaser from 'phaser';
import type { SfxKey, MusicKey, RateLimitConfig } from '../config/audio-config';
import {
  SFX_KEYS,
  SFX_RATE_LIMITS,
  SFX_VOLUME_MULTIPLIERS,
  MUSIC_CROSSFADE_DURATION_MS,
} from '../config/audio-config';
import { SynthAudio } from './synth-audio';

/** Settings shape stored on the Phaser registry by MainMenu (BOLT-009). */
interface SettingsState {
  sfxVolume: number;
  musicVolume: number;
  reduceVisualIntensity: boolean;
}

/**
 * Maps SFX key strings to SynthAudio play method names.
 * This is the bridge between the existing SFX_KEYS constants and
 * the synthesizer's named methods. Tower fire keys map based on
 * tower class sound profile.
 */
type SynthPlayMethod = (synth: SynthAudio) => void;

const SFX_TO_SYNTH: Record<string, SynthPlayMethod> = {
  [SFX_KEYS.TOWER_FIRE_RANGED]: (s) => s.playArrowFire(),
  [SFX_KEYS.TOWER_FIRE_FOCUSED]: (s) => s.playSniperFire(),
  [SFX_KEYS.TOWER_FIRE_BROADCAST]: (s) => s.playShockwaveFire(),
  [SFX_KEYS.TOWER_FIRE_ANTIAIR]: (s) => s.playMissileFire(),
  [SFX_KEYS.ENEMY_HIT]: (s) => s.playEnemyHit(),
  [SFX_KEYS.ENEMY_DIED]: (s) => s.playEnemyDied(),
  [SFX_KEYS.TOWER_PLACED]: (s) => s.playTowerPlaced(),
  [SFX_KEYS.TOWER_UPGRADED]: (s) => s.playTowerUpgraded(),
  [SFX_KEYS.TOWER_REMOVED]: (s) => s.playTowerRemoved(),
  [SFX_KEYS.WAVE_STARTED]: (s) => s.playWaveStarted(),
  [SFX_KEYS.WAVE_COMPLETED]: (s) => s.playWaveCompleted(),
  [SFX_KEYS.GAME_VICTORY]: (s) => s.playVictory(),
  [SFX_KEYS.GAME_DEFEAT]: (s) => s.playDefeat(),
  [SFX_KEYS.CURRENCY_GAIN]: (s) => s.playCurrencyGain(),
  [SFX_KEYS.UI_CLICK]: (s) => s.playUIClick(),
  [SFX_KEYS.LOW_HP_ALERT]: (s) => s.playLowHPAlert(),
};

export class AudioManager {
  /** Reference to the Phaser scene for music playback and registry. */
  private readonly scene: Phaser.Scene;

  /** Procedural sound synthesizer for all SFX. */
  private readonly synth: SynthAudio;

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

  /** Phaser sound manager for playing loaded MP3/OGG files. */
  private soundManager: Phaser.Sound.BaseSoundManager | null = null;

  /**
   * Creates the AudioManager, initializes the SynthAudio engine,
   * and reads initial volume from settings.
   *
   * @param scene - The Phaser scene providing the sound manager.
   */
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.soundManager = scene.sound ?? null;

    /* Read initial volume from registry settings (set by MainMenu). */
    const settings = this.getSettings();
    this.sfxVolume = settings.sfxVolume / 100;
    this.musicVolume = settings.musicVolume / 100;

    /* Initialize the synthesizer with registry access for volume sync. */
    this.synth = new SynthAudio(scene.registry);
    this.synth.setVolume(this.sfxVolume);
  }

  // -------------------------------------------------------------------------
  // SFX Playback
  // -------------------------------------------------------------------------

  /**
   * Plays a sound effect by key, respecting volume and rate limiting.
   *
   * Routes the SFX key to the appropriate SynthAudio play method.
   * The effective volume is applied to the synth's master gain before
   * the sound plays. Per-SFX volume multipliers scale the synth volume.
   *
   * @param key - The SFX asset key (from SFX_KEYS).
   * @returns True if the sound was played, false if skipped (muted or rate-limited).
   */
  playSfx(key: SfxKey): boolean {
    if (this.muted || this.sfxVolume <= 0) return false;

    /* Check rate limit before playing. */
    if (!this.passesRateLimit(key)) return false;

    /* Calculate effective volume: global * per-sound multiplier. */
    const perSfxMult = SFX_VOLUME_MULTIPLIERS[key] ?? 1.0;
    const effectiveVolume = this.sfxVolume * perSfxMult;

    /* Try Phaser-loaded audio first (real MP3/OGG files). */
    if (this.soundManager && this.soundManager.get(key)) {
      try {
        this.soundManager.play(key, { volume: effectiveVolume });
        this.lastPlayTime.set(key, Date.now());
        return true;
      } catch {
        /* Fall through to synth on Phaser audio failure. */
      }
    }

    /* Fallback: route to the Web Audio API synthesizer. */
    const synthFn = SFX_TO_SYNTH[key];
    if (!synthFn) return false;

    try {
      this.synth.setVolume(effectiveVolume);
      synthFn(this.synth);
      this.lastPlayTime.set(key, Date.now());
      return true;
    } catch {
      /* Graceful degradation: synthesis failure should not crash the game. */
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Music Playback
  // -------------------------------------------------------------------------

  /**
   * Starts playing background music, crossfading from any current track.
   *
   * Music still uses Phaser's sound manager (if available) for loop and
   * crossfade support. With audio files removed, this gracefully no-ops
   * when the audio cache is empty.
   *
   * @param key - The music asset key.
   */
  playMusic(key: MusicKey): void {
    if (this.currentMusicKey === key) return;
    if (!this.scene.sound || !this.scene.cache?.audio?.exists(key)) return;

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
   * Updates both the internal volume and the synth's master gain.
   *
   * @param value - Volume level (0 = silent, 100 = full).
   */
  setSfxVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, value / 100));
    this.synth.setVolume(this.sfxVolume);
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
   * Synth mute state is synchronized.
   */
  toggleMute(): void {
    this.muted = !this.muted;

    /* Sync mute to the synth engine. The synth tracks its own mute
     * independently, so we toggle it to match AudioManager state. */
    if (this.muted !== this.synth.isMuted()) {
      this.synth.toggleMute();
    }

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
      this.synth.setVolume(newSfx);
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
   * Destroys both the synth engine and any Phaser music sounds.
   */
  destroy(): void {
    /* Clean up the synthesizer's AudioContext. */
    this.synth.destroy();

    /* Clean up Phaser music if playing. */
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
