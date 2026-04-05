/**
 * VFX Manager -- centralized factory for all visual effects.
 *
 * Every VFX in the game goes through this manager. It:
 * - Creates short-lived particle bursts, tween animations, and Graphics VFX
 * - Scales particle counts and lifespans based on the active quality tier
 * - Auto-destroys all VFX objects after their animation completes
 * - Provides a single API surface for enemy, tower, projectile, and upgrade VFX
 *
 * The manager is stateless beyond the quality setting -- it does not track
 * active VFX instances. Each VFX self-destructs via Phaser tween callbacks.
 * This avoids the need for per-frame VFX bookkeeping and prevents memory leaks.
 *
 * Consumed by:
 * - EnemySystem (hit flash, death VFX)
 * - TowerCombatSystem (muzzle flash, shockwave burst)
 * - ProjectileSystem (impact burst, projectile trails)
 * - UpgradeSystem (upgrade shower, glow pulse)
 * - Gameplay scene (wiring, quality setting propagation)
 */
import Phaser from 'phaser';
import {
  type VFXQuality,
  type QualityScaling,
  QUALITY_PRESETS,
  HIT_FLASH_OVERLAY_DURATION_MS,
  HIT_FLASH_OVERLAY_ALPHA,
  DEATH_BURST_BASE_COUNT,
  DEATH_BURST_LIFESPAN_MS,
  DEATH_BURST_SPEED,
  DEATH_FADE_DURATION_MS,
  DEATH_SCALE_TARGET,
  DEATH_BURST_COLORS,
  DEATH_BURST_DEFAULT_COLORS,
  MUZZLE_FLASH_BASE_COUNT,
  MUZZLE_FLASH_LIFESPAN_MS,
  MUZZLE_FLASH_SPREAD,
  MUZZLE_FLASH_COLOR,
  TOWER_RECOIL_SCALE,
  TOWER_RECOIL_DURATION_MS,
  IMPACT_BURST_BASE_COUNT,
  IMPACT_BURST_LIFESPAN_MS,
  IMPACT_BURST_SPEED,
  SHOCKWAVE_RING_DURATION_MS,
  SHOCKWAVE_PARTICLE_BASE_COUNT,
  SHOCKWAVE_PARTICLE_LIFESPAN_MS,
  UPGRADE_SHOWER_BASE_COUNT,
  UPGRADE_PARTICLE_LIFESPAN_MS,
  UPGRADE_GLOW_PULSE_DURATION_MS,
  UPGRADE_GOLD_COLOR,
  UPGRADE_PARTICLE_SPEED,
  SCREEN_SHAKE_INTENSITY,
  SCREEN_SHAKE_DURATION_MS,
  SHIELD_BREAK_BURST_BASE_COUNT,
  SHIELD_BREAK_BURST_LIFESPAN_MS,
  SHIELD_BREAK_BURST_SPEED,
  SHIELD_BREAK_COLORS,
  AURA_EXPIRE_BURST_BASE_COUNT,
  AURA_EXPIRE_BURST_LIFESPAN_MS,
  SUPPORT_AURA_COLOR,
  BOSS_SPAWN_BURST_BASE_COUNT,
  BOSS_SPAWN_BURST_LIFESPAN_MS,
  BOSS_SPAWN_BURST_SPEED,
  BOSS_SPAWN_BURST_COLORS,
  BOSS_DEATH_SHAKE_INTENSITY,
  BOSS_DEATH_SHAKE_DURATION_MS,
  BOSS_SPEED_SURGE_COLOR,
} from './vfx-config';
import { DEPTH_VFX } from '../config/depth-layers';

export class VFXManager {
  /** The Phaser scene this manager creates VFX in. */
  private readonly scene: Phaser.Scene;

  /** Active quality tier scaling factors. */
  private quality: QualityScaling;

  /** Current quality level name -- exposed for settings UI. */
  private qualityLevel: VFXQuality;

  /**
   * @param scene - The Gameplay scene where VFX are rendered.
   * @param quality - Initial quality setting (defaults to 'high').
   */
  constructor(scene: Phaser.Scene, quality: VFXQuality = 'high') {
    this.scene = scene;
    this.qualityLevel = quality;
    this.quality = QUALITY_PRESETS[quality];
  }

