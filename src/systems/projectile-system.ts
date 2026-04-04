/**
 * Projectile system -- per-frame movement, collision, and pool lifecycle.
 *
 * Manages all active projectiles in flight. Each frame:
 * 1. Updates each projectile's position (homing toward target).
 * 2. Checks for arrival (distance < movement threshold).
 * 3. On arrival: applies damage (if target alive), emits ENEMY_HIT,
 *    plays impact VFX, and releases the sprite to the pool.
 * 4. Handles orphaned projectiles (target died mid-flight): continues to
 *    last known position, plays VFX, deals no damage, and releases.
 *
 * Priority 4 in system-order.ts -- runs after TowerCombatSystem so newly
 * fired projectiles begin moving in the same frame they were created.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { Projectile } from '../entities/projectile';
import type { GameState } from '../types/game-types';
import { GAME_EVENTS } from '../types/game-types';
import type { EnemyHitPayload } from '../types/events';
import type { PoolManager } from '../utils/pool-manager';
import type { EnemySystem } from './enemy-system';
import { DEPTH_PROJECTILES, DEPTH_VFX } from '../config/depth-layers';
import type { VFXManager } from '../vfx/vfx-manager';
import { TRAIL_ARROW_FREQUENCY, TRAIL_MISSILE_FREQUENCY } from '../vfx/vfx-config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Impact flash VFX duration in milliseconds. */
const IMPACT_FLASH_DURATION_MS = 100;

/** Impact flash radii per projectile type. */
const IMPACT_RADIUS_ARROW = 6;
const IMPACT_RADIUS_MISSILE = 8;

/** Impact flash colors per projectile type. */
const COLOR_IMPACT_ARROW = 0xFFFF88;
const COLOR_IMPACT_MISSILE = 0xFF6B35;

/**
 * Distance threshold (squared) for considering a projectile as "arrived".
 * Using squared to avoid sqrt each frame. 4px threshold (16 squared).
 */
const ARRIVAL_THRESHOLD_SQ = 16;

export class ProjectileSystem extends BaseSystem {
  private readonly poolManager: PoolManager;

  /** All projectiles currently in flight. */
  private readonly activeProjectiles: Projectile[] = [];

  /** Reference to EnemySystem for target lookups and damage. */
  private enemySystem!: EnemySystem;

  /** Whether new projectiles should still be processed (false after GAME_OVER
   * means no new damage, but in-flight projectiles still complete travel). */
  private combatActive = true;

  /** VFX manager for impact bursts and projectile trails. BOLT-014. */
  private vfxManager: VFXManager | null = null;

