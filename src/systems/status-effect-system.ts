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

/**
 * BOLT-026: Maximum total slow percentage from all sources combined.
 * Prevents enemy speed from being reduced below 50% of base speed.
 */
const MAX_SLOW_PERCENT = 0.50;

/** Internal state for tracking active effects on a single enemy. */
interface EnemyEffectState {
  /** Active non-slow status effects keyed by effect type. */
  effects: Map<StatusEffectType, StatusEffect>;
  /**
   * BOLT-026: Multiple slow sources tracked individually (keyed by sourceTowerId).
   * Each entry has its own duration and magnitude. Combined slow is capped at 50%.
   */
  slowSources: Map<string, StatusEffect>;
  /**
   * The enemy's base speed before any slow was applied. Used to recompute
   * speed each frame from the combined slow percentage. Only set while
   * at least one slow source is active.
   */
  baseSpeed?: number;
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
      /* Process each active non-slow effect on this enemy. */
      for (const [type, effect] of state.effects) {
        effect.remainingDuration -= dt;

        if (effect.remainingDuration <= 0) {
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

      /* BOLT-026: Process slow sources independently, each with its own timer. */
      let slowChanged = false;
      for (const [sourceId, slowEffect] of state.slowSources) {
        slowEffect.remainingDuration -= dt;
        if (slowEffect.remainingDuration <= 0) {
          state.slowSources.delete(sourceId);
          slowChanged = true;
        }
      }

      /* Recompute combined slow when any source expired. */
      if (slowChanged) {
        this.recomputeEnemySpeed(enemyId, state);
      }

      /* Clean up entry if no effects or slow sources remain. */
      if (state.effects.size === 0 && state.slowSources.size === 0) {
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
      state = { effects: new Map(), slowSources: new Map(), burnTickAccumulator: 0 };
      this.enemyEffects.set(enemyId, state);
    }

    /* BOLT-026: Slow effects are tracked per-source for additive stacking with cap. */
    if (type === 'slow') {
      const existing = state.slowSources.get(sourceTowerId);
      if (existing) {
        /* Refresh duration for this source without changing magnitude. */
        existing.remainingDuration = duration;
        existing.totalDuration = duration;
        return;
      }

      /* New slow source -- add and recompute. */
      const effect: StatusEffect = {
        type: 'slow',
        remainingDuration: duration,
        totalDuration: duration,
        magnitude,
        sourceTowerId,
      };
      state.slowSources.set(sourceTowerId, effect);
      this.recomputeEnemySpeed(enemyId, state);
      return;
    }

    /* Non-slow effects: one per type, refresh on re-apply. */
    const existing = state.effects.get(type);
    if (existing) {
      existing.remainingDuration = duration;
      existing.totalDuration = duration;
      existing.sourceTowerId = sourceTowerId;
      return;
    }

    const effect: StatusEffect = {
      type,
      remainingDuration: duration,
      totalDuration: duration,
      magnitude,
      sourceTowerId,
    };
    state.effects.set(type, effect);
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
    if (!state) return false;
    /* BOLT-026: Slow effects are in slowSources, not effects. */
    if (type === 'slow') return state.slowSources.size > 0;
    return state.effects.has(type);
  }

  /**
   * Returns all active effects on an enemy (for UI/VFX queries).
   * BOLT-026: Includes slow sources as individual entries.
   *
   * @param enemyId - Instance ID of the enemy.
   * @returns Array of active StatusEffects, or empty array if none.
   */
  getEffects(enemyId: string): StatusEffect[] {
    const state = this.enemyEffects.get(enemyId);
    if (!state) return [];
    return [...state.effects.values(), ...state.slowSources.values()];
  }

  /**
   * Removes all effects from an enemy. Called on enemy death/removal.
   *
   * @param enemyId - Instance ID of the enemy.
   */
  clearEffects(enemyId: string): void {
    const state = this.enemyEffects.get(enemyId);
    if (!state) return;

    /* BOLT-026: Restore base speed if any slow sources were active. */
    if (state.slowSources.size > 0 && state.baseSpeed !== undefined) {
      this.restoreEnemySpeed(enemyId, state);
    }

    state.effects.clear();
    state.slowSources.clear();
    this.enemyEffects.delete(enemyId);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * BOLT-026: Recomputes the enemy's speed from all active slow sources.
   * Uses additive slow percentages capped at MAX_SLOW_PERCENT (50%).
   * Magnitude is a speed multiplier (0.95 = 5% slow, 0.70 = 30% slow).
   * Slow percentage = 1 - magnitude. Combined = sum of all slow percentages, capped.
   */
  private recomputeEnemySpeed(
    enemyId: string,
    state: EnemyEffectState,
  ): void {
    if (!this.enemySystem) return;

    const enemies = this.enemySystem.getActiveEnemies();
    const enemy = enemies.find(e => e.instanceId === enemyId);
    if (!enemy) return;

    /* Capture base speed on first slow application. */
    if (state.baseSpeed === undefined) {
      state.baseSpeed = enemy.currentSpeed;
    }

    if (state.slowSources.size === 0) {
      /* No slow sources left -- restore base speed. */
      enemy.currentSpeed = state.baseSpeed;
      state.baseSpeed = undefined;
      return;
    }

    /* Sum slow percentages from all active sources. */
    let totalSlowPercent = 0;
    for (const slowEffect of state.slowSources.values()) {
      totalSlowPercent += (1 - slowEffect.magnitude);
    }

    /* Cap total slow at MAX_SLOW_PERCENT. */
    totalSlowPercent = Math.min(MAX_SLOW_PERCENT, totalSlowPercent);

    /* Apply combined slow to base speed. */
    enemy.currentSpeed = state.baseSpeed * (1 - totalSlowPercent);
  }

  /**
   * Restores an enemy's speed after all slow effects expire.
   */
  private restoreEnemySpeed(
    enemyId: string,
    state: EnemyEffectState,
  ): void {
    if (!this.enemySystem || state.baseSpeed === undefined) return;

    const enemies = this.enemySystem.getActiveEnemies();
    const enemy = enemies.find(e => e.instanceId === enemyId);
    if (!enemy) return;

    enemy.currentSpeed = state.baseSpeed;
    state.baseSpeed = undefined;
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
   * Removes a specific non-slow effect type from an enemy.
   * Slow effects are managed via slowSources and recomputeEnemySpeed.
   */
  private removeEffect(
    _enemyId: string,
    type: StatusEffectType,
    state: EnemyEffectState,
  ): void {
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