  // -------------------------------------------------------------------------
  // Quality control
  // -------------------------------------------------------------------------

  /**
   * Changes the active VFX quality tier. Called by settings panel.
   * Takes effect immediately on the next VFX call.
   *
   * @param level - The new quality tier.
   */
  setQuality(level: VFXQuality): void {
    this.qualityLevel = level;
    this.quality = QUALITY_PRESETS[level];
  }

  /** Returns the current quality level name. */
  getQuality(): VFXQuality {
    return this.qualityLevel;
  }

  /** Returns the current quality scaling factors (for testing). */
  getQualityScaling(): QualityScaling {
    return this.quality;
  }

  // -------------------------------------------------------------------------
  // Hit flash (improved: white overlay that fades instead of simple tint)
  // -------------------------------------------------------------------------

  /**
   * Plays an improved hit flash on an enemy sprite. Creates a white overlay
   * rectangle that fades from HIT_FLASH_OVERLAY_ALPHA to 0 over the
   * duration, giving a smoother and more readable damage feedback than
   * the old full-tint approach.
   *
   * @param sprite - The enemy sprite to flash.
   */
  playHitFlash(sprite: Phaser.GameObjects.Sprite): void {
    /* Create a small white rectangle matching the sprite bounds. */
    const overlay = this.scene.add.rectangle(
      sprite.x,
      sprite.y,
      sprite.displayWidth,
      sprite.displayHeight,
      0xFFFFFF,
      HIT_FLASH_OVERLAY_ALPHA,
    );
    overlay.setDepth(DEPTH_VFX);
    overlay.setOrigin(0.5, 0.5);

    /* Fade out and destroy. */
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: HIT_FLASH_OVERLAY_DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => overlay.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Death VFX (fade + scale-down + particle burst, per-archetype colors)
  // -------------------------------------------------------------------------

  /**
   * Plays a death VFX at the given position with archetype-specific colors.
   * Combines a particle burst with the sprite fade+shrink animation.
   *
   * The sprite fade/shrink is handled by EnemySystem (it owns the sprite).
   * This method only creates the particle burst overlay.
   *
   * @param x - World X position of the dying enemy.
   * @param y - World Y position of the dying enemy.
   * @param archetypeId - EnemyDefinition.id for color lookup.
   */
  playDeathBurst(x: number, y: number, archetypeId: string): void {
    const colors = DEATH_BURST_COLORS[archetypeId] ?? DEATH_BURST_DEFAULT_COLORS;
    const count = this.scaleCount(DEATH_BURST_BASE_COUNT);

    if (count === 0) return;

    /* Create individual particles as small circles, each with a random
     * velocity and color from the archetype palette. */
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length]!;
      const size = 2 + Math.random() * 3;

      const particle = this.scene.add.circle(x, y, size, color, 1);
      particle.setDepth(DEPTH_VFX);

      /* Random direction and speed. */
      const angle = Math.random() * Math.PI * 2;
      const speed = DEATH_BURST_SPEED[0] + Math.random() * (DEATH_BURST_SPEED[1] - DEATH_BURST_SPEED[0]);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const lifespan = this.scaleLifespan(DEATH_BURST_LIFESPAN_MS);

      /* Animate outward movement + fade out. */
      this.scene.tweens.add({
        targets: particle,
        x: x + vx * (lifespan / 1000),
        y: y + vy * (lifespan / 1000),
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  /**
   * Returns the death fade/shrink tween config to be applied to the enemy
   * sprite by EnemySystem. This replaces the old simple alpha-fade.
   *
   * @returns Tween config values for the death animation.
   */
  getDeathTweenConfig(): { duration: number; targetScale: number } {
    return {
      duration: DEATH_FADE_DURATION_MS,
      targetScale: DEATH_SCALE_TARGET,
    };
  }

  // -------------------------------------------------------------------------
  // Muzzle flash (particles + recoil)
  // -------------------------------------------------------------------------

  /**
   * Plays a muzzle flash at the tower's fire point: small bright particles
   * that spray outward briefly.
   *
   * @param x - Tower world X.
   * @param y - Tower world Y.
   */
  playMuzzleFlash(x: number, y: number): void {
    const count = this.scaleCount(MUZZLE_FLASH_BASE_COUNT);

    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const size = 1.5 + Math.random() * 2;
      const particle = this.scene.add.circle(x, y, size, MUZZLE_FLASH_COLOR, 1);
      particle.setDepth(DEPTH_VFX);

      const angle = Math.random() * Math.PI * 2;
      const dist = MUZZLE_FLASH_SPREAD * (0.5 + Math.random() * 0.5);
      const lifespan = this.scaleLifespan(MUZZLE_FLASH_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  /**
   * Plays a subtle recoil animation on the tower sprite: a brief scale
   * pulse that returns to the tower's current scale.
   *
   * @param sprite - The tower sprite to animate.
   */
  playTowerRecoil(sprite: Phaser.GameObjects.Sprite): void {
    /* Store the current scale so we return to it (tower tiers use different scales). */
    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;

    this.scene.tweens.add({
      targets: sprite,
      scaleX: baseScaleX * TOWER_RECOIL_SCALE,
      scaleY: baseScaleY * TOWER_RECOIL_SCALE,
      duration: TOWER_RECOIL_DURATION_MS / 2,
      ease: 'Quad.easeOut',
      yoyo: true,
    });
  }

  // -------------------------------------------------------------------------
  // Impact VFX (particle burst on projectile hit)
  // -------------------------------------------------------------------------

  /**
   * Plays an impact particle burst at the hit position. Color is determined
   * by the projectile type.
   *
   * @param x - Impact world X.
   * @param y - Impact world Y.
   * @param projectileType - 'arrow' or 'missile' (for color selection).
   */
  playImpactBurst(x: number, y: number, projectileType: string): void {
    const isArrow = projectileType === 'arrow';
    const color = isArrow ? 0xFFFF88 : 0xFF6B35;
    const count = this.scaleCount(IMPACT_BURST_BASE_COUNT);

    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const size = 1.5 + Math.random() * 2.5;
      const particle = this.scene.add.circle(x, y, size, color, 1);
      particle.setDepth(DEPTH_VFX);

      const angle = Math.random() * Math.PI * 2;
      const speed = IMPACT_BURST_SPEED[0] + Math.random() * (IMPACT_BURST_SPEED[1] - IMPACT_BURST_SPEED[0]);
      const lifespan = this.scaleLifespan(IMPACT_BURST_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed * (lifespan / 1000),
        y: y + Math.sin(angle) * speed * (lifespan / 1000),
        alpha: 0,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Shockwave burst (expanding ring with particles)
  // -------------------------------------------------------------------------

  /**
   * Plays an improved shockwave burst: an expanding ring plus particles
   * that radiate outward. Replaces the old simple circle expansion.
   *
   * @param x - Tower world X (center of shockwave).
   * @param y - Tower world Y.
   * @param range - Tower's effective range (ring expands to this radius).
   */
  playShockwaveBurst(x: number, y: number, range: number): void {
    /* --- Expanding ring (same as original, but with improved easing) --- */
    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_VFX);

    const progress = { t: 0 };
    this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration: SHOCKWAVE_RING_DURATION_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        gfx.clear();
        const radius = range * progress.t;
        const alpha = 0.8 * (1 - progress.t);
        gfx.lineStyle(2, 0x4AD9B0, alpha);
        gfx.strokeCircle(x, y, radius);
      },
      onComplete: () => gfx.destroy(),
    });

    /* --- Companion particles radiating outward --- */
    const count = this.scaleCount(SHOCKWAVE_PARTICLE_BASE_COUNT);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const size = 2 + Math.random() * 2;
      const particle = this.scene.add.circle(x, y, size, 0x4AD9B0, 0.8);
      particle.setDepth(DEPTH_VFX);

      const lifespan = this.scaleLifespan(SHOCKWAVE_PARTICLE_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * range,
        y: y + Math.sin(angle) * range,
        alpha: 0,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Upgrade VFX (golden particle shower + glow pulse)
  // -------------------------------------------------------------------------

  /**
   * Plays the upgrade celebration VFX: golden particles shower upward
   * from the tower position, plus a brief glow pulse on the sprite.
   *
   * @param sprite - The tower sprite to pulse.
   * @param x - Tower world X.
   * @param y - Tower world Y.
   */
  playUpgradeVFX(sprite: Phaser.GameObjects.Sprite, x: number, y: number): void {
    /* --- Golden particle shower rising upward --- */
    const count = this.scaleCount(UPGRADE_SHOWER_BASE_COUNT);

    for (let i = 0; i < count; i++) {
      const size = 2 + Math.random() * 3;
      const offsetX = (Math.random() - 0.5) * 30;
      const particle = this.scene.add.circle(
        x + offsetX, y, size, UPGRADE_GOLD_COLOR, 1,
      );
      particle.setDepth(DEPTH_VFX);

      const speed = UPGRADE_PARTICLE_SPEED[0] +
        Math.random() * (UPGRADE_PARTICLE_SPEED[1] - UPGRADE_PARTICLE_SPEED[0]);
      const lifespan = this.scaleLifespan(UPGRADE_PARTICLE_LIFESPAN_MS);

      /* Particles float upward and fade. */
      this.scene.tweens.add({
        targets: particle,
        y: y - speed * (lifespan / 1000),
        x: x + offsetX + (Math.random() - 0.5) * 20,
        alpha: 0,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }

    /* --- Glow pulse on the tower sprite --- */
    this.playGlowPulse(sprite);
  }

  /**
   * Plays a brief glow pulse: tint to gold and back, with a subtle
   * scale bump. Used for upgrade feedback.
   *
   * @param sprite - The sprite to pulse.
   */
  private playGlowPulse(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setTint(UPGRADE_GOLD_COLOR);

    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;

    this.scene.tweens.add({
      targets: sprite,
      scaleX: baseScaleX * 1.15,
      scaleY: baseScaleY * 1.15,
      duration: UPGRADE_GLOW_PULSE_DURATION_MS / 2,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        sprite.clearTint();
        /* Restore to exact base scale in case of float drift. */
        sprite.setScale(baseScaleX, baseScaleY);
      },
    });
  }

  // -------------------------------------------------------------------------
  // Projectile trails
  // -------------------------------------------------------------------------

  /**
   * Returns whether trails should be rendered at the current quality.
   * Called by ProjectileSystem to decide whether to emit trail particles.
   */
  areTrailsEnabled(): boolean {
    return this.quality.enableTrails;
  }

  /**
   * Creates a single trail particle at the given position. Called by
   * ProjectileSystem each frame (or at a frequency) for active projectiles.
   *
   * Arrow trails: small fading dots in the projectile's color.
   * Missile trails: smoke-like expanding circles.
   *
   * @param x - Current projectile world X.
   * @param y - Current projectile world Y.
   * @param type - 'arrow' or 'missile'.
   */
  emitTrailParticle(x: number, y: number, type: string): void {
    if (!this.quality.enableTrails) return;

    if (type === 'arrow') {
      this.emitArrowTrail(x, y);
    } else {
      this.emitSmokeTrail(x, y);
    }
  }

  /**
   * Arrow trail: small warm-yellow dot that fades quickly.
   */
  private emitArrowTrail(x: number, y: number): void {
    const dot = this.scene.add.circle(x, y, 1.5, 0xFFFF88, 0.5);
    dot.setDepth(DEPTH_VFX);

    const lifespan = this.scaleLifespan(200);
    this.scene.tweens.add({
      targets: dot,
      alpha: 0,
      duration: lifespan,
      onComplete: () => dot.destroy(),
    });
  }

  /**
   * Missile trail: gray smoke particle that expands and fades.
   */
  private emitSmokeTrail(x: number, y: number): void {
    const smoke = this.scene.add.circle(x, y, 2, 0xAAAAAA, 0.5);
    smoke.setDepth(DEPTH_VFX);

    const lifespan = this.scaleLifespan(350);
    this.scene.tweens.add({
      targets: smoke,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: lifespan,
      ease: 'Quad.easeOut',
      onComplete: () => smoke.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Shield VFX (BOLT-017: break burst + regen fade)
  // -------------------------------------------------------------------------

  /**
   * Plays a shield break particle burst -- cyan shards flying outward.
   * Called when a Shielded enemy's shield HP drops to zero.
   *
   * @param x - World X position of the shield break.
   * @param y - World Y position of the shield break.
   */
  playShieldBreakBurst(x: number, y: number): void {
    const count = this.scaleCount(SHIELD_BREAK_BURST_BASE_COUNT);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const color = SHIELD_BREAK_COLORS[i % SHIELD_BREAK_COLORS.length]!;
      const size = 2 + Math.random() * 3;

      const particle = this.scene.add.circle(x, y, size, color, 1);
      particle.setDepth(DEPTH_VFX);

      const angle = Math.random() * Math.PI * 2;
      const speed = SHIELD_BREAK_BURST_SPEED[0] +
        Math.random() * (SHIELD_BREAK_BURST_SPEED[1] - SHIELD_BREAK_BURST_SPEED[0]);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const lifespan = this.scaleLifespan(SHIELD_BREAK_BURST_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + vx * (lifespan / 1000),
        y: y + vy * (lifespan / 1000),
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  /**
   * Plays the aura expire burst on enemies that lose a Support aura buff.
   * Small green particles radiate briefly from each affected enemy.
   *
   * @param x - World X position of the affected enemy.
   * @param y - World Y position of the affected enemy.
   */
  playAuraExpireBurst(x: number, y: number): void {
    const count = this.scaleCount(AURA_EXPIRE_BURST_BASE_COUNT);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const size = 1.5 + Math.random() * 2;
      const particle = this.scene.add.circle(x, y, size, SUPPORT_AURA_COLOR, 0.8);
      particle.setDepth(DEPTH_VFX);

      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 15;
      const lifespan = this.scaleLifespan(AURA_EXPIRE_BURST_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Screen shake (subtle, for boss damage)
  // -------------------------------------------------------------------------

  /**
   * Applies a subtle screen shake. Only runs on 'high' quality.
   * Called when a boss/elite enemy takes significant damage.
   */
  playScreenShake(): void {
    if (!this.quality.enableScreenShake) return;

    this.scene.cameras.main.shake(
      SCREEN_SHAKE_DURATION_MS,
      SCREEN_SHAKE_INTENSITY / 1000,
    );
  }

  // -------------------------------------------------------------------------
  // Smooth movement interpolation helper
  // -------------------------------------------------------------------------

  /**
   * Smoothly interpolates a sprite's rotation toward a target angle.
   * Uses Phaser.Math.Angle.RotateTo with easing for fluid enemy movement.
   *
   * @param sprite - The sprite to rotate.
   * @param targetAngle - The desired angle in radians.
   * @param lerpSpeed - Interpolation speed in radians per second.
   * @param dt - Delta time in seconds.
   */
  lerpRotation(
    sprite: Phaser.GameObjects.Sprite,
    targetAngle: number,
    lerpSpeed: number,
    dt: number,
  ): void {
    sprite.rotation = Phaser.Math.Angle.RotateTo(
      sprite.rotation,
      targetAngle,
      lerpSpeed * dt,
    );
  }

  // -------------------------------------------------------------------------
  // Boss VFX (BOLT-018: spawn burst, death shake, speed trail)
  // -------------------------------------------------------------------------

  /**
   * Plays a menacing spawn burst when a boss enemy appears.
   * Red/orange particles radiate outward from the spawn position.
   *
   * @param x - World X position of the boss spawn.
   * @param y - World Y position of the boss spawn.
   */
  playBossSpawnBurst(x: number, y: number): void {
    const count = this.scaleCount(BOSS_SPAWN_BURST_BASE_COUNT);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const color = BOSS_SPAWN_BURST_COLORS[i % BOSS_SPAWN_BURST_COLORS.length]!;
      const size = 3 + Math.random() * 4;

      const particle = this.scene.add.circle(x, y, size, color, 1);
      particle.setDepth(DEPTH_VFX);

      const angle = Math.random() * Math.PI * 2;
      const speed = BOSS_SPAWN_BURST_SPEED[0] +
        Math.random() * (BOSS_SPAWN_BURST_SPEED[1] - BOSS_SPAWN_BURST_SPEED[0]);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const lifespan = this.scaleLifespan(BOSS_SPAWN_BURST_LIFESPAN_MS);

      this.scene.tweens.add({
        targets: particle,
        x: x + vx * (lifespan / 1000),
        y: y + vy * (lifespan / 1000),
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: lifespan,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  /**
   * Plays a heavy screen shake for boss death. Stronger than normal shake.
   * Only runs on 'high' and 'medium' quality.
   */
  playBossDeathShake(): void {
    if (!this.quality.enableScreenShake) return;

    this.scene.cameras.main.shake(
      BOSS_DEATH_SHAKE_DURATION_MS,
      BOSS_DEATH_SHAKE_INTENSITY / 1000,
    );
  }

  /**
   * Plays a speed trail particle behind a surging boss.
   * Red afterimage dots that fade quickly.
   *
   * @param x - Current boss world X.
   * @param y - Current boss world Y.
   */
  playBossSpeedTrail(x: number, y: number): void {
    if (!this.quality.enableTrails) return;

    const dot = this.scene.add.circle(x, y, 3, BOSS_SPEED_SURGE_COLOR, 0.6);
    dot.setDepth(DEPTH_VFX);

    const lifespan = this.scaleLifespan(300);
    this.scene.tweens.add({
      targets: dot,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: lifespan,
      ease: 'Quad.easeOut',
      onComplete: () => dot.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // BOLT-026: Capstone VFX
  // -------------------------------------------------------------------------

  /**
   * Plays the aftershock damage zone VFX: an orange-red filled circle that
   * fades from 0.3 alpha to 0 over the given duration. Visually distinct
   * from the teal shockwave burst.
   *
   * @param x - World X center of the zone (tower position).
   * @param y - World Y center of the zone.
   * @param radius - Zone radius in pixels.
   * @param duration - Zone VFX duration in milliseconds.
   */
  playAftershockZone(x: number, y: number, radius: number, duration: number): void {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_VFX);

    /* Orange-red filled circle. */
    gfx.fillStyle(0xFF6B35, 0.3);
    gfx.fillCircle(x, y, radius);

    /* Fade out over duration then destroy. */
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration,
      ease: 'Linear',
      onComplete: () => gfx.destroy(),
    });
  }

  /**
   * Plays the flak field AoE burst VFX: an expanding orange ring at the
   * missile impact position.
   *
   * @param x - World X of the impact point.
   * @param y - World Y of the impact point.
   * @param radius - Maximum ring radius in pixels.
   */
  playFlakBurst(x: number, y: number, radius: number): void {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_VFX);

    const progress = { t: 0 };
    this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration: 200,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        gfx.clear();
        const currentRadius = radius * progress.t;
        const currentAlpha = 0.8 * (1 - progress.t);
        gfx.lineStyle(2, 0xFF6B35, currentAlpha);
        gfx.strokeCircle(x, y, currentRadius);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Scales a base particle count by the quality multiplier and floors it.
   * Returns 0 if the scaled count rounds to zero (low quality + small base).
   */
  private scaleCount(base: number): number {
    return Math.max(0, Math.floor(base * this.quality.particleMultiplier));
  }

  /**
   * Scales a lifespan duration by the quality multiplier.
   * Shorter lifespans = fewer concurrent objects = better performance.
   */
  private scaleLifespan(base: number): number {
    return Math.floor(base * this.quality.lifespanMultiplier);
  }

  /**
   * Cleans up the manager. Currently a no-op since VFX are self-destructing,
   * but exists for the system lifecycle pattern consistency.
   */
  destroy(): void {
    /* No persistent state to clean up -- all VFX self-destruct via tweens. */
  }
}
