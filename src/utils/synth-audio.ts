/**
 * SynthAudio -- procedural sound generator using Web Audio API.
 *
 * Replaces the broken placeholder .ogg files with runtime-generated SFX.
 * Each sound is synthesized from OscillatorNode + GainNode chains,
 * producing distinctive game audio without any file dependencies.
 *
 * Design decisions:
 * - Single AudioContext shared across all sounds (browser limit is ~6).
 * - Master gain node for global volume and mute control.
 * - Each play*() method creates short-lived oscillator/gain nodes that
 *   self-disconnect after their envelope completes (no manual cleanup).
 * - No audio files loaded -- eliminates the 54 console decode errors from
 *   the placeholder .ogg stubs.
 *
 * Volume integration:
 * - Reads 'gameSettings' from the Phaser registry on each play call
 *   so slider changes take effect immediately.
 * - Master gain supports mute/unmute without losing the volume level.
 */

/** Settings shape stored on the Phaser registry by MainMenu (BOLT-009). */
interface SettingsState {
  sfxVolume: number;
  musicVolume: number;
  reduceVisualIntensity: boolean;
}

/**
 * Registry-like interface for reading game settings.
 * Avoids importing Phaser just for the registry type.
 */
interface RegistryAccess {
  get(key: string): unknown;
}

export class SynthAudio {
  /** The shared Web Audio API context. Created lazily on first play. */
  private ctx: AudioContext | null = null;

  /** Master gain node -- controls global volume and mute. */
  private masterGain: GainNode | null = null;

  /** Whether audio output is muted. Volume level is preserved for unmute. */
  private muted = false;

  /** Current SFX volume (0.0 - 1.0). Derived from settings sfxVolume / 100. */
  private volume = 1.0;

  /** Optional registry for reading game settings (volume sliders). */
  private registry: RegistryAccess | null = null;

  /**
   * Initializes the synth with an optional Phaser registry reference.
   * The registry is used to read gameSettings for volume sync.
   *
   * @param registry - Phaser registry or any object with a get(key) method.
   */
  constructor(registry?: RegistryAccess) {
    this.registry = registry ?? null;
    this.syncVolume();
  }

  // ---------------------------------------------------------------------------
  // Audio Context Management
  // ---------------------------------------------------------------------------

  /**
   * Ensures the AudioContext and master gain node exist.
   * Called lazily on first sound play to comply with browser autoplay
   * policies (AudioContext must be created after user gesture).
   *
   * @returns The AudioContext, or null if Web Audio is unavailable.
   */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;