  /**
   * Per-projectile trail timers. Tracks milliseconds since last trail
   * particle was emitted for each projectile (keyed by array index).
   * BOLT-014.
   */
  private trailTimers: Map<Phaser.GameObjects.Sprite, number> = new Map();

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Shared per-run game state.
   * @param poolManager - Projectile sprite pool for acquire/release.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    poolManager: PoolManager,
  ) {
    super(scene, gameState);
    this.poolManager = poolManager;
  }

  /**
   * Resolves cross-system references and sets up event listeners.
   */
  init(): void {
    this.enemySystem = this.scene.registry.get('enemySystem') as EnemySystem;
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);

    /* BOLT-014: Resolve VFX manager for impact bursts and trails. */
    this.vfxManager = (this.scene.registry.get('vfxManager') as VFXManager) ?? null;
  }

  /**
   * Per-frame update: moves all active projectiles, checks for arrival,
   * applies damage and VFX on hit, and releases completed projectiles.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    /* Process in reverse for safe removal during iteration. */
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i]!;

      /* Update target position if the target is still alive. */
      if (!proj.isOrphaned) {
        const enemy = this.enemySystem.getEnemyById(proj.targetId);
        if (enemy) {
          const pos = enemy.getPosition();
          proj.targetLastPosition.x = pos.x;
          proj.targetLastPosition.y = pos.y;
        } else {
          /* Target died -- mark orphaned, continue to last known position. */
          proj.isOrphaned = true;
        }
      }

      /* Move toward target (homing). */
      const dx = proj.targetLastPosition.x - proj.sprite.x;
      const dy = proj.targetLastPosition.y - proj.sprite.y;
      const distSq = dx * dx + dy * dy;
      const moveDistance = proj.speed * dt;

      /* Rotate sprite to face direction of travel. */
      proj.sprite.rotation = Math.atan2(dy, dx);

      /* Check arrival: either within threshold or would overshoot this frame. */
      if (distSq <= ARRIVAL_THRESHOLD_SQ || moveDistance * moveDistance >= distSq) {
        /* Arrived at destination. */
        this.handleProjectileArrival(proj);
        this.trailTimers.delete(proj.sprite);
        this.activeProjectiles.splice(i, 1);
      } else {
        /* Move toward target. */
        const dist = Math.sqrt(distSq);
        const ratio = moveDistance / dist;
        proj.sprite.x += dx * ratio;
        proj.sprite.y += dy * ratio;

        /* BOLT-014: Emit trail particles at configured frequency. */
        this.emitTrailIfDue(proj, delta);
      }
    }
  }

  /**
   * Cleans up all active projectiles and releases sprites to pool.
   */
  destroy(): void {
    for (const proj of this.activeProjectiles) {
      this.resetSpriteForPool(proj.sprite);
      this.poolManager.releaseProjectile(proj.sprite);
    }
    this.activeProjectiles.length = 0;
    this.trailTimers.clear();
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API (called by TowerCombatSystem)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new projectile and adds it to the active list.
   * Returns null if the projectile pool is exhausted (AC-014).
   *
   * @param spriteKey - Texture key for the projectile sprite.
   * @param x - Spawn world X (tower position).
   * @param y - Spawn world Y (tower position).
   * @param targetId - Enemy instance ID to home toward.
   * @param targetPosition - Current world position of the target.
   * @param speed - Pixels per second.
   * @param damage - Raw damage to apply on hit.
   * @param damageType - Damage type key.
   * @param towerType - TowerDefinition.id for event payloads.
   * @param projectileType - ProjectileDefinition.id for event payloads.
   * @returns The created Projectile, or null if pool exhausted.
   */
  spawnProjectile(
    spriteKey: string,
    x: number,
    y: number,
    targetId: string,
    targetPosition: { x: number; y: number },
    speed: number,
    damage: number,
    damageType: string,
    towerType: string,
    projectileType: string,
  ): Projectile | null {
    const sprite = this.poolManager.acquireProjectile(spriteKey, x, y);
    if (!sprite) {
      /* Pool exhausted (AC-014). PoolManager already logs the warning. */
      return null;
    }

    sprite.setDepth(DEPTH_PROJECTILES);
    sprite.setOrigin(0.5, 0.5);

    /* Rotate to face target immediately. */
    const angle = Math.atan2(targetPosition.y - y, targetPosition.x - x);
    sprite.setRotation(angle);

    const proj = new Projectile(
      sprite,
      targetId,
      targetPosition,
      speed,
      damage,
      damageType,
      towerType,
      projectileType,
    );

    this.activeProjectiles.push(proj);
    return proj;
  }

  // ---------------------------------------------------------------------------
  // Private -- arrival handling
  // ---------------------------------------------------------------------------

  /**
   * Handles a projectile arriving at its destination.
   * If the target is alive: applies damage, emits ENEMY_HIT.
   * If orphaned: no damage dealt.
   * In both cases: plays impact VFX and releases sprite to pool.
   */
  private handleProjectileArrival(proj: Projectile): void {
    const impactX = proj.targetLastPosition.x;
    const impactY = proj.targetLastPosition.y;

    /* Apply damage only if target is still alive and combat is active. */
    if (!proj.isOrphaned && this.combatActive) {
      const enemy = this.enemySystem.getEnemyById(proj.targetId);
      if (enemy) {
        this.enemySystem.applyDamageToEnemy(
          proj.targetId, proj.damage, proj.damageType,
        );

        /* Emit ENEMY_HIT event. */
        const hitPayload: EnemyHitPayload = {
          enemyId: proj.targetId,
          projectileType: proj.projectileType,
          damage: proj.damage,
          position: { x: impactX, y: impactY },
        };
        this.emit(GAME_EVENTS.ENEMY_HIT, hitPayload);
      }
    }

    /* Play impact VFX regardless of damage (even on orphaned arrival). */
    this.playImpactFlash(impactX, impactY, proj.projectileType);

    /* Release sprite to pool. */
    this.resetSpriteForPool(proj.sprite);
    this.poolManager.releaseProjectile(proj.sprite);
  }

  // ---------------------------------------------------------------------------
  // Private -- Impact VFX
  // ---------------------------------------------------------------------------

  /**
   * Plays impact VFX at the hit position.
   * BOLT-014: Delegates to VFXManager for particle burst impact.
   * Falls back to simple circle flash if VFXManager is unavailable.
   */
  private playImpactFlash(x: number, y: number, projectileType: string): void {
    if (this.vfxManager) {
      /* BOLT-014: Particle burst impact via VFXManager. */
      this.vfxManager.playImpactBurst(x, y, projectileType);
      return;
    }

    /* Fallback: simple circle flash (original behavior). */
    const isArrow = projectileType === 'arrow';
    const radius = isArrow ? IMPACT_RADIUS_ARROW : IMPACT_RADIUS_MISSILE;
    const color = isArrow ? COLOR_IMPACT_ARROW : COLOR_IMPACT_MISSILE;

    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_VFX);
    gfx.fillStyle(color, 1.0);
    gfx.fillCircle(x, y, radius);

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: IMPACT_FLASH_DURATION_MS,
      onComplete: () => gfx.destroy(),
    });
  }

  // ---------------------------------------------------------------------------
  // Private -- Projectile Trails (BOLT-014)
  // ---------------------------------------------------------------------------

  /**
   * Emits a trail particle for the given projectile if enough time has
   * elapsed since the last emission. Uses per-projectile trail timers.
   *
   * Arrow trails emit every TRAIL_ARROW_FREQUENCY ms.
   * Missile trails emit every TRAIL_MISSILE_FREQUENCY ms.
   */
  private emitTrailIfDue(proj: Projectile, delta: number): void {
    if (!this.vfxManager || !this.vfxManager.areTrailsEnabled()) return;

    const elapsed = (this.trailTimers.get(proj.sprite) ?? 0) + delta;
    const frequency = proj.projectileType === 'arrow'
      ? TRAIL_ARROW_FREQUENCY
      : TRAIL_MISSILE_FREQUENCY;

    if (elapsed >= frequency) {
      this.vfxManager.emitTrailParticle(
        proj.sprite.x, proj.sprite.y, proj.projectileType,
      );
      this.trailTimers.set(proj.sprite, 0);
    } else {
      this.trailTimers.set(proj.sprite, elapsed);
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- helpers
  // ---------------------------------------------------------------------------

  /**
   * Resets sprite properties before returning it to the pool.
   * Matches the pattern from EnemySystem.resetSpriteForPool().
   */
  private resetSpriteForPool(sprite: Phaser.GameObjects.Sprite): void {
    sprite.clearTint();
    sprite.setAlpha(1);
    sprite.setScale(1);
    sprite.setRotation(0);
  }

  /**
   * Halts damage application on new arrivals after GAME_OVER.
   * In-flight projectiles still complete their travel and release to pool.
   */
  private onGameOver(): void {
    this.combatActive = false;
  }
}
