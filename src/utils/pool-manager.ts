/**
 * Typed object pool manager for enemy and projectile sprites.
 *
 * Wraps Phaser Groups with typed acquire/release methods, pre-allocation,
 * and overflow logging. This prevents garbage collection pauses during
 * heavy wave combat by reusing sprite instances instead of allocating
 * new ones per spawn.
 *
 * Performance budget: 100 concurrent enemies, 50 concurrent projectiles.
 * Pools are pre-allocated to these sizes at Gameplay scene init.
 */
import Phaser from 'phaser';

/**
 * Configuration for pool sizes and default sprite keys.
 * Passed to PoolManager constructor.
 */
export interface PoolConfig {
  /** Pre-allocated enemy pool capacity. Default 100. */
  enemyPoolSize: number;
  /** Pre-allocated projectile pool capacity. Default 50. */
  projectilePoolSize: number;
  /** Fallback texture key for enemies without a specific sprite. */
  defaultEnemySpriteKey: string;
  /** Fallback texture key for projectiles without a specific sprite. */
  defaultProjectileSpriteKey: string;
}

/** Default pool configuration matching performance budget constants. */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  enemyPoolSize: 100,
  projectilePoolSize: 50,
  defaultEnemySpriteKey: 'enemy-runner',
  defaultProjectileSpriteKey: 'projectile-arrow',
};

export class PoolManager {
  private readonly scene: Phaser.Scene;
  private readonly enemyPool: Phaser.GameObjects.Group;
  private readonly projectilePool: Phaser.GameObjects.Group;

  /**
   * Creates enemy and projectile pools with pre-allocation.
   *
   * @param scene - The Gameplay scene. Groups are owned by this scene.
   * @param config - Pool sizing and default sprite configuration.
   */
  constructor(scene: Phaser.Scene, config: PoolConfig = DEFAULT_POOL_CONFIG) {
    this.scene = scene;

    /* Create enemy pool with pre-allocated inactive sprites.
     * maxSize prevents unbounded growth -- acquire returns null at capacity. */
    this.enemyPool = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: config.enemyPoolSize,
      runChildUpdate: false,
    });
    this.preallocate(this.enemyPool, config.enemyPoolSize, config.defaultEnemySpriteKey);

    /* Create projectile pool with pre-allocated inactive sprites. */
    this.projectilePool = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: config.projectilePoolSize,
      runChildUpdate: false,
    });
    this.preallocate(this.projectilePool, config.projectilePoolSize, config.defaultProjectileSpriteKey);
  }

  /**
   * Acquires an enemy sprite from the pool, activating it at the given position.
   *
   * @param typeKey - Texture key for the enemy type (e.g., "enemy-runner").
   * @param x - World X position to place the sprite.
   * @param y - World Y position to place the sprite.
   * @returns The activated sprite, or null if the pool is exhausted.
   */
  acquireEnemy(typeKey: string, x: number, y: number): Phaser.GameObjects.Sprite | null {
    return this.acquireFromPool(this.enemyPool, typeKey, x, y, 'enemy');
  }

  /**
   * Returns an enemy sprite to the pool, deactivating and hiding it.
   *
   * @param sprite - The sprite to release back to the pool.
   */
  releaseEnemy(sprite: Phaser.GameObjects.Sprite): void {
    this.releaseToPool(sprite);
  }

  /**
   * Acquires a projectile sprite from the pool.
   *
   * @param typeKey - Texture key for the projectile type (e.g., "projectile-arrow").
   * @param x - World X position.
   * @param y - World Y position.
   * @returns The activated sprite, or null if the pool is exhausted.
   */
  acquireProjectile(typeKey: string, x: number, y: number): Phaser.GameObjects.Sprite | null {
    return this.acquireFromPool(this.projectilePool, typeKey, x, y, 'projectile');
  }

  /**
   * Returns a projectile sprite to the pool.
   *
   * @param sprite - The sprite to release.
   */
  releaseProjectile(sprite: Phaser.GameObjects.Sprite): void {
    this.releaseToPool(sprite);
  }

  /**
   * Count of currently active (visible) enemy sprites.
   * Used by the debug overlay for entity count display.
   */
  getActiveEnemyCount(): number {
    return this.enemyPool.countActive(true);
  }

  /**
   * Count of currently active (visible) projectile sprites.
   * Used by the debug overlay for entity count display.
   */
  getActiveProjectileCount(): number {
    return this.projectilePool.countActive(true);
  }

  /**
   * Destroys all pools and their sprites. Called on scene shutdown
   * to free resources and prevent memory leaks across scene restarts.
   */
  destroyAll(): void {
    this.enemyPool.destroy(true);
    this.projectilePool.destroy(true);
  }

  /**
   * Pre-allocates inactive sprites in a pool so they are ready for
   * instant acquisition without runtime allocation.
   *
   * @param pool - The Phaser Group to populate.
   * @param count - Number of sprites to pre-allocate.
   * @param textureKey - Default texture for the pre-allocated sprites.
   */
  private preallocate(
    pool: Phaser.GameObjects.Group,
    count: number,
    textureKey: string,
  ): void {
    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add.sprite(0, 0, textureKey);
      sprite.setActive(false);
      sprite.setVisible(false);
      pool.add(sprite);
    }
  }

  /**
   * Acquires a sprite from a pool, activating and positioning it.
   * If the pool is exhausted, logs a warning and returns null.
   *
   * @param pool - The pool to acquire from.
   * @param textureKey - Texture to apply to the acquired sprite.
   * @param x - World X position.
   * @param y - World Y position.
   * @param poolName - Name for logging (e.g., "enemy", "projectile").
   * @returns The activated sprite, or null if exhausted.
   */
  private acquireFromPool(
    pool: Phaser.GameObjects.Group,
    textureKey: string,
    x: number,
    y: number,
    poolName: string,
  ): Phaser.GameObjects.Sprite | null {
    /* getFirstDead returns an inactive sprite, or null if all are active. */
    const sprite = pool.getFirstDead(false) as Phaser.GameObjects.Sprite | null;

    if (!sprite) {
      console.warn(
        `PoolManager: ${poolName} pool exhausted (max: ${pool.maxSize}). ` +
        'Consider increasing pool size or checking for release leaks.',
      );
      return null;
    }

    sprite.setTexture(textureKey);
    sprite.setPosition(x, y);
    sprite.setActive(true);
    sprite.setVisible(true);

    return sprite;
  }

  /**
   * Returns a sprite to its pool by deactivating and hiding it.
   * The sprite remains in the group for future reuse.
   *
   * @param sprite - The sprite to deactivate.
   */
  private releaseToPool(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setActive(false);
    sprite.setVisible(false);
    /* Reset position to origin to prevent stale collision checks. */
    sprite.setPosition(0, 0);
  }
}
