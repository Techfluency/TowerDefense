/**
 * Enemy entity class -- wraps a Phaser Sprite with per-instance state.
 *
 * Each active enemy on the field is an instance of this class. It holds
 * runtime state (currentHp, speed, waypoint index, state machine) and
 * exposes methods for damage calculation, position queries, and state
 * checks. The EnemySystem manages the lifecycle; Enemy never touches
 * the pool or event bus directly.
 *
 * Consumed by:
 * - EnemySystem (movement, rendering, spawn/death/breakthrough)
 * - BOLT-006 TowerCombatSystem (targeting queries, damage application)
 */
import Phaser from 'phaser';
import type { EnemyDefinition, MovementType, ShieldConfig } from '../types/game-types';

/**
 * Enemy state machine states.
 * MOVING -> DYING -> DEAD (death path)
 * MOVING -> BREAKTHROUGH (escaped path)
 */
export enum EnemyState {
  /** Actively following waypoints toward the objective. */
  MOVING = 'MOVING',
  /** HP reached zero; death tween is playing. */
  DYING = 'DYING',
  /** Death tween complete; released to pool. Terminal state. */
  DEAD = 'DEAD',
  /** Reached the objective tile; released to pool. Terminal state. */
  BREAKTHROUGH = 'BREAKTHROUGH',
}

/** Result of a takeDamage call -- tells the caller whether the enemy died. */
export interface DamageResult {
  /** True if this damage caused the enemy's HP to reach zero. */
  died: boolean;
  /** Actual damage dealt after armor and multiplier calculations. */
  actualDamage: number;
  /** True if this damage caused the shield to break (was active, now depleted). BOLT-017. */
  shieldBroken: boolean;
  /** Damage absorbed by the shield (0 if no shield). BOLT-017. */
  shieldDamage: number;
}

export class Enemy {
  /** Unique per-spawn instance ID (e.g., "enemy-42"). */
  public readonly instanceId: string;

  /** Archetype config this enemy was spawned from. */
  public readonly definition: EnemyDefinition;

  /** Shorthand for definition.movementType === 'flying'. */
  public readonly isFlying: boolean;

  /** The Phaser sprite representing this enemy on the field. */
  public readonly sprite: Phaser.GameObjects.Sprite;

  /** The wave number this enemy was spawned in. */
  public readonly waveNumber: number;

  /** Current hit points. When <= 0, the enemy is dead. */
  private currentHp: number;

  /** Maximum HP for this instance (base * wave scaling). */
  private readonly maxHp: number;

  /** Current movement speed in pixels per second (base * wave scaling). */
  public currentSpeed: number;

  /** Index into the waypoint array -- which waypoint we are heading toward. */
  public waypointIndex: number;

  /** Current state in the enemy state machine. */
  public state: EnemyState;

  /** Active hit flash timer, if any. Stored so we can reset on rapid hits. */
  public flashTimer: Phaser.Time.TimerEvent | null;

  // -- Shield state (BOLT-017) -----------------------------------------------

  /** Shield config from the enemy definition. Null if this enemy has no shield. */
  private readonly shieldConfig: ShieldConfig | null;

  /** Current shield HP. Zero means shield is depleted. */
  private shieldHp: number;

  /** Maximum shield HP for this instance. */
  private readonly maxShieldHp: number;

  /**
   * Seconds since the enemy last took damage. Tracked per-frame so
   * the system can trigger shield regen after the delay expires.
   */
  public timeSinceLastDamage: number;

  /** Whether the shield has been broken at least once (for VFX tracking). */
  public shieldWasBroken: boolean;

  // -- Aura state (BOLT-017) -------------------------------------------------

  /** Base speed before any aura buffs are applied. Stored to undo buffs. */
  public readonly baseSpeed: number;

  /** Set of support enemy instance IDs currently buffing this enemy. */
  public readonly activeAuraSources: Set<string>;

