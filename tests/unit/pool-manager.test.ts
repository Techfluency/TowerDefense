/**
 * Unit tests for PoolManager.
 *
 * Tests the acquire/release lifecycle, pre-allocation, pool exhaustion,
 * and entity counting. Mocks Phaser's Scene and Group APIs since unit
 * tests run in Node without WebGL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Mock Phaser before importing PoolManager -- Phaser requires browser APIs. */
vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Sprite: class {},
      Group: class {},
    },
  },
}));

import { PoolManager } from '../../src/utils/pool-manager';
import type { PoolConfig } from '../../src/utils/pool-manager';

/**
 * Creates a mock sprite with the Phaser sprite interface methods
 * used by PoolManager.
 */
function createMockSprite(active = false) {
  return {
    active,
    visible: active,
    x: 0,
    y: 0,
    texture: { key: '' },
    setActive: vi.fn(function (this: { active: boolean }, val: boolean) {
      this.active = val;
      return this;
    }),
    setVisible: vi.fn(function (this: { visible: boolean }, val: boolean) {
      this.visible = val;
      return this;
    }),
    setPosition: vi.fn(function (this: { x: number; y: number }, x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }),
    setTexture: vi.fn(function (this: { texture: { key: string } }, key: string) {
      this.texture.key = key;
      return this;
    }),
  };
}

/**
 * Creates a mock Phaser scene with a mock Group factory.
 * The mock Group tracks sprites and supports getFirstDead, countActive, destroy.
 */
function createMockScene() {
  const groups: Array<{
    sprites: ReturnType<typeof createMockSprite>[];
    maxSize: number;
  }> = [];

  return {
    add: {
      group: vi.fn((config: { maxSize: number }) => {
        const groupData = { sprites: [] as ReturnType<typeof createMockSprite>[], maxSize: config.maxSize };
        groups.push(groupData);

        return {
          get maxSize() {
            return groupData.maxSize;
          },
          add: vi.fn((sprite: ReturnType<typeof createMockSprite>) => {
            groupData.sprites.push(sprite);
          }),
          getFirstDead: vi.fn((_create: boolean) => {
            return groupData.sprites.find((s) => !s.active) ?? null;
          }),
          countActive: vi.fn((active: boolean) => {
            return groupData.sprites.filter((s) => s.active === active).length;
          }),
          destroy: vi.fn(),
        };
      }),
      sprite: vi.fn((_x: number, _y: number, _key: string) => {
        return createMockSprite(false);
      }),
    },
    _groups: groups,
  } as never;
}

const smallConfig: PoolConfig = {
  enemyPoolSize: 3,
  projectilePoolSize: 2,
  defaultEnemySpriteKey: 'enemy-runner',
  defaultProjectileSpriteKey: 'projectile-arrow',
};

describe('PoolManager', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let poolManager: PoolManager;

  beforeEach(() => {
    mockScene = createMockScene();
    poolManager = new PoolManager(mockScene as never, smallConfig);
  });

  describe('pre-allocation', () => {
    it('should create enemy pool with correct pre-allocation count', () => {
      /* scene.add.sprite is called for each pre-allocated sprite. */
      const spriteCallCount = (mockScene.add.sprite as ReturnType<typeof vi.fn>).mock.calls.length;
      /* 3 enemies + 2 projectiles = 5 total sprites created. */
      expect(spriteCallCount).toBe(5);
    });

    it('should create two pools (enemy and projectile)', () => {
      expect((mockScene.add.group as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });
  });

  describe('acquireEnemy', () => {
    it('should return a sprite when pool has available instances', () => {
      const sprite = poolManager.acquireEnemy('enemy-runner', 100, 200);
      expect(sprite).not.toBeNull();
    });

    it('should set the sprite position and texture', () => {
      const sprite = poolManager.acquireEnemy('enemy-tank', 150, 250);
      expect(sprite).not.toBeNull();
      expect(sprite!.setTexture).toHaveBeenCalledWith('enemy-tank');
      expect(sprite!.setPosition).toHaveBeenCalledWith(150, 250);
      expect(sprite!.setActive).toHaveBeenCalledWith(true);
      expect(sprite!.setVisible).toHaveBeenCalledWith(true);
    });

    it('should return null when pool is exhausted', () => {
      /* Acquire all 3 enemies. */
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);

      /* Fourth acquire should return null. */
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = poolManager.acquireEnemy('enemy-runner', 0, 0);
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('releaseEnemy', () => {
    it('should deactivate and hide the sprite', () => {
      const sprite = poolManager.acquireEnemy('enemy-runner', 100, 200);
      expect(sprite).not.toBeNull();

      poolManager.releaseEnemy(sprite!);
      expect(sprite!.setActive).toHaveBeenCalledWith(false);
      expect(sprite!.setVisible).toHaveBeenCalledWith(false);
    });

    it('should allow the sprite to be reacquired after release', () => {
      /* Acquire all 3. */
      const sprite1 = poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);

      /* Release one. */
      poolManager.releaseEnemy(sprite1!);

      /* Should now be able to acquire again. */
      const reacquired = poolManager.acquireEnemy('enemy-tank', 50, 50);
      expect(reacquired).not.toBeNull();
    });
  });

  describe('acquireProjectile', () => {
    it('should return a sprite from the projectile pool', () => {
      const sprite = poolManager.acquireProjectile('projectile-arrow', 10, 20);
      expect(sprite).not.toBeNull();
      expect(sprite!.setTexture).toHaveBeenCalledWith('projectile-arrow');
    });

    it('should return null when projectile pool is exhausted', () => {
      poolManager.acquireProjectile('projectile-arrow', 0, 0);
      poolManager.acquireProjectile('projectile-arrow', 0, 0);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = poolManager.acquireProjectile('projectile-arrow', 0, 0);
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('releaseProjectile', () => {
    it('should deactivate the projectile sprite', () => {
      const sprite = poolManager.acquireProjectile('projectile-arrow', 10, 20);
      poolManager.releaseProjectile(sprite!);
      expect(sprite!.setActive).toHaveBeenCalledWith(false);
      expect(sprite!.setVisible).toHaveBeenCalledWith(false);
    });
  });

  describe('entity counting', () => {
    it('should report active enemy count', () => {
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      expect(poolManager.getActiveEnemyCount()).toBe(2);
    });

    it('should report active projectile count', () => {
      poolManager.acquireProjectile('projectile-arrow', 0, 0);
      expect(poolManager.getActiveProjectileCount()).toBe(1);
    });

    it('should decrement count after release', () => {
      const sprite = poolManager.acquireEnemy('enemy-runner', 0, 0);
      poolManager.acquireEnemy('enemy-runner', 0, 0);
      expect(poolManager.getActiveEnemyCount()).toBe(2);

      poolManager.releaseEnemy(sprite!);
      expect(poolManager.getActiveEnemyCount()).toBe(1);
    });
  });
});
