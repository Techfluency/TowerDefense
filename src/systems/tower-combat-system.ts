/**
 * Tower combat system -- targeting, cooldowns, and fire initiation.
 *
 * This is the core combat loop. Each frame it iterates all placed towers,
 * selects targets using per-tower-class rules, manages fire-rate cooldowns,
 * and initiates the appropriate attack when ready:
 * - Ranged (Arrow): spawns a projectile via ProjectileSystem
 * - Focused (Sniper): instant hitscan with line-flash VFX
 * - Broadcast (Shockwave): area burst to all ground enemies in range
 * - Anti-Air (AA Missile): spawns a homing missile projectile
 *
 * Per-tower combat state (cooldown, current target) is stored in a
 * separate Map, not on PlacedTower, to maintain data/behavior separation.
 *
 * Also handles the hover range circle display when the cursor is over
 * a placed tower outside of placement mode.
 *
 * Priority 3 in system-order.ts -- fires after EnemySystem moves enemies
 * so towers target at current-frame positions.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import type { GameState, PlacedTower, TowerDefinition, EffectiveTowerStats } from '../types/game-types';
import { GAME_EVENTS } from '../types/game-types';
import type { TowerFiredPayload, EnemyHitPayload } from '../types/events';
import type { ConfigManager } from '../utils/config-manager';
import { resolveEffectiveStats } from '../utils/stat-resolver';
import type { TowerRegistry } from './tower-registry';
import type { EnemySystem } from './enemy-system';
import type { ProjectileSystem } from './projectile-system';
import type { StatusEffectSystem } from './status-effect-system';
import { Enemy } from '../entities/enemy';
import {
  DEPTH_PROJECTILES,
  DEPTH_RANGE_PREVIEW,
} from '../config/depth-layers';
import type { VFXManager } from '../vfx/vfx-manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rotation interpolation speed in radians per second. */
const ROTATION_SPEED = 8;

/** VFX duration constants in milliseconds. */
const HITSCAN_FLASH_DURATION_MS = 100;
const SHOCKWAVE_BURST_DURATION_MS = 300;

/** VFX color tokens. */
const COLOR_HITSCAN_LINE = 0xFFFF88;
const COLOR_TOWER_BROADCAST = 0x4AD9B0;

/** Hover range circle visual style (matches BOLT-005 RangePreviewCircle). */
const RANGE_CIRCLE_ALPHA = 0.35;
const RANGE_CIRCLE_LINE_WIDTH = 1.5;

// ---------------------------------------------------------------------------
// BOLT-019: Tier 4 branch effect constants
// ---------------------------------------------------------------------------

/** Frost Wave slow: 30% speed reduction (multiplier = 0.7). */
const FROST_SLOW_MAGNITUDE = 0.7;

/** Frost Wave slow duration in seconds. */
const FROST_SLOW_DURATION_SEC = 2.0;

/** Inferno Blast burn zone DPS (damage per second). */
const BURN_ZONE_DPS = 20;

/** Inferno Blast burn zone duration in seconds. */
const BURN_ZONE_DURATION_SEC = 1.0;

/** Piercing Arrow: number of enemies the arrow passes through. */
const PIERCE_COUNT = 2;

// ---------------------------------------------------------------------------
// Per-tower combat state (internal to this system, keyed by instanceId)
// ---------------------------------------------------------------------------

/** Mutable per-tower combat state managed by TowerCombatSystem. */
interface TowerCombatState {
  /** Seconds accumulated since last fire. Fires when >= 1/fireRate. */
  cooldownAccumulator: number;
  /** Instance ID of the currently tracked enemy, or null when idle. */
  currentTargetId: string | null;
  /** Last known position of the target (for orphaned projectile destination). */
  lastTargetPosition: { x: number; y: number } | null;
}

export class TowerCombatSystem extends BaseSystem {
  private readonly configManager: ConfigManager;

  /** Per-tower combat state keyed by PlacedTower.instanceId. */
  private readonly combatStates = new Map<string, TowerCombatState>();

  /** When false, all targeting and firing is halted (GAME_OVER). */
  private combatActive = true;

  /** Shared Graphics object for the hover range circle. */
  private rangeGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Instance ID of the tower currently showing its hover range circle. */
  private hoveredTowerId: string | null = null;

  /* System references resolved in init(). */
  private towerRegistry!: TowerRegistry;
  private enemySystem!: EnemySystem;
  private projectileSystem!: ProjectileSystem;