    try {
      /* globalThis.AudioContext covers modern browsers; the webkitAudioContext
       * fallback handles older Safari versions. */
      const AudioCtx = globalThis.AudioContext
        || (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.applyVolume();
      return this.ctx;
    } catch {
      /* Graceful fallback: no audio in environments without Web Audio. */
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Volume & Mute
  // ---------------------------------------------------------------------------

  /**
   * Reads the current SFX volume from the Phaser registry settings.
   * Called before each sound play so slider changes are immediate.
   */
  syncVolume(): void {
    if (!this.registry) return;
    const settings = this.registry.get('gameSettings') as SettingsState | undefined;
    if (settings) {
      this.volume = Math.max(0, Math.min(1, settings.sfxVolume / 100));
    }
    this.applyVolume();
  }

  /**
   * Sets the SFX volume directly (0.0 - 1.0).
   *
   * @param vol - Volume level.
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolume();
  }

  /**
   * Returns the current volume (0.0 - 1.0).
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Toggles mute state. Muting sets master gain to 0; unmuting restores it.
   */
  toggleMute(): void {
    this.muted = !this.muted;
    this.applyVolume();
  }

  /**
   * Returns whether audio is currently muted.
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Applies the current volume and mute state to the master gain node.
   */
  private applyVolume(): void {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Closes the AudioContext and releases resources.
   * Called on scene shutdown.
   */
  destroy(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => { /* ignore close errors */ });
      this.ctx = null;
      this.masterGain = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Tower Fire SFX
  // ---------------------------------------------------------------------------

  /**
   * Arrow/ranged tower fire -- short high pluck.
   * 200Hz to 800Hz frequency sweep over 80ms with sharp attack.
   */
  playArrowFire(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Sniper/focused tower fire -- sharp crack.
   * White noise burst over 50ms for a percussive snap.
   */
  playSniperFire(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    /* Fill with white noise. */
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  /**
   * Shockwave/broadcast tower fire -- low boom.
   * 80Hz sine wave over 200ms with slow decay for bass impact.
   */
  playShockwaveFire(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Missile/antiair tower fire -- rising whoosh.
   * 200Hz to 1200Hz sweep over 150ms for an ascending launch sound.
   */
  playMissileFire(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // ---------------------------------------------------------------------------
  // Combat Feedback SFX
  // ---------------------------------------------------------------------------

  /**
   * Enemy hit -- soft thud.
   * 150Hz sine over 60ms for a muted impact feel.
   */
  playEnemyHit(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Enemy died -- descending pop.
   * 400Hz to 100Hz over 120ms for a deflating pop sound.
   */
  playEnemyDied(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // ---------------------------------------------------------------------------
  // Tower Lifecycle SFX
  // ---------------------------------------------------------------------------

  /**
   * Tower placed -- placement click.
   * 1000Hz tick over 30ms for a crisp confirmation.
   */
  playTowerPlaced(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Tower upgraded -- ascending chime.
   * Three-note ascending sequence (400Hz, 800Hz, 1200Hz) over 200ms.
   */
  playTowerUpgraded(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const notes = [400, 800, 1200];
    const noteLen = 0.066; // ~66ms per note, 200ms total

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * noteLen;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + noteLen);
    }
  }

  /**
   * Tower removed/sold -- descending whomp.
   * 300Hz to 80Hz over 150ms for a falling-away sound.
   */
  playTowerRemoved(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // ---------------------------------------------------------------------------
  // Wave Progression SFX
  // ---------------------------------------------------------------------------

  /**
   * Wave started -- horn/alarm.
   * 440Hz square wave over 300ms for an alert tone.
   */
  playWaveStarted(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);

    /* Two-pulse alarm effect: short gap in the middle. */
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0.0, now + 0.12);
    gain.gain.setValueAtTime(0.2, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Wave completed -- success chime.
   * C-E-G arpeggio (523Hz, 659Hz, 784Hz) over 400ms.
   */
  playWaveCompleted(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    /* C5, E5, G5 -- major triad arpeggio. */
    const notes = [523.25, 659.25, 783.99];
    const noteLen = 0.133; // ~133ms per note, 400ms total

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * noteLen;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + noteLen);
    }
  }

  // ---------------------------------------------------------------------------
  // Game Outcome SFX
  // ---------------------------------------------------------------------------

  /**
   * Victory -- triumphant fanfare.
   * Ascending major arpeggio (C-E-G-C) over 800ms.
   */
  playVictory(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    /* C5, E5, G5, C6 -- ascending major chord. */
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteLen = 0.2;

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * noteLen;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, start);

      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + noteLen);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + noteLen);
    }
  }

  /**
   * Defeat -- descending minor chord.
   * Descending minor intervals over 400ms for a somber tone.
   */
  playDefeat(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    /* Eb5, C5, Ab4, F4 -- descending minor feel. */
    const notes = [622.25, 523.25, 415.30, 349.23];
    const noteLen = 0.1;

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * noteLen;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, start);

      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + noteLen);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + noteLen);
    }
  }

  // ---------------------------------------------------------------------------
  // Economy & UI SFX
  // ---------------------------------------------------------------------------

  /**
   * Currency gain -- coin clink.
   * 2000Hz tick over 40ms for a bright metallic ping.
   */
  playCurrencyGain(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.04);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /**
   * UI click -- soft click.
   * 800Hz over 20ms for a subtle interface feedback sound.
   */
  playUIClick(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Low HP alert -- warning beep.
   * 880Hz square wave over 100ms with a sharp attack for urgency.
   */
  playLowHPAlert(): void {
    this.syncVolume();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);

    /* Two short beeps for alarm urgency. */
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0.0, now + 0.04);
    gain.gain.setValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}