  /**
   * @param instanceId - Unique ID from IdGenerator.
   * @param definition - Archetype config from ConfigManager.
   * @param sprite - Sprite acquired from PoolManager.
   * @param hpMultiplier - Wave scaling multiplier for HP.
   * @param speedMultiplier - Wave scaling multiplier for speed.
   * @param waveNumber - The wave this enemy belongs to.
   */
  constructor(
    instanceId: string,
    definition: EnemyDefinition,
    sprite: Phaser.GameObjects.Sprite,
    hpMultiplier: number,
    speedMultiplier: number,
    waveNumber: number,
  ) {
    this.instanceId = instanceId;
    this.definition = definition;
    this.sprite = sprite;
    this.waveNumber = waveNumber;
    this.isFlying = definition.movementType === 'flying';

    /* Apply wave scaling to base stats. */
    this.maxHp = Math.floor(definition.baseHp * hpMultiplier);
    this.currentHp = this.maxHp;
    this.currentSpeed = definition.baseSpeed * speedMultiplier;
    this.baseSpeed = this.currentSpeed;

    this.waypointIndex = 0;
    this.state = EnemyState.MOVING;
    this.flashTimer = null;

    /* BOLT-017: Initialize shield state from definition config. */
    this.shieldConfig = definition.shield ?? null;
    this.maxShieldHp = this.shieldConfig?.maxShieldHp ?? 0;
    this.shieldHp = this.maxShieldHp;
    this.timeSinceLastDamage = Infinity; // No damage taken yet; regen timer irrelevant
    this.shieldWasBroken = false;

    /* BOLT-017: Initialize aura tracking for support buff stacking prevention. */
    this.activeAuraSources = new Set();
  }

  /**
   * Applies damage to this enemy using the damage formula:
   * 1. Look up damageType multiplier (default 1.0 if absent).
   * 2. adjusted = rawDamage * multiplier.
   * 3. afterArmor = adjusted - armor.
   * 4. final = max(1, floor(afterArmor)). Minimum 1 prevents invincibility.
   * 5. BOLT-017: If shield is active, damage hits shield first; overflow goes to HP.
   * 6. Subtract remaining damage from currentHp.
   *
   * @param rawDamage - Raw damage before multipliers and armor.
   * @param damageType - Damage type key for multiplier lookup (e.g., "physical").
   * @returns Whether the enemy died, actual damage dealt, and shield status.
   */
  takeDamage(rawDamage: number, damageType: string = 'physical'): DamageResult {
    if (!this.isAlive()) {
      return { died: false, actualDamage: 0, shieldBroken: false, shieldDamage: 0 };
    }

    /* Step 1: Damage type multiplier lookup. */
    const multipliers = this.definition.damageTypeMultipliers;
    const typeMultiplier = (multipliers && multipliers[damageType]) ?? 1.0;

    /* Step 2: Apply multiplier. */
    const adjusted = rawDamage * typeMultiplier;

    /* Step 3: Subtract armor (flat reduction). */
    const afterArmor = adjusted - this.definition.armor;

    /* Step 4: Clamp to minimum 1 damage, floor to integer. */
    const finalDamage = Math.max(1, Math.floor(afterArmor));

    /* Reset the shield regen timer on every hit. */
    this.timeSinceLastDamage = 0;

    /* Step 5 (BOLT-017): Shield absorbs damage first, overflow hits HP. */
    let shieldDamage = 0;
    let shieldBroken = false;
    let hpDamage = finalDamage;

    if (this.shieldHp > 0) {
      shieldDamage = Math.min(this.shieldHp, finalDamage);
      this.shieldHp -= shieldDamage;
      hpDamage = finalDamage - shieldDamage;

      /* Shield just broke -- flag for event emission by EnemySystem. */
      if (this.shieldHp <= 0) {
        shieldBroken = true;
        this.shieldWasBroken = true;
      }
    }

    /* Step 6: Apply remaining damage to HP. */
    this.currentHp = Math.max(0, this.currentHp - hpDamage);

    const died = this.currentHp <= 0;
    if (died) {
      this.state = EnemyState.DYING;
    }

    return { died, actualDamage: finalDamage, shieldBroken, shieldDamage };
  }