  /** VFX manager for muzzle flash, recoil, shockwave particles. BOLT-014. */
  private vfxManager: VFXManager | null = null;

  /** Status effect system for applying slow/burn from Tier 4 branches. BOLT-019. */
  private statusEffectSystem: StatusEffectSystem | null = null;

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Shared per-run game state.
   * @param configManager - Tower and projectile definition access.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.configManager = configManager;
  }

  /**
   * Registers on Phaser registry, resolves cross-system references,
   * sets up event listeners for GAME_OVER and hover detection.
   */
  init(): void {
    this.scene.registry.set('towerCombatSystem', this);

    /* Resolve cross-system references from registry. */
    this.towerRegistry = this.scene.registry.get('towerRegistry') as TowerRegistry;
    this.enemySystem = this.scene.registry.get('enemySystem') as EnemySystem;

    /* BOLT-014: Resolve VFX manager for muzzle flash and shockwave VFX. */
    this.vfxManager = (this.scene.registry.get('vfxManager') as VFXManager) ?? null;

    /* BOLT-019: Resolve status effect system for Tier 4 branch effects. */
    this.statusEffectSystem = (this.scene.registry.get('statusEffectSystem') as StatusEffectSystem) ?? null;

    /* Listen for GAME_OVER to halt combat. */
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);

    /* Listen for tower removal to clean up combat state. */
    this.listen(GAME_EVENTS.TOWER_REMOVED, this.onTowerRemoved as (...args: never[]) => void);

    /* Create shared Graphics for hover range circle. */
    this.rangeGraphics = this.scene.add.graphics();
    this.rangeGraphics.setDepth(DEPTH_RANGE_PREVIEW);
    this.rangeGraphics.setVisible(false);

    /* Set up pointer move listener for hover range detection. */
    this.scene.input.on('pointermove', this.onPointerMove, this);
  }

  /**
   * Per-frame update: iterates all towers, runs targeting and cooldowns,
   * fires when ready.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    if (!this.combatActive) return;

    /* Convert delta from ms to seconds for accumulator math. */
    const dt = delta / 1000;

    /* Cache per-frame: placed towers and active enemies (avoid repeated allocations). */
    const towers = this.towerRegistry.getPlacedTowers();
    const activeEnemies = this.enemySystem.getActiveEnemies();

    /* BOLT-024: Read RunBonuses once per frame for stat multipliers and regen.
     * Uses optional chaining because registry may not have RunBonuses in tests. */
    const runBonuses = (this.scene.registry as { get?(key: string): unknown })
      ?.get?.('runBonuses') as import('../types/game-types').RunBonuses | undefined ?? null;

    /* BOLT-024: Tower regen from skill tree global upgrades.
     * Apply per second, scaled by delta. */
    const regenPerSec = runBonuses?.global.towerRegenPerSec ?? 0;

    for (const tower of towers) {
      /* BOLT-024: Apply tower regen before targeting (heal even idle towers).
       * Regen is capped at maxHp resolved from current upgrade tier. */
      if (regenPerSec > 0 && tower.currentHp > 0) {
        const hpMultiplier = runBonuses?.global.towerHpMultiplier ?? 1.0;
        const baseMaxHp = resolveEffectiveStats(tower, this.configManager).maxHp;
        const maxHp = Math.ceil(baseMaxHp * hpMultiplier);
        if (tower.currentHp < maxHp) {
          tower.currentHp = Math.min(maxHp, tower.currentHp + regenPerSec * dt);
        }
      }

      const def = this.configManager.getTower(tower.towerType);
      /* Use effective stats from the upgrade tier with skill tree bonuses. */
      const stats = resolveEffectiveStats(tower, this.configManager, runBonuses);
      let state = this.combatStates.get(tower.instanceId);

      /* Lazily create combat state for newly placed towers. */
      if (!state) {
        state = {
          cooldownAccumulator: 0,
          currentTargetId: null,
          lastTargetPosition: null,
        };
        this.combatStates.set(tower.instanceId, state);
      }

      /* --- Target acquisition (uses effective range) --- */
      /* BOLT-019: Ground Adapter branch allows anti-air towers to target ground enemies. */
      const target = this.acquireTarget(tower, def, activeEnemies, state, stats.range, stats);

      if (!target) {
        /* No valid target: reset state to idle. */
        state.currentTargetId = null;
        state.lastTargetPosition = null;
        state.cooldownAccumulator = 0;
        continue;
      }

      /* Track the target. */
      state.currentTargetId = target.instanceId;
      const targetPos = target.getPosition();
      state.lastTargetPosition = { x: targetPos.x, y: targetPos.y };

      /* Rotate tower sprite toward target (smooth interpolation). */
      this.rotateTowerToTarget(tower, targetPos, dt);

      /* --- Fire rate cooldown (uses effective fireRate) --- */
      state.cooldownAccumulator += dt;
      const firePeriod = 1 / stats.fireRate;

      if (state.cooldownAccumulator >= firePeriod) {
        state.cooldownAccumulator -= firePeriod;

        /* Fire based on tower class (uses effective damage). BOLT-019: pass full stats for branch effects. */
        this.fireTower(tower, def, target, stats);
      }
    }

    /* Clean up combat state for towers that no longer exist. */
    if (this.combatStates.size > towers.length) {
      const towerIds = new Set(towers.map(t => t.instanceId));
      for (const id of this.combatStates.keys()) {
        if (!towerIds.has(id)) {
          this.combatStates.delete(id);
        }
      }
    }
  }

  /**
   * Cleans up combat states, Graphics objects, and event listeners.
   */
  destroy(): void {
    this.combatStates.clear();

    if (this.rangeGraphics) {
      this.rangeGraphics.destroy();
      this.rangeGraphics = null;
    }

    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.registry.remove('towerCombatSystem');
    super.destroy();
  }

  /**
   * Resolves the ProjectileSystem reference. Called by Gameplay.ts after
   * both systems are constructed, since ProjectileSystem is created after
   * TowerCombatSystem.
   */
  setProjectileSystem(ps: ProjectileSystem): void {
    this.projectileSystem = ps;
  }

  // ---------------------------------------------------------------------------
  // Targeting
  // ---------------------------------------------------------------------------

  /**
   * Selects the best target for a tower based on its class and targeting mode.
   *
   * Filtering rules per tower class:
   * - antiair: only flying enemies (isFlying === true)
   *   - BOLT-019: Ground Adapter branch removes this restriction
   * - broadcast: only ground enemies (isFlying === false)
   * - ranged/focused: all enemies
   *
   * Targeting mode selection:
   * - first: highest waypointIndex (furthest along the path)
   * - strongest: highest getCurrentHp()
   * - closest: shortest distance to tower
   *
   * @param effectiveRange - The tower's effective range after upgrades.
   * @param stats - Full effective stats including specialEffect for branch overrides.
   * @returns The selected enemy, or null if no valid target exists.
   */
  private acquireTarget(
    tower: PlacedTower,
    def: TowerDefinition,
    activeEnemies: Enemy[],
    state: TowerCombatState,
    effectiveRange: number,
    stats?: EffectiveTowerStats,
  ): Enemy | null {
    const rangeSq = effectiveRange * effectiveRange;
    const candidates: Enemy[] = [];

    for (const enemy of activeEnemies) {
      /* Distance check. */
      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq) continue;

      /* Tower-class filtering.
       * BOLT-019: Ground Adapter (antiair 4B) can target both ground and air. */
      const isGroundAdapter = stats?.specialEffect === 'ground_adapter';
      if (def.towerClass === 'antiair' && !enemy.isFlying && !isGroundAdapter) continue;
      if (def.towerClass === 'broadcast' && enemy.isFlying) continue;

      candidates.push(enemy);
    }

    if (candidates.length === 0) return null;

    /* Prefer keeping the current target if it is still valid (sticky targeting). */
    if (state.currentTargetId) {
      const current = candidates.find(e => e.instanceId === state.currentTargetId);
      if (current) return current;
    }

    /* Apply targeting mode to select from candidates. */
    switch (def.targetingMode) {
      case 'first':
        /* Furthest along the path (highest waypointIndex). */
        return candidates.reduce((best, e) =>
          e.waypointIndex > best.waypointIndex ? e : best,
        );

      case 'strongest':
        /* Highest current HP. */
        return candidates.reduce((best, e) =>
          e.getCurrentHp() > best.getCurrentHp() ? e : best,
        );

      case 'closest': {
        /* Shortest distance to tower. */
        let bestDist = Infinity;
        let bestEnemy = candidates[0]!;
        for (const enemy of candidates) {
          const dx = enemy.sprite.x - tower.worldX;
          const dy = enemy.sprite.y - tower.worldY;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestEnemy = enemy;
          }
        }
        return bestEnemy;
      }

      default:
        /* Fallback: first in candidates. */
        return candidates[0]!;
    }
  }

  // ---------------------------------------------------------------------------
  // Tower rotation
  // ---------------------------------------------------------------------------

  /**
   * Smoothly rotates the tower sprite toward the target position.
   * Uses Phaser.Math.Angle.RotateTo for interpolation at ROTATION_SPEED.
   */
  private rotateTowerToTarget(
    tower: PlacedTower,
    targetPos: { x: number; y: number },
    dt: number,
  ): void {
    const desiredAngle = Phaser.Math.Angle.Between(
      tower.worldX, tower.worldY,
      targetPos.x, targetPos.y,
    );
    tower.sprite.rotation = Phaser.Math.Angle.RotateTo(
      tower.sprite.rotation,
      desiredAngle,
      ROTATION_SPEED * dt,
    );
  }

  // ---------------------------------------------------------------------------
  // Fire dispatch (per-class)
  // ---------------------------------------------------------------------------

  /**
   * Dispatches the fire action based on tower class and Tier 4 branch effects.
   * Emits TOWER_FIRED. BOLT-014: Adds muzzle flash particles and recoil.
   *
   * BOLT-019: Reads stats.specialEffect to apply branch-specific combat behavior:
   * - pierce: Arrow passes through PIERCE_COUNT enemies
   * - twin_shot: Sniper fires 2 hitscan beams per attack
   * - burn_zone: Broadcast leaves a brief burn damage zone on enemies
   * - frost_slow: Broadcast applies slow debuff to hit enemies
   * - sam_volley: AA fires 2 missiles per volley
   * - ground_adapter: AA can target ground (handled in acquireTarget)
   *
   * @param stats - Full effective stats including damage, range, and specialEffect.
   */
  private fireTower(
    tower: PlacedTower,
    def: TowerDefinition,
    target: Enemy,
    stats: EffectiveTowerStats,
  ): void {
    const effectiveDamage = stats.damage;
    const effectiveRange = stats.range;
    const effect = stats.specialEffect;

    /* Emit TOWER_FIRED event. */
    const firedPayload: TowerFiredPayload = {
      towerId: tower.instanceId,
      towerType: def.id,
      targetEnemyId: target.instanceId,
      projectileType: def.projectileType,
    };
    this.emit(GAME_EVENTS.TOWER_FIRED, firedPayload);

    /* BOLT-014: Play muzzle flash particles at tower position. */
    if (this.vfxManager) {
      this.vfxManager.playMuzzleFlash(tower.worldX, tower.worldY);
      this.vfxManager.playTowerRecoil(tower.sprite);
    }

    switch (def.towerClass) {
      case 'ranged':
        if (effect === 'pierce') {
          /* BOLT-019 4B: Piercing Arrow -- hits target + passes through additional enemies. */
          this.firePiercingArrow(tower, def, target, effectiveDamage, effectiveRange);
        } else {
          this.fireProjectile(tower, def, target, effectiveDamage);
        }
        break;

      case 'focused':
        if (effect === 'twin_shot') {
          /* BOLT-019 4B: Twin Shot -- fire hitscan twice. */
          this.fireHitscan(tower, target, effectiveDamage);
          this.fireHitscanSecondary(tower, effectiveDamage, effectiveRange);
        } else {
          this.fireHitscan(tower, target, effectiveDamage);
        }
        break;

      case 'broadcast':
        /* Base broadcast fire for all broadcast variants. */
        this.fireBroadcast(tower, effectiveDamage, effectiveRange);

        /* BOLT-019: Apply branch-specific effects after the base broadcast. */
        if (effect === 'burn_zone') {
          this.applyBurnZone(tower, effectiveRange);
        } else if (effect === 'frost_slow') {
          this.applyFrostSlow(tower, effectiveRange);
        }
        break;

      case 'antiair':
        /* Fire the primary missile. */
        this.fireProjectile(tower, def, target, effectiveDamage);

        /* BOLT-019 4A: SAM Battery -- fire a second missile at the same target. */
        if (effect === 'sam_volley') {
          this.fireProjectile(tower, def, target, effectiveDamage);
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Ranged / Anti-Air: projectile fire
  // ---------------------------------------------------------------------------

  /**
   * Creates a projectile via ProjectileSystem. Used by Ranged and Anti-Air.
   * If the pool is exhausted, the fire is silently skipped.
   *
   * @param effectiveDamage - Damage from stat resolver (tier-adjusted).
   */
  private fireProjectile(
    tower: PlacedTower,
    def: TowerDefinition,
    target: Enemy,
    effectiveDamage: number,
  ): void {
    if (!this.projectileSystem) return;

    const projDef = this.configManager.getProjectile(def.projectileType);
    const targetPos = target.getPosition();

    this.projectileSystem.spawnProjectile(
      projDef.spriteKey,
      tower.worldX,
      tower.worldY,
      target.instanceId,
      { x: targetPos.x, y: targetPos.y },
      projDef.speed,
      effectiveDamage,
      'physical',
      def.id,
      def.projectileType,
    );
  }

  // ---------------------------------------------------------------------------
  // Focused: hitscan (instant damage + line-flash VFX)
  // ---------------------------------------------------------------------------

  /**
   * Instantly applies damage to the target and plays a hitscan line-flash.
   * No projectile entity is created -- the Sniper Tower fires instantly.
   *
   * @param effectiveDamage - Damage from stat resolver (tier-adjusted).
   */
  private fireHitscan(
    tower: PlacedTower,
    target: Enemy,
    effectiveDamage: number,
  ): void {
    const targetPos = target.getPosition();

    /* Apply damage immediately through the canonical pipeline. */
    this.enemySystem.applyDamageToEnemy(target.instanceId, effectiveDamage, 'physical');

    /* Emit ENEMY_HIT for hit tracking. */
    const hitPayload: EnemyHitPayload = {
      enemyId: target.instanceId,
      projectileType: 'none',
      damage: effectiveDamage,
      position: { x: targetPos.x, y: targetPos.y },
    };
    this.emit(GAME_EVENTS.ENEMY_HIT, hitPayload);

    /* Play hitscan line-flash VFX. */
    this.playHitscanFlash(tower.worldX, tower.worldY, targetPos.x, targetPos.y);
  }

  /**
   * Draws a thin line from tower to target that fades out over 100ms.
   * Uses a disposable Phaser Graphics object with a tween.
   */
  private playHitscanFlash(
    fromX: number, fromY: number,
    toX: number, toY: number,
  ): void {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_PROJECTILES);

    gfx.lineStyle(2, COLOR_HITSCAN_LINE, 1.0);
    gfx.beginPath();
    gfx.moveTo(fromX, fromY);
    gfx.lineTo(toX, toY);
    gfx.strokePath();

    /* Fade out then destroy. */
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: HITSCAN_FLASH_DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => gfx.destroy(),
    });
  }

  // ---------------------------------------------------------------------------
  // Broadcast: area burst (all ground enemies in range)
  // ---------------------------------------------------------------------------

  /**
   * Deals damage to all ground enemies currently within the tower's range.
   * No projectile entity is created. Emits ENEMY_HIT per enemy hit.
   *
   * @param effectiveDamage - Damage from stat resolver (tier-adjusted).
   * @param effectiveRange - Range from stat resolver (tier-adjusted).
   */
  private fireBroadcast(
    tower: PlacedTower,
    effectiveDamage: number,
    effectiveRange: number,
  ): void {
    const activeEnemies = this.enemySystem.getActiveEnemies();
    const rangeSq = effectiveRange * effectiveRange;

    for (const enemy of activeEnemies) {
      /* Broadcast only hits ground enemies. */
      if (enemy.isFlying) continue;

      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      if (dx * dx + dy * dy > rangeSq) continue;

      /* Apply damage through the canonical pipeline. */
      this.enemySystem.applyDamageToEnemy(enemy.instanceId, effectiveDamage, 'physical');

      /* Emit ENEMY_HIT per enemy hit. */
      const pos = enemy.getPosition();
      const hitPayload: EnemyHitPayload = {
        enemyId: enemy.instanceId,
        projectileType: 'none',
        damage: effectiveDamage,
        position: { x: pos.x, y: pos.y },
      };
      this.emit(GAME_EVENTS.ENEMY_HIT, hitPayload);
    }

    /* Play shockwave burst VFX. */
    this.playShockwaveBurst(tower.worldX, tower.worldY, effectiveRange);
  }

  /**
   * Plays the shockwave burst VFX: expanding ring + companion particles.
   * BOLT-014: Delegates to VFXManager for the improved version with particles.
   * Falls back to a simple expanding ring if VFXManager is not available.
   */
  private playShockwaveBurst(x: number, y: number, range: number): void {
    if (this.vfxManager) {
      /* BOLT-014: Improved shockwave with expanding ring + particles. */
      this.vfxManager.playShockwaveBurst(x, y, range);
      return;
    }

    /* Fallback: simple expanding ring (original behavior). */
    const gfx = this.scene.add.graphics();
    gfx.setDepth(DEPTH_PROJECTILES);

    const progress = { t: 0 };
    this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration: SHOCKWAVE_BURST_DURATION_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        gfx.clear();
        const currentRadius = range * progress.t;
        const currentAlpha = 0.8 * (1 - progress.t);
        gfx.lineStyle(2, COLOR_TOWER_BROADCAST, currentAlpha);
        gfx.strokeCircle(x, y, currentRadius);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  // ---------------------------------------------------------------------------
  // BOLT-019: Tier 4 branch-specific fire methods
  // ---------------------------------------------------------------------------

  /**
   * Piercing Arrow (Ranged 4B): Damages the primary target, then hits up to
   * PIERCE_COUNT additional enemies along the arrow's flight path.
   * Uses hitscan for pierce targets (no separate projectile entities).
   */
  private firePiercingArrow(
    tower: PlacedTower,
    def: TowerDefinition,
    primaryTarget: Enemy,
    effectiveDamage: number,
    effectiveRange: number,
  ): void {
    /* Fire the main projectile at the primary target. */
    this.fireProjectile(tower, def, primaryTarget, effectiveDamage);

    /* Find additional enemies along the trajectory for pierce-through.
     * We look for enemies near the line from tower to primary target. */
    const activeEnemies = this.enemySystem.getActiveEnemies();
    const rangeSq = effectiveRange * effectiveRange;
    const primaryPos = primaryTarget.getPosition();
    let pierced = 0;

    for (const enemy of activeEnemies) {
      if (pierced >= PIERCE_COUNT) break;
      if (enemy.instanceId === primaryTarget.instanceId) continue;
      if (!enemy.isAlive()) continue;

      /* Check range from tower. */
      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      if (dx * dx + dy * dy > rangeSq) continue;

      /* Check proximity to the line from tower to primary target.
       * Use point-to-line distance with a generous threshold (32px). */
      const lineLen = Math.sqrt(
        (primaryPos.x - tower.worldX) ** 2 + (primaryPos.y - tower.worldY) ** 2,
      );
      if (lineLen < 1) continue;

      const cross = Math.abs(
        (primaryPos.x - tower.worldX) * (tower.worldY - enemy.sprite.y) -
        (tower.worldX - enemy.sprite.x) * (primaryPos.y - tower.worldY),
      );
      const dist = cross / lineLen;
      if (dist > 32) continue;

      /* Apply pierce damage via hitscan (50% of base damage for balance). */
      const pierceDamage = Math.floor(effectiveDamage * 0.5);
      this.enemySystem.applyDamageToEnemy(enemy.instanceId, pierceDamage, 'physical');

      const pos = enemy.getPosition();
      const hitPayload: EnemyHitPayload = {
        enemyId: enemy.instanceId,
        projectileType: 'none',
        damage: pierceDamage,
        position: { x: pos.x, y: pos.y },
      };
      this.emit(GAME_EVENTS.ENEMY_HIT, hitPayload);
      pierced++;
    }
  }

  /**
   * Twin Shot secondary beam (Focused 4B): Fires a second hitscan beam at
   * a different enemy in range, or the same target if no other is available.
   */
  private fireHitscanSecondary(
    tower: PlacedTower,
    effectiveDamage: number,
    effectiveRange: number,
  ): void {
    const activeEnemies = this.enemySystem.getActiveEnemies();
    const rangeSq = effectiveRange * effectiveRange;

    /* Find any enemy in range (not the primary -- if possible). */
    let secondaryTarget: Enemy | null = null;
    for (const enemy of activeEnemies) {
      if (!enemy.isAlive()) continue;
      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      if (dx * dx + dy * dy > rangeSq) continue;
      secondaryTarget = enemy;
      break;
    }

    if (secondaryTarget) {
      this.fireHitscan(tower, secondaryTarget, effectiveDamage);
    }
  }

  /**
   * Burn Zone (Broadcast 4A): Applies a brief burn status effect to all
   * ground enemies currently within the tower's range.
   */
  private applyBurnZone(tower: PlacedTower, effectiveRange: number): void {
    if (!this.statusEffectSystem) return;

    const activeEnemies = this.enemySystem.getActiveEnemies();
    const rangeSq = effectiveRange * effectiveRange;

    for (const enemy of activeEnemies) {
      if (enemy.isFlying) continue;
      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      if (dx * dx + dy * dy > rangeSq) continue;

      this.statusEffectSystem.applyEffect(
        enemy.instanceId,
        'burn',
        BURN_ZONE_DURATION_SEC,
        BURN_ZONE_DPS,
        tower.instanceId,
      );
    }
  }

  /**
   * Frost Slow (Broadcast 4B): Applies a slow status effect to all
   * ground enemies currently within the tower's range.
   */
  private applyFrostSlow(tower: PlacedTower, effectiveRange: number): void {
    if (!this.statusEffectSystem) return;

    const activeEnemies = this.enemySystem.getActiveEnemies();
    const rangeSq = effectiveRange * effectiveRange;

    for (const enemy of activeEnemies) {
      if (enemy.isFlying) continue;
      const dx = enemy.sprite.x - tower.worldX;
      const dy = enemy.sprite.y - tower.worldY;
      if (dx * dx + dy * dy > rangeSq) continue;

      this.statusEffectSystem.applyEffect(
        enemy.instanceId,
        'slow',
        FROST_SLOW_DURATION_SEC,
        FROST_SLOW_MAGNITUDE,
        tower.instanceId,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Hover range circle
  // ---------------------------------------------------------------------------

  /**
   * Handles pointer move events to show/hide the hover range circle.
   * Only active when placement mode is NOT active and the game is running.
   */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.rangeGraphics || !this.combatActive) return;

    /* Check if placement mode is active -- do not show hover range during placement. */
    const placementSystem = this.scene.registry.get('towerPlacementSystem') as
      { isInPlacementMode(): boolean } | undefined;
    if (placementSystem?.isInPlacementMode()) {
      this.hideHoverRange();
      return;
    }

    /* Find if the pointer is over any placed tower sprite. */
    const towers = this.towerRegistry.getPlacedTowers();
    let found = false;

    for (const tower of towers) {
      const bounds = tower.sprite.getBounds();
      if (bounds.contains(pointer.worldX, pointer.worldY)) {
        this.showHoverRange(tower);
        found = true;
        break;
      }
    }

    if (!found) {
      this.hideHoverRange();
    }
  }

  /**
   * Draws the range circle for the given tower using its effective range.
   * Effective range accounts for upgrade tier, not just base definition.
   */
  private showHoverRange(tower: PlacedTower): void {
    if (!this.rangeGraphics) return;

    /* Skip redraw if already showing for this tower. */
    if (this.hoveredTowerId === tower.instanceId) return;

    this.hoveredTowerId = tower.instanceId;
    const stats = resolveEffectiveStats(tower, this.configManager);

    this.rangeGraphics.clear();
    this.rangeGraphics.lineStyle(RANGE_CIRCLE_LINE_WIDTH, 0xFFFFFF, RANGE_CIRCLE_ALPHA);
    this.rangeGraphics.strokeCircle(tower.worldX, tower.worldY, stats.range);
    this.rangeGraphics.setVisible(true);
  }

  /**
   * Hides the hover range circle.
   */
  private hideHoverRange(): void {
    if (this.hoveredTowerId === null) return;
    this.hoveredTowerId = null;
    if (this.rangeGraphics) {
      this.rangeGraphics.clear();
      this.rangeGraphics.setVisible(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /**
   * Halts all combat when GAME_OVER fires. In-flight projectiles will
   * complete their travel in ProjectileSystem, but no new firing occurs.
   */
  private onGameOver(): void {
    this.combatActive = false;
    this.hideHoverRange();
  }

  /**
   * Cleans up combat state when a tower is sold/removed.
   */
  private onTowerRemoved(payload: { towerId: string }): void {
    this.combatStates.delete(payload.towerId);
    if (this.hoveredTowerId === payload.towerId) {
      this.hideHoverRange();
    }
  }
}
