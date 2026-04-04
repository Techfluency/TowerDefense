/**
 * Projectile entity class -- wraps a Phaser Sprite with per-instance state.
 *
 * Each active projectile in flight is an instance of this class. It holds
 * the target reference, speed, damage payload, and tracks whether the
 * target has died mid-flight (orphaned). The ProjectileSystem manages
 * movement and lifecycle; Projectile never touches the pool or event bus.
 *
 * Follows the same entity-wraps-sprite pattern as Enemy (BOLT-003).
 *
 * Consumed by:
 * - ProjectileSystem (movement, collision, pool release)
 * - TowerCombatSystem (creation on tower fire)
 */
import Phaser from 'phaser';

export class Projectile {
  /** The pooled Phaser sprite representing this projectile in flight. */
  public readonly sprite: Phaser.GameObjects.Sprite;

  /** Instance ID of the target enemy. Used to look up the enemy each frame. */
  public readonly targetId: string;

  /**
   * Last known world position of the target. Updated each frame while the
   * target is alive. Used as the destination if the target dies mid-flight.
   */
  public targetLastPosition: { x: number; y: number };

  /** Travel speed in pixels per second (from ProjectileDefinition). */
  public readonly speed: number;

  /** Raw damage to apply on hit (from TowerDefinition). */
  public readonly damage: number;

  /** Damage type key for multiplier lookup (default "physical"). */
  public readonly damageType: string;

  /** TowerDefinition.id -- included in event payloads. */
  public readonly towerType: string;

  /** ProjectileDefinition.id -- included in event payloads. */
  public readonly projectileType: string;

  /** True if the target died while this projectile was in flight. */
  public isOrphaned: boolean;

  /**
   * @param sprite - Pooled sprite acquired from PoolManager.
   * @param targetId - Instance ID of the target enemy.
   * @param targetPosition - Initial world position of the target.
   * @param speed - Pixels per second (from ProjectileDefinition).
   * @param damage - Raw damage to apply on hit (from TowerDefinition).
   * @param damageType - Damage type key (default "physical").
   * @param towerType - TowerDefinition.id for event payloads.
   * @param projectileType - ProjectileDefinition.id for event payloads.
   */
  constructor(
    sprite: Phaser.GameObjects.Sprite,
    targetId: string,
    targetPosition: { x: number; y: number },
    speed: number,
    damage: number,
    damageType: string,
    towerType: string,
    projectileType: string,
  ) {
    this.sprite = sprite;
    this.targetId = targetId;
    this.targetLastPosition = { x: targetPosition.x, y: targetPosition.y };
    this.speed = speed;
    this.damage = damage;
    this.damageType = damageType;
    this.towerType = towerType;
    this.projectileType = projectileType;
    this.isOrphaned = false;
  }
}