  /**
   * Returns whether the enemy is still alive (HP > 0 and not in a terminal state).
   */
  isAlive(): boolean {
    return this.currentHp > 0 && this.state === EnemyState.MOVING;
  }

  /**
   * Returns the enemy's current world-pixel position from its sprite.
   */
  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /**
   * Returns the ratio of current HP to max HP (0.0 to 1.0).
   * Used by the health bar renderer.
   */
  getHpRatio(): number {
    return this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
  }

  /**
   * Returns the enemy's movement type ('ground' or 'flying').
   * Used by tower targeting to filter out non-targetable enemies.
   */
  getMovementType(): MovementType {
    return this.definition.movementType;
  }

  /**
   * Returns current HP. Used for event payloads and debugging.
   */
  getCurrentHp(): number {
    return this.currentHp;
  }

  /**
   * Returns max HP. Used for event payloads and debugging.
   */
  getMaxHp(): number {
    return this.maxHp;
  }

  // ---------------------------------------------------------------------------
  // Shield API (BOLT-017)
  // ---------------------------------------------------------------------------

  /**
   * Returns whether this enemy has a shield configured (even if depleted).
   */
  hasShield(): boolean {
    return this.shieldConfig !== null;
  }

  /**
   * Returns whether the shield is currently active (HP > 0).
   */
  isShieldActive(): boolean {
    return this.shieldHp > 0;
  }

  /**
   * Returns current shield HP. Zero if no shield or shield is broken.
   */
  getShieldHp(): number {
    return this.shieldHp;
  }

  /**
   * Returns maximum shield HP. Zero if no shield configured.
   */
  getMaxShieldHp(): number {
    return this.maxShieldHp;
  }

  /**
   * Returns shield HP ratio (0.0 to 1.0). Used by shield bar renderer.
   */
  getShieldRatio(): number {
    return this.maxShieldHp > 0 ? this.shieldHp / this.maxShieldHp : 0;
  }

  /**
   * Regenerates shield HP by the given amount. Caps at maxShieldHp.
   * Called by EnemySystem once the regen delay has elapsed.
   *
   * @param amount - HP to restore to the shield.
   * @returns True if the shield just reached full HP (for regen-complete VFX).
   */
  regenShield(amount: number): boolean {
    if (!this.shieldConfig || this.shieldHp >= this.maxShieldHp) return false;
    const wasDepleted = this.shieldHp <= 0;
    this.shieldHp = Math.min(this.maxShieldHp, this.shieldHp + amount);
    /* Return true if shield just became active from zero. */
    return wasDepleted && this.shieldHp > 0;
  }

  /**
   * Returns the shield regen delay in seconds, or 0 if no shield.
   */
  getShieldRegenDelay(): number {
    return this.shieldConfig?.regenDelaySec ?? 0;
  }

  /**
   * Returns the shield regen rate in HP/sec, or 0 if no shield.
   */
  getShieldRegenRate(): number {
    return this.shieldConfig?.regenRatePerSec ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Aura API (BOLT-017)
  // ---------------------------------------------------------------------------

  /**
   * Returns whether this enemy has an aura configuration (Support Unit).
   */
  hasAura(): boolean {
    return this.definition.aura !== null && this.definition.aura !== undefined;
  }

  /**
   * Returns the aura radius in pixels, or 0 if no aura.
   */
  getAuraRadius(): number {
    return this.definition.aura?.radiusPx ?? 0;
  }

  /**
   * Returns the aura speed multiplier, or 1.0 if no aura.
   */
  getAuraSpeedMultiplier(): number {
    return this.definition.aura?.speedMultiplier ?? 1.0;
  }
}
