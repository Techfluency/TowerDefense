/**
 * Status effect system -- manages temporary buffs/debuffs on enemies.
 *
 * BOLT-019: Tier 4 tower branches introduce status effects:
 * - SLOW (Frost Wave 4B Broadcast): reduces enemy speed by a multiplier
 * - BURN (Inferno Blast 4A Broadcast): deals damage-over-time to enemies
 *
 * Design decisions:
 * - Effects are stored per-enemy with a duration timer.
 * - Multiple effects of the same type do NOT stack; the freshest one refreshes duration.
 * - SLOW modifies enemy.currentSpeed; BURN calls applyDamageToEnemy() per tick.
 * - The system is update()-driven: each frame decrements timers and applies effects.
 * - When a SLOW effect expires, the enemy's speed is restored to its pre-slow value.
 *
 * Priority 5 in system update order -- after TowerCombatSystem (which applies effects)
 * and before UpgradeSystem (which only handles UI).
 *
 * Registers on Phaser registry at key 'statusEffectSystem'.
 */
import { BaseSystem } from './base-system';
import type { StatusEffect, StatusEffectType } from '../types/game-types';
import { GAME_EVENTS } from '../types/game-types';
import type { EnemySystem } from './enemy-system';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Burn damage ticks per second (applies damage 4x/s for smooth DPS). */
const BURN_TICKS_PER_SECOND = 4;

/** Minimum interval between burn damage ticks in seconds. */
const BURN_TICK_INTERVAL = 1 / BURN_TICKS_PER_SECOND;

// ---------------------------------------------------------------------------
// Per-enemy effect tracking
// ---------------------------------------------------------------------------

/** Internal state for tracking active effects on a single enemy. */
interface EnemyEffectState {
  /** Active status effects keyed by effect type (max one per type). */
  effects: Map<StatusEffectType, StatusEffect>;
  /**
   * The enemy's speed before any slow was applied. Used to restore speed
   * when the slow effect expires. Only set while a slow is active.
   */
  preSlowSpeed?: number;
  /** Accumulator for burn tick timing (seconds since last burn tick). */
  burnTickAccumulator: number;
}

export class StatusEffectSystem extends BaseSystem {
  /** Per-enemy effect state keyed by enemy instanceId. */
  private readonly enemyEffects = new Map<string, EnemyEffectState>();

  /** Reference to EnemySystem for damage application and active enemy queries. */
  private enemySystem: EnemySystem | null = null;

