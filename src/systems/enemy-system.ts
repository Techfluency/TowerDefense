/**
 * Enemy system -- manages all active enemies on the field.
 *
 * Responsibilities:
 * - Spawning enemies via spawnEnemy() (called by BOLT-004 Wave System)
 * - Per-frame waypoint-following movement for all active enemies
 * - Smooth sprite rotation toward direction of travel (BOLT-014: lerped)
 * - Hit flash via VFXManager (BOLT-014: white overlay that fades)
 * - Death handling: fade+shrink+particle burst, emit ENEMY_DIED, release to pool
 * - Breakthrough handling: emit ENEMY_REACHED_OBJECTIVE, release to pool
 * - Health bar rendering via shared Graphics object
 * - Wave scaling function for stat multipliers
 *
 * Downstream consumers:
 * - BOLT-004 calls spawnEnemy() and getWaveScaling()
 * - BOLT-006 calls getActiveEnemies(), getEnemyById(), reads enemy.isFlying
 * - BOLT-008 listens for ENEMY_DIED event
 * - BOLT-009 listens for ENEMY_REACHED_OBJECTIVE event
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { Enemy, EnemyState } from '../entities/enemy';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, GridPoint } from '../types/game-types';
import type {
  EnemyDiedPayload,
  EnemyReachedObjectivePayload,
  EnemySpawnedPayload,
  EnemyShieldBrokenPayload,
  EnemyShieldRegeneratedPayload,
} from '../types/events';
import type { PoolManager } from '../utils/pool-manager';
import type { ConfigManager } from '../utils/config-manager';
import type { MapData } from '../data/map-data';
import { generateId } from '../utils/id-generator';
import {
  DEPTH_ENEMY_GROUND,
  DEPTH_ENEMY_FLYING,
  DEPTH_HEALTH_BARS,
} from '../config/depth-layers';
import type { VFXManager } from '../vfx/vfx-manager';
import {
  ENEMY_ROTATION_LERP_SPEED,
  SHIELD_BAR_COLOR,
  SHIELD_BAR_HEIGHT,
  SHIELD_BAR_Y_OFFSET,
} from '../vfx/vfx-config';

/** Health bar height in pixels. */
const HEALTH_BAR_HEIGHT = 4;

/** Health bar vertical offset above sprite center (negative = above). */
const HEALTH_BAR_Y_OFFSET = 6;

/** Health bar color thresholds and colors. */
const HEALTH_BAR_COLORS = {
  high: 0x4AFF4A,     // Green -- HP > 50%
  mid: 0xFFD700,      // Yellow -- HP 25-50%
  low: 0xFF4A4A,      // Red -- HP < 25%
  background: 0x333333, // Dark gray background
};

/**
 * Wave scaling constants.
 * BOLT-020: maxHpMultiplier raised from 5.0 to 999 and maxSpeedMultiplier
 * raised from 2.0 to 3.0 so the same formula works for endless mode
 * without hitting caps before wave ~30. Campaign balance is unchanged
 * because wave 20 only reaches hpMultiplier=3.85 and speedMultiplier=1.57.
 */
const WAVE_SCALING = {
  hpPerWave: 0.15,
  speedPerWave: 0.03,
  maxHpMultiplier: 999,
  maxSpeedMultiplier: 3.0,
};

export class EnemySystem extends BaseSystem {
  /** Object pool for enemy sprites. */
  private readonly poolManager: PoolManager;

  /** Config access for enemy definitions. */
  private readonly configManager: ConfigManager;

  /** All currently active (alive, dying) enemy instances. */
  private readonly activeEnemies: Enemy[] = [];

  /** Cached path waypoints from MapData. Set when MAP_READY fires. */
  private waypoints: GridPoint[] = [];

  /** Shared Graphics object for drawing all health bars in one batch. */
  private healthBarGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Whether map data has been loaded (waypoints available). */
  private mapReady = false;

