/**
 * Unit tests for the Projectile entity class.
 *
 * Tests constructor initialization, orphan state tracking, and field
 * storage. Mirrors the Enemy entity test pattern.
 */
import { describe, it, expect } from 'vitest';
import { Projectile } from '../../src/entities/projectile';

/** Creates a minimal mock sprite for testing. */
function createMockSprite(x = 0, y = 0) {
  return {
    x,
    y,
    rotation: 0,
    setDepth: () => {},
    setOrigin: () => {},
    setRotation: (r: number) => { (mock as { rotation: number }).rotation = r; },
    setActive: () => {},
    setVisible: () => {},
    setTexture: () => {},
    setPosition: () => {},
    setAlpha: () => {},
    setScale: () => {},
    clearTint: () => {},
  };
  const mock = arguments.callee;
}

describe('Projectile', () => {
  function createProjectile(overrides?: Partial<{
    targetId: string;
    targetPos: { x: number; y: number };
    speed: number;
    damage: number;
    damageType: string;
    towerType: string;
    projectileType: string;
  }>): Projectile {
    const sprite = createMockSprite(100, 200);
    return new Projectile(
      sprite as never,
      overrides?.targetId ?? 'enemy-1',
      overrides?.targetPos ?? { x: 300, y: 400 },
      overrides?.speed ?? 400,
      overrides?.damage ?? 10,
      overrides?.damageType ?? 'physical',
      overrides?.towerType ?? 'ranged',
      overrides?.projectileType ?? 'arrow',
    );
  }

  it('should store all constructor parameters', () => {
    const proj = createProjectile();
    expect(proj.targetId).toBe('enemy-1');
    expect(proj.speed).toBe(400);
    expect(proj.damage).toBe(10);
    expect(proj.damageType).toBe('physical');
    expect(proj.towerType).toBe('ranged');
    expect(proj.projectileType).toBe('arrow');
  });

  it('should initialize with isOrphaned = false', () => {
    const proj = createProjectile();
    expect(proj.isOrphaned).toBe(false);
  });

  it('should copy target position (not reference)', () => {
    const originalPos = { x: 300, y: 400 };
    const proj = createProjectile({ targetPos: originalPos });

    /* Modifying original should not affect projectile. */
    originalPos.x = 999;
    expect(proj.targetLastPosition.x).toBe(300);
  });

  it('should allow updating targetLastPosition', () => {
    const proj = createProjectile();
    proj.targetLastPosition = { x: 500, y: 600 };
    expect(proj.targetLastPosition.x).toBe(500);
    expect(proj.targetLastPosition.y).toBe(600);
  });

  it('should allow setting isOrphaned to true', () => {
    const proj = createProjectile();
    proj.isOrphaned = true;
    expect(proj.isOrphaned).toBe(true);
  });

  it('should store missile projectile type for AA tower', () => {
    const proj = createProjectile({
      towerType: 'antiair',
      projectileType: 'missile',
      speed: 500,
      damage: 25,
    });
    expect(proj.towerType).toBe('antiair');
    expect(proj.projectileType).toBe('missile');
    expect(proj.speed).toBe(500);
    expect(proj.damage).toBe(25);
  });

  it('should store the sprite reference', () => {
    const proj = createProjectile();
    expect(proj.sprite).toBeDefined();
  });
});
