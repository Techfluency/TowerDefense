/**
 * Enemy system -- manages all active enemies on the field.
 *
 * Responsibilities:
 * - Spawning enemies via spawnEnemy() (called by BOLT-004 Wave System)
 * - Per-frame waypoint-following movement for all active enemies
 * - Sprite rotation toward direction of travel
 * - Hit flash (white tint) on damage receipt
 * - Death handling: tween fade+scale, emit ENEMY_DIED, release to pool
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
import type { EnemyDiedPayload, EnemyReachedObjectivePayload, EnemySpawnedPayload } from '../types/events';
import type { PoolManager } from '../utils/pool-manager';
import type { ConfigManager } from '../utils/config-manager';
import type { MapData } from '../data/map-data';
import { generateId } from '../utils/id-generator';
import {
  DEPTH_ENEMY_GROUND,
  DEPTH_ENEMY_FLYING,
  DEPTH_HEALTH_BARS,
} from '../config/depth-layers';

/** Hit flash duration in milliseconds. */
const HIT_FLASH_DURATION_MS = 150;

/** Death tween duration in milliseconds. */
const DEATH_TWEEN_DURATION_MS = 200;

/** Death tween target scale (pop effect before fade). */
const DEATH_TWEEN_SCALE = 1.3;

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

/** Wave scaling constants. */
const WAVE_SCALING = {
  hpPerWave: 0.15,
  speedPerWave: 0.03,
  maxHpMultiplier: 5.0,
  maxSpeedMultiplier: 2.0,
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
   * and redraws health bars.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    if (!this.mapReady) return;

    /* Process enemies in reverse so we can safely remove from the array. */
    for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
      const enemy = this.activeEnemies[i]!;

      switch (enemy.state) {
        case EnemyState.MOVING:
          this.updateMovement(enemy, delta);
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
   * Triggers hit flash VFX and handles death if HP reaches zero.
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

    /* Calculate distance to move this frame. Delta is in ms; speed is px/sec. */
    const distanceToMove = enemy.currentSpeed * (delta / 1000);

    const dx = target.worldX - sprite.x;
    const dy = target.worldY - sprite.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);

    /* Rotate sprite to face direction of travel. */
    sprite.rotation = Math.atan2(dy, dx);

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
      /* Move toward the waypoint. */
      const ratio = distanceToMove / distToTarget;
      sprite.x += dx * ratio;
      sprite.y += dy * ratio;
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- Hit Flash VFX
  // ---------------------------------------------------------------------------

  /**
   * Applies a white tint flash to the enemy sprite for HIT_FLASH_DURATION_MS.
   * If a flash is already active, resets the timer (does not stack).
   */
  private triggerHitFlash(enemy: Enemy): void {
    enemy.sprite.setTint(0xFFFFFF);

    /* Cancel existing timer if already flashing (prevents stacking). */
    if (enemy.flashTimer) {
      enemy.flashTimer.remove(false);
    }

    enemy.flashTimer = this.scene.time.delayedCall(
      HIT_FLASH_DURATION_MS,
      () => {
        /* Only clear tint if the enemy is still alive and on field. */
        if (enemy.state === EnemyState.MOVING || enemy.state === EnemyState.DYING) {
          enemy.sprite.clearTint();
        }
        enemy.flashTimer = null;
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Private -- Death Handling
  // ---------------------------------------------------------------------------

  /**
   * Handles enemy death: plays the fade+scale tween, emits ENEMY_DIED,
   * and releases the sprite to pool on completion.
   */
  private handleDeath(enemy: Enemy): void {
    enemy.state = EnemyState.DYING;

    /* Emit death event immediately (before tween completes) so BOLT-008
     * can credit rewards promptly. */
    const payload: EnemyDiedPayload = {
      enemyId: enemy.instanceId,
      enemyType: enemy.definition.id,
      position: enemy.getPosition(),
      reward: enemy.definition.currencyReward,
      scoreReward: enemy.definition.scoreReward,
    };
    this.emit(GAME_EVENTS.ENEMY_DIED, payload);

    /* Play death tween: fade out + scale pop. */
    this.scene.tweens.add({
      targets: enemy.sprite,
      alpha: 0,
      scaleX: DEATH_TWEEN_SCALE,
      scaleY: DEATH_TWEEN_SCALE,
      duration: DEATH_TWEEN_DURATION_MS,
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
   * Redraws all health bars using the shared Graphics object.
   * Called every frame in update(). One clear + N fillRect is cheaper
   * than 100 individual Graphics objects.
   */
  private drawHealthBars(): void {
    if (!this.healthBarGraphics) return;

    this.healthBarGraphics.clear();

    for (const enemy of this.activeEnemies) {
      /* Only draw health bars for moving enemies (not dying/dead). */
      if (enemy.state !== EnemyState.MOVING) continue;

      const sprite = enemy.sprite;
      const hpRatio = enemy.getHpRatio();
      const barWidth = sprite.displayWidth;
      const barX = sprite.x - barWidth / 2;
      const barY = sprite.y - (sprite.displayHeight / 2 + HEALTH_BAR_Y_OFFSET);

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