  /**
   * Initializes the system, registers on the Phaser registry,
   * and resolves cross-system references.
   */
  init(): void {
    this.scene.registry.set('statusEffectSystem', this);

    /* Resolve EnemySystem reference for damage application. */
    this.enemySystem = (this.scene.registry.get('enemySystem') as EnemySystem) ?? null;

    /* Clean up effect state when enemies die or break through. */
    this.listen(GAME_EVENTS.ENEMY_DIED, this.onEnemyRemoved as (...args: never[]) => void);
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);
  }

  /**
   * Per-frame update: decrements effect durations, applies burn damage,
   * and removes expired effects.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    for (const [enemyId, state] of this.enemyEffects) {
      /* Process each active effect on this enemy. */
      for (const [type, effect] of state.effects) {
        /* Decrement remaining duration. */
        effect.remainingDuration -= dt;

        if (effect.remainingDuration <= 0) {
          /* Effect expired -- remove it and undo any persistent changes. */
          this.removeEffect(enemyId, type, state);
          continue;
        }

        /* Apply per-tick behavior for burn effects. */
        if (type === 'burn') {
          state.burnTickAccumulator += dt;
          while (state.burnTickAccumulator >= BURN_TICK_INTERVAL) {
            state.burnTickAccumulator -= BURN_TICK_INTERVAL;
            this.applyBurnTick(enemyId, effect);
          }
        }
      }

      /* Clean up entry if no effects remain. */
      if (state.effects.size === 0) {
        this.enemyEffects.delete(enemyId);
      }
    }
  }

  /**
   * Cleans up all tracked effect states on system destruction.
   */
  destroy(): void {
    this.enemyEffects.clear();
    this.scene.registry.remove('statusEffectSystem');
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Applies a status effect to an enemy. If the same effect type is already
   * active, refreshes the duration (does not stack magnitude).
   *
   * @param enemyId - Instance ID of the target enemy.
   * @param type - Effect type ('slow' or 'burn').
   * @param duration - Effect duration in seconds.
   * @param magnitude - Effect strength (slow: speed multiplier; burn: DPS).
   * @param sourceTowerId - ID of the tower that applied this effect.
   */
  applyEffect(
    enemyId: string,
    type: StatusEffectType,
    duration: number,
    magnitude: number,
    sourceTowerId: string,
  ): void {
    let state = this.enemyEffects.get(enemyId);
    if (!state) {
      state = { effects: new Map(), burnTickAccumulator: 0 };
      this.enemyEffects.set(enemyId, state);
    }

    const existing = state.effects.get(type);
    if (existing) {
      /* Refresh duration without stacking magnitude. */
      existing.remainingDuration = duration;
      existing.totalDuration = duration;
      existing.sourceTowerId = sourceTowerId;
      return;
    }

    /* Apply new effect. */
    const effect: StatusEffect = {
      type,
      remainingDuration: duration,
      totalDuration: duration,
      magnitude,
      sourceTowerId,
    };
    state.effects.set(type, effect);

    /* For slow effects, capture the enemy's current speed and apply the reduction. */
    if (type === 'slow') {
      this.applySlowToEnemy(enemyId, magnitude, state);
    }
  }

  /**
   * Returns whether an enemy currently has a specific status effect active.
   *
   * @param enemyId - Instance ID of the enemy.
   * @param type - Effect type to check.
   * @returns True if the effect is currently active on the enemy.
   */
  hasEffect(enemyId: string, type: StatusEffectType): boolean {
    const state = this.enemyEffects.get(enemyId);
    return state?.effects.has(type) ?? false;
  }

  /**
   * Returns all active effects on an enemy (for UI/VFX queries).
   *
   * @param enemyId - Instance ID of the enemy.
   * @returns Array of active StatusEffects, or empty array if none.
   */
  getEffects(enemyId: string): StatusEffect[] {
    const state = this.enemyEffects.get(enemyId);
    if (!state) return [];
    return [...state.effects.values()];
  }

  /**
   * Removes all effects from an enemy. Called on enemy death/removal.
   *
   * @param enemyId - Instance ID of the enemy.
   */
  clearEffects(enemyId: string): void {
    const state = this.enemyEffects.get(enemyId);
    if (!state) return;

    /* Restore speed before clearing slow effects. */
    if (state.effects.has('slow') && state.preSlowSpeed !== undefined) {
      this.restoreEnemySpeed(enemyId, state);
    }

    state.effects.clear();
    this.enemyEffects.delete(enemyId);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Applies the slow speed reduction to an enemy.
   * Captures the pre-slow speed so it can be restored when the effect expires.
   */
  private applySlowToEnemy(
    enemyId: string,
    magnitude: number,
    state: EnemyEffectState,
  ): void {
    if (!this.enemySystem) return;

    const enemies = this.enemySystem.getActiveEnemies();
    const enemy = enemies.find(e => e.instanceId === enemyId);
    if (!enemy) return;

    /* Store the speed to restore later (use baseSpeed to avoid aura interactions). */
    state.preSlowSpeed = enemy.currentSpeed;

    /* Apply the slow multiplier. magnitude is the target speed ratio (e.g., 0.7 for 30% slow). */
    enemy.currentSpeed = enemy.currentSpeed * magnitude;
  }

  /**
   * Restores an enemy's speed after a slow effect expires.
   */
  private restoreEnemySpeed(
    enemyId: string,
    state: EnemyEffectState,
  ): void {
    if (!this.enemySystem || state.preSlowSpeed === undefined) return;

    const enemies = this.enemySystem.getActiveEnemies();
    const enemy = enemies.find(e => e.instanceId === enemyId);
    if (!enemy) return;

    enemy.currentSpeed = state.preSlowSpeed;
    state.preSlowSpeed = undefined;
  }

  /**
   * Applies one tick of burn damage to an enemy.
   * DPS is divided by BURN_TICKS_PER_SECOND for per-tick damage.
   */
  private applyBurnTick(enemyId: string, effect: StatusEffect): void {
    if (!this.enemySystem) return;

    /* Convert DPS to per-tick damage. */
    const tickDamage = effect.magnitude / BURN_TICKS_PER_SECOND;
    this.enemySystem.applyDamageToEnemy(enemyId, tickDamage, 'fire');
  }

  /**
   * Removes a specific effect type from an enemy and undoes persistent changes.
   */
  private removeEffect(
    enemyId: string,
    type: StatusEffectType,
    state: EnemyEffectState,
  ): void {
    if (type === 'slow') {
      this.restoreEnemySpeed(enemyId, state);
    }

    state.effects.delete(type);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** Clean up effects when an enemy dies. */
  private onEnemyRemoved(payload: { enemyId: string }): void {
    this.clearEffects(payload.enemyId);
  }

  /** Clear all tracked effects on game over. */
  private onGameOver(): void {
    this.enemyEffects.clear();
  }
}