  /** VFX manager for hit flash, death burst, smooth rotation. BOLT-014. */
  private vfxManager: VFXManager | null = null;

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Shared per-run game state.
   * @param poolManager - Enemy sprite pool.
   * @param configManager - Enemy definition access.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    poolManager: PoolManager,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.poolManager = poolManager;
    this.configManager = configManager;
  }

  /**
   * Initializes event listeners and the shared health bar Graphics object.
   * Called after all systems are constructed.
   */
  init(): void {
    /* Listen for map generation completion to cache waypoints. */
    this.listen(GAME_EVENTS.MAP_READY, this.onMapReady as (...args: never[]) => void);

    /* Resolve VFX manager from registry (BOLT-014). */
    this.vfxManager = (this.scene.registry.get('vfxManager') as VFXManager) ?? null;

    /* Create the shared Graphics for health bars -- one object, redrawn every frame. */
    this.healthBarGraphics = this.scene.add.graphics();
    this.healthBarGraphics.setDepth(DEPTH_HEALTH_BARS);

    /* Also check if mapData is already on the registry (init order defense). */
    const existingMapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (existingMapData) {
      this.waypoints = existingMapData.getWaypoints();
      this.mapReady = true;
    }
  }

  /**
   * Per-frame update: moves all active enemies, handles state transitions,
   * processes shield regen timers, applies support aura buffs, and redraws
   * health/shield bars.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    if (!this.mapReady) return;

    const dt = delta / 1000;

    /* Process enemies in reverse so we can safely remove from the array. */
    for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
      const enemy = this.activeEnemies[i]!;

      switch (enemy.state) {
        case EnemyState.MOVING:
          this.updateMovement(enemy, delta);
          this.updateShieldRegen(enemy, dt);
          break;

        case EnemyState.DYING:
          /* Death tween is managed by Phaser -- nothing to do here per frame. */
          break;

        case EnemyState.DEAD:
        case EnemyState.BREAKTHROUGH:
          /* Terminal states: remove from active list.
           * Pool release happens in handleDeath/handleBreakthrough. */
          this.activeEnemies.splice(i, 1);
          break;
      }
    }

    /* BOLT-017: Apply support aura speed buffs each frame. */
    this.updateSupportAuras();

    /* Redraw all health bars in one batch. */
    this.drawHealthBars();
  }

  /**
   * Cleans up all enemies, the health bar Graphics, and any active tweens.
   * Called on scene shutdown.
   */
  destroy(): void {
    /* Release all active enemies back to pool. */
    for (const enemy of this.activeEnemies) {
      this.resetSpriteForPool(enemy);
      this.poolManager.releaseEnemy(enemy.sprite);
    }
    this.activeEnemies.length = 0;

    /* Destroy the health bar Graphics object. */
    if (this.healthBarGraphics) {
      this.healthBarGraphics.destroy();
      this.healthBarGraphics = null;
    }

    this.waypoints = [];
    this.mapReady = false;

    /* BaseSystem.destroy() removes all tracked event listeners. */
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API (called by BOLT-004, BOLT-006)
  // ---------------------------------------------------------------------------

  /**
   * Spawns a new enemy of the given archetype at the map's spawn position.
   * Called by BOLT-004 (Wave System) to place enemies on the field.
   *
   * @param archetypeId - Enemy definition ID (e.g., "runner", "tank").
   * @param waveNumber - Current wave number for stat scaling.
   * @returns The spawned Enemy instance, or null if pool is exhausted.
   */
  spawnEnemy(archetypeId: string, waveNumber: number): Enemy | null {
    if (!this.mapReady || this.waypoints.length === 0) {
      console.warn('EnemySystem.spawnEnemy: map not ready, cannot spawn.');
      return null;
    }

    const definition = this.configManager.getEnemy(archetypeId);
    const spawnPoint = this.waypoints[0]!;

    /* Acquire a sprite from the pool. */
    const sprite = this.poolManager.acquireEnemy(
      definition.spriteKey,
      spawnPoint.worldX,
      spawnPoint.worldY,
    );

    if (!sprite) {
      console.warn(`EnemySystem.spawnEnemy: pool exhausted, cannot spawn "${archetypeId}".`);
      return null;
    }

    /* Set depth based on movement type. */
    sprite.setDepth(
      definition.movementType === 'flying' ? DEPTH_ENEMY_FLYING : DEPTH_ENEMY_GROUND,
    );

    /* Apply wave scaling. */
    const scaling = EnemySystem.getWaveScaling(waveNumber);

    const enemy = new Enemy(
      generateId('enemy'),
      definition,
      sprite,
      scaling.hpMultiplier,
      scaling.speedMultiplier,
      waveNumber,
    );

    /* Start heading toward waypoint 1 (waypoint 0 is the spawn tile). */
    enemy.waypointIndex = 1;

    this.activeEnemies.push(enemy);

    /* Emit spawn event for BOLT-004 wave tracking. */
    const payload: EnemySpawnedPayload = {
      enemyId: enemy.instanceId,
      enemyType: definition.id,
      position: { x: spawnPoint.worldX, y: spawnPoint.worldY },
      waveNumber,
    };
    this.emit(GAME_EVENTS.ENEMY_SPAWNED, payload);

    return enemy;
  }

  /**
   * Returns all currently active enemies (MOVING or DYING state).
   * Used by BOLT-006 for tower targeting queries.
   */
  getActiveEnemies(): Enemy[] {
    return this.activeEnemies.filter((e) => e.state === EnemyState.MOVING);
  }

  /**
   * Finds a specific enemy by its instance ID.
   * Used by BOLT-006 for applying damage to a targeted enemy.
   *
   * @param instanceId - The enemy's unique instance ID.
   * @returns The Enemy instance, or null if not found or not alive.
   */
  getEnemyById(instanceId: string): Enemy | null {
    return this.activeEnemies.find(
      (e) => e.instanceId === instanceId && e.state === EnemyState.MOVING,
    ) ?? null;
  }

  /**
   * Returns wave scaling multipliers for the given wave number.
   * Static so BOLT-004 can call it without an EnemySystem instance.
   *
   * Formula:
   * - hpMultiplier = 1 + (waveNumber - 1) * 0.15, clamped to 5.0
   * - speedMultiplier = 1 + (waveNumber - 1) * 0.03, clamped to 2.0
   *
   * @param waveNumber - The wave number (1-indexed).
   * @returns HP and speed multipliers for the wave.
   */
  static getWaveScaling(waveNumber: number): { hpMultiplier: number; speedMultiplier: number } {
    const waveFactor = Math.max(0, waveNumber - 1);

    const hpMultiplier = Math.min(
      1 + waveFactor * WAVE_SCALING.hpPerWave,
      WAVE_SCALING.maxHpMultiplier,
    );

    const speedMultiplier = Math.min(
      1 + waveFactor * WAVE_SCALING.speedPerWave,
      WAVE_SCALING.maxSpeedMultiplier,
    );

    return { hpMultiplier, speedMultiplier };
  }

  /**
   * Applies damage to an enemy by instance ID. Called when the system
   * receives damage events, or directly by BOLT-006.
   * Triggers hit flash VFX, handles shield break events, and handles death.
   *
   * @param instanceId - Target enemy's instance ID.
   * @param rawDamage - Raw damage before reductions.
   * @param damageType - Damage type for multiplier lookup.
   */
  applyDamageToEnemy(instanceId: string, rawDamage: number, damageType: string = 'physical'): void {
    const enemy = this.getEnemyById(instanceId);
    if (!enemy) return;

    const result = enemy.takeDamage(rawDamage, damageType);

    /* Trigger hit flash VFX. */
    this.triggerHitFlash(enemy);

    /* BOLT-017: Emit shield broken event and play VFX when shield depletes. */
    if (result.shieldBroken) {
      const pos = enemy.getPosition();
      const payload: EnemyShieldBrokenPayload = {
        enemyId: enemy.instanceId,
        enemyType: enemy.definition.id,
        position: pos,
      };
      this.emit(GAME_EVENTS.ENEMY_SHIELD_BROKEN, payload);

      if (this.vfxManager) {
        this.vfxManager.playShieldBreakBurst(pos.x, pos.y);
      }
    }

    if (result.died) {
      this.handleDeath(enemy);
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Movement
  // ---------------------------------------------------------------------------

  /**
   * Moves an enemy toward its next waypoint. When it reaches the waypoint,
   * advances to the next one. If it reaches the final waypoint (objective),
   * handles breakthrough.
   */
  private updateMovement(enemy: Enemy, delta: number): void {
    if (enemy.waypointIndex >= this.waypoints.length) {
      this.handleBreakthrough(enemy);
      return;
    }

    const target = this.waypoints[enemy.waypointIndex]!;
    const sprite = enemy.sprite;
    const dt = delta / 1000;

    /* Calculate distance to move this frame. Delta is in ms; speed is px/sec. */
    const distanceToMove = enemy.currentSpeed * dt;

    const dx = target.worldX - sprite.x;
    const dy = target.worldY - sprite.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);

    /* BOLT-014: Smooth rotation interpolation toward travel direction.
     * Uses lerp instead of instant snap for fluid enemy movement. */
    const targetAngle = Math.atan2(dy, dx);
    if (this.vfxManager) {
      this.vfxManager.lerpRotation(sprite, targetAngle, ENEMY_ROTATION_LERP_SPEED, dt);
    } else {
      /* Fallback to instant rotation if VFXManager not available. */
      sprite.rotation = targetAngle;
    }

    if (distanceToMove >= distToTarget) {
      /* Reached (or passed) the waypoint -- snap to it and advance. */
      sprite.x = target.worldX;
      sprite.y = target.worldY;
      enemy.waypointIndex++;

      /* Check if this was the last waypoint (objective). */
      if (enemy.waypointIndex >= this.waypoints.length) {
        this.handleBreakthrough(enemy);
      }
    } else {
      /* Smooth movement toward the waypoint. */
      const ratio = distanceToMove / distToTarget;
      sprite.x += dx * ratio;
      sprite.y += dy * ratio;
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Hit Flash VFX (BOLT-014: white overlay that fades)
  // ---------------------------------------------------------------------------

  /**
   * Triggers the improved hit flash via VFXManager. Creates a white overlay
   * rectangle that fades out, replacing the old simple tint approach.
   * Falls back to brief tint if VFXManager is not available.
   */
  private triggerHitFlash(enemy: Enemy): void {
    if (this.vfxManager) {
      /* BOLT-014: Overlay-based hit flash via VFXManager. */
      this.vfxManager.playHitFlash(enemy.sprite);
    } else {
      /* Fallback: brief white tint for backwards compat. */
      enemy.sprite.setTint(0xFFFFFF);
      if (enemy.flashTimer) {
        enemy.flashTimer.remove(false);
      }
      enemy.flashTimer = this.scene.time.delayedCall(150, () => {
        if (enemy.state === EnemyState.MOVING || enemy.state === EnemyState.DYING) {
          enemy.sprite.clearTint();
        }
        enemy.flashTimer = null;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Death Handling
  // ---------------------------------------------------------------------------

  /**
   * Handles enemy death: plays the improved fade+shrink+particle burst,
   * emits ENEMY_DIED, and releases the sprite to pool on completion.
   *
   * BOLT-014: Death animation upgraded from scale-up pop to scale-down
   * shrink with per-archetype particle burst via VFXManager.
   */
  private handleDeath(enemy: Enemy): void {
    enemy.state = EnemyState.DYING;
    const pos = enemy.getPosition();

    /* Emit death event immediately (before tween completes) so BOLT-008
     * can credit rewards promptly. */
    const payload: EnemyDiedPayload = {
      enemyId: enemy.instanceId,
      enemyType: enemy.definition.id,
      position: pos,
      reward: enemy.definition.currencyReward,
      scoreReward: enemy.definition.scoreReward,
    };
    this.emit(GAME_EVENTS.ENEMY_DIED, payload);

    /* BOLT-017: When a Support Unit dies, play aura-expire burst on every
     * enemy that was currently being buffed by this support's aura. */
    if (enemy.hasAura() && this.vfxManager) {
      for (const other of this.activeEnemies) {
        if (other.state !== EnemyState.MOVING) continue;
        if (other.activeAuraSources.has(enemy.instanceId)) {
          const otherPos = other.getPosition();
          this.vfxManager.playAuraExpireBurst(otherPos.x, otherPos.y);
        }
      }
    }

    /* BOLT-014: Play per-archetype particle burst via VFXManager. */
    if (this.vfxManager) {
      this.vfxManager.playDeathBurst(pos.x, pos.y, enemy.definition.id);
    }

    /* BOLT-014: Improved death tween -- fade out + scale DOWN (shrink).
     * Old behavior was scale-up pop; new behavior is shrink-to-nothing
     * which looks more like the enemy is dissolving. */
    const tweenConfig = this.vfxManager?.getDeathTweenConfig() ?? {
      duration: 200,
      targetScale: 1.3,
    };

    this.scene.tweens.add({
      targets: enemy.sprite,
      alpha: 0,
      scaleX: tweenConfig.targetScale,
      scaleY: tweenConfig.targetScale,
      duration: tweenConfig.duration,
      ease: 'Quad.easeOut',
      onComplete: () => {
        enemy.state = EnemyState.DEAD;
        this.resetSpriteForPool(enemy);
        this.poolManager.releaseEnemy(enemy.sprite);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private -- Breakthrough Handling
  // ---------------------------------------------------------------------------

  /**
   * Handles enemy reaching the objective: emits ENEMY_REACHED_OBJECTIVE
   * and immediately releases the sprite to pool (no death tween).
   */
  private handleBreakthrough(enemy: Enemy): void {
    enemy.state = EnemyState.BREAKTHROUGH;

    const payload: EnemyReachedObjectivePayload = {
      enemyId: enemy.instanceId,
      enemyType: enemy.definition.id,
      damage: enemy.definition.breakthroughDamage,
    };
    this.emit(GAME_EVENTS.ENEMY_REACHED_OBJECTIVE, payload);

    /* Immediately release to pool -- no tween for breakthrough. */
    this.resetSpriteForPool(enemy);
    this.poolManager.releaseEnemy(enemy.sprite);
  }

  // ---------------------------------------------------------------------------
  // Private -- Health Bar Rendering
  // ---------------------------------------------------------------------------

  /**
   * Redraws all health bars (and shield bars for BOLT-017) using the shared
   * Graphics object. Called every frame in update(). One clear + N fillRect
   * is cheaper than 100 individual Graphics objects.
   *
   * BOLT-017: Shielded enemies get a cyan shield bar above the health bar.
   */
  private drawHealthBars(): void {
    if (!this.healthBarGraphics) return;

    this.healthBarGraphics.clear();

    for (const enemy of this.activeEnemies) {
      /* Only draw bars for moving enemies (not dying/dead). */
      if (enemy.state !== EnemyState.MOVING) continue;

      const sprite = enemy.sprite;
      const hpRatio = enemy.getHpRatio();
      const barWidth = sprite.displayWidth;
      const barX = sprite.x - barWidth / 2;
      let barY = sprite.y - (sprite.displayHeight / 2 + HEALTH_BAR_Y_OFFSET);

      /* BOLT-017: Shield bar above health bar for shielded enemies. */
      if (enemy.hasShield() && enemy.getMaxShieldHp() > 0) {
        const shieldBarY = barY - SHIELD_BAR_Y_OFFSET;
        const shieldRatio = enemy.getShieldRatio();

        /* Shield background. */
        this.healthBarGraphics.fillStyle(HEALTH_BAR_COLORS.background, 0.6);
        this.healthBarGraphics.fillRect(barX, shieldBarY, barWidth, SHIELD_BAR_HEIGHT);

        /* Shield fill bar -- only draw if there is shield HP. */
        if (shieldRatio > 0) {
          this.healthBarGraphics.fillStyle(SHIELD_BAR_COLOR, 1);
          this.healthBarGraphics.fillRect(barX, shieldBarY, barWidth * shieldRatio, SHIELD_BAR_HEIGHT);
        }
      }

      /* Background bar (full width). */
      this.healthBarGraphics.fillStyle(HEALTH_BAR_COLORS.background, 1);
      this.healthBarGraphics.fillRect(barX, barY, barWidth, HEALTH_BAR_HEIGHT);

      /* HP fill bar (proportional width). */
      const fillColor = hpRatio > 0.5
        ? HEALTH_BAR_COLORS.high
        : hpRatio > 0.25
          ? HEALTH_BAR_COLORS.mid
          : HEALTH_BAR_COLORS.low;

      this.healthBarGraphics.fillStyle(fillColor, 1);
      this.healthBarGraphics.fillRect(barX, barY, barWidth * hpRatio, HEALTH_BAR_HEIGHT);
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Shield Regeneration (BOLT-017)
  // ---------------------------------------------------------------------------

  /**
   * Ticks shield regeneration for a single enemy. Called per-frame for
   * each MOVING enemy. Increments the damage timer and, once the regen
   * delay expires, restores shield HP at the configured rate.
   *
   * When the shield goes from 0 to >0, emits ENEMY_SHIELD_REGENERATED.
   */
  private updateShieldRegen(enemy: Enemy, dt: number): void {
    if (!enemy.hasShield()) return;
    if (enemy.isShieldActive()) return; // Shield already full or partially up -- no regen needed
    if (enemy.getShieldHp() >= enemy.getMaxShieldHp()) return;

    /* Accumulate time since last damage. */
    enemy.timeSinceLastDamage += dt;

    /* Only regen after the configured delay. */
    if (enemy.timeSinceLastDamage < enemy.getShieldRegenDelay()) return;

    const regenAmount = enemy.getShieldRegenRate() * dt;
    const justReactivated = enemy.regenShield(regenAmount);

    if (justReactivated) {
      const pos = enemy.getPosition();
      const payload: EnemyShieldRegeneratedPayload = {
        enemyId: enemy.instanceId,
        enemyType: enemy.definition.id,
        position: pos,
      };
      this.emit(GAME_EVENTS.ENEMY_SHIELD_REGENERATED, payload);
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Support Aura Processing (BOLT-017)
  // ---------------------------------------------------------------------------

  /**
   * Each frame, finds all Support enemies and applies their speed aura to
   * nearby allies. Non-support enemies have their speed reset to base before
   * aura buffs are reapplied, so removing a Support enemy instantly removes
   * its effect.
   *
   * Aura stacking: multiple Support enemies do NOT stack -- an enemy buffed
   * by one or more supports gets a single 1.3x multiplier. This prevents
   * exponential speed creep from clustered Support units.
   */
  private updateSupportAuras(): void {
    const movingEnemies = this.activeEnemies.filter(e => e.state === EnemyState.MOVING);

    /* Phase 1: Reset all enemies to base speed and clear aura sources.
     * This ensures enemies immediately lose the buff when supports die. */
    for (const enemy of movingEnemies) {
      enemy.currentSpeed = enemy.baseSpeed;
      enemy.activeAuraSources.clear();
    }

    /* Phase 2: Find all support enemies and apply their aura. */
    const supporters = movingEnemies.filter(e => e.hasAura());

    for (const support of supporters) {
      const auraRadius = support.getAuraRadius();
      const supportPos = support.getPosition();

      for (const target of movingEnemies) {
        /* Support does not buff itself. */
        if (target === support) continue;

        const targetPos = target.getPosition();
        const dx = targetPos.x - supportPos.x;
        const dy = targetPos.y - supportPos.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= auraRadius * auraRadius) {
          target.activeAuraSources.add(support.instanceId);
        }
      }
    }

    /* Phase 3: Apply the speed buff to enemies that have at least one aura source.
     * Single multiplier regardless of how many supports are buffing. */
    for (const enemy of movingEnemies) {
      if (enemy.activeAuraSources.size > 0) {
        /* All support units use the same multiplier (from config), so
         * we use the first supporter's multiplier. In practice all
         * supports have identical aura config from enemies.json. */
        const firstSupportId = enemy.activeAuraSources.values().next().value!;
        const supporter = movingEnemies.find(e => e.instanceId === firstSupportId);
        const mult = supporter?.getAuraSpeedMultiplier() ?? 1.0;
        enemy.currentSpeed = enemy.baseSpeed * mult;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resets sprite properties modified during gameplay (tint, alpha, scale)
   * before returning it to the pool. The death tween modifies alpha and
   * scale; hit flash modifies tint. All must be reset for reuse.
   */
  private resetSpriteForPool(enemy: Enemy): void {
    enemy.sprite.clearTint();
    enemy.sprite.setAlpha(1);
    enemy.sprite.setScale(1);
    enemy.sprite.setRotation(0);

    /* Cancel any active flash timer to prevent callbacks on pooled sprites. */
    if (enemy.flashTimer) {
      enemy.flashTimer.remove(false);
      enemy.flashTimer = null;
    }
  }

  /**
   * Handles MAP_READY event: caches waypoints for enemy movement.
   */
  private onMapReady(): void {
    const mapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (mapData) {
      this.waypoints = mapData.getWaypoints();
      this.mapReady = true;
    }
  }
}
