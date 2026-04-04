/**
 * Unit tests for TowerRegistry system.
 *
 * Tests the dual-indexed tower storage, occupancy tracking, register/remove
 * lifecycle, upgrade mutations, and refund calculations. TowerRegistry is a
 * pure data system with no Phaser rendering, so tests use minimal mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TowerRegistry, SELL_REFUND_RATE } from '../../src/systems/tower-registry';
import type { GameState } from '../../src/types/game-types';
import { resetIdCounter } from '../../src/utils/id-generator';

/** Creates a minimal mock Phaser scene with events and registry. */
function createMockScene() {
  const registryData = new Map<string, unknown>();
  return {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    registry: {
      set: vi.fn((key: string, val: unknown) => registryData.set(key, val)),
      get: vi.fn((key: string) => registryData.get(key)),
      remove: vi.fn((key: string) => registryData.delete(key)),
    },
  };
}

function createMockGameState(): GameState {
  return {
    currency: 100,
    score: 0,
    currentWave: 0,
    totalWaves: 20,
    objectiveHp: 20,
    maxObjectiveHp: 20,
    isPaused: false,
    isGameOver: false,
    gameSeed: 'test-seed',
  };
}

/** Creates a mock Phaser sprite. */
function createMockSprite() {
  return {
    destroy: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
  } as unknown as Phaser.GameObjects.Sprite;
}

describe('TowerRegistry', () => {
  let mockScene: ReturnType<typeof createMockScene>;
  let gameState: GameState;
  let registry: TowerRegistry;

  beforeEach(() => {
    resetIdCounter();
    mockScene = createMockScene();
    gameState = createMockGameState();
    registry = new TowerRegistry(
      mockScene as unknown as Phaser.Scene,
      gameState,
    );
    registry.init();
  });

  // --- Registration ---

  it('should register on the Phaser registry during init', () => {
    expect(mockScene.registry.set).toHaveBeenCalledWith('towerRegistry', registry);
  });

  it('should register a tower and return a PlacedTower with generated ID', () => {
    const sprite = createMockSprite();
    const tower = registry.registerTower('ranged', 5, 3, 352, 224, 50, sprite);

    expect(tower.instanceId).toBe('tower-1');
    expect(tower.towerType).toBe('ranged');
    expect(tower.col).toBe(5);
    expect(tower.row).toBe(3);
    expect(tower.worldX).toBe(352);
    expect(tower.worldY).toBe(224);
    expect(tower.upgradeLevel).toBe(1);
    expect(tower.cost).toBe(50);
    expect(tower.sprite).toBe(sprite);
  });

  it('should assign unique IDs to each registered tower', () => {
    const t1 = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    const t2 = registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());
    const t3 = registry.registerTower('broadcast', 3, 3, 224, 224, 75, createMockSprite());

    expect(t1.instanceId).not.toBe(t2.instanceId);
    expect(t2.instanceId).not.toBe(t3.instanceId);
    expect(t1.instanceId).not.toBe(t3.instanceId);
  });

  // --- Occupancy ---

  it('should mark a tile as occupied after registration', () => {
    expect(registry.isOccupied(5, 3)).toBe(false);
    registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    expect(registry.isOccupied(5, 3)).toBe(true);
  });

  it('should not report unoccupied tiles as occupied', () => {
    registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    expect(registry.isOccupied(6, 3)).toBe(false);
    expect(registry.isOccupied(5, 4)).toBe(false);
    expect(registry.isOccupied(0, 0)).toBe(false);
  });

  it('should clear occupancy after tower removal', () => {
    const tower = registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    expect(registry.isOccupied(5, 3)).toBe(true);

    registry.removeTower(tower.instanceId);
    expect(registry.isOccupied(5, 3)).toBe(false);
  });

  // --- Removal ---

  it('should remove a tower by ID and return the removed record', () => {
    const tower = registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    const removed = registry.removeTower(tower.instanceId);

    expect(removed).not.toBeNull();
    expect(removed!.instanceId).toBe(tower.instanceId);
    expect(removed!.towerType).toBe('ranged');
  });

  it('should return null when removing a nonexistent tower', () => {
    const removed = registry.removeTower('tower-nonexistent');
    expect(removed).toBeNull();
  });

  it('should not find a removed tower by ID or position', () => {
    const tower = registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    registry.removeTower(tower.instanceId);

    expect(registry.getTowerById(tower.instanceId)).toBeNull();
    expect(registry.getTowerAt(5, 3)).toBeNull();
  });

  // --- Query by position ---

  it('should find a tower at a specific grid position', () => {
    registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    const found = registry.getTowerAt(5, 3);

    expect(found).not.toBeNull();
    expect(found!.towerType).toBe('ranged');
  });

  it('should return null for an empty grid position', () => {
    expect(registry.getTowerAt(0, 0)).toBeNull();
  });

  // --- Query by ID ---

  it('should find a tower by its instance ID', () => {
    const tower = registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());
    const found = registry.getTowerById(tower.instanceId);

    expect(found).not.toBeNull();
    expect(found!.towerType).toBe('focused');
  });

  it('should return null for a nonexistent tower ID', () => {
    expect(registry.getTowerById('tower-99')).toBeNull();
  });

  // --- getPlacedTowers ---

  it('should return all placed towers as an array', () => {
    registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());
    registry.registerTower('broadcast', 3, 3, 224, 224, 75, createMockSprite());

    const towers = registry.getPlacedTowers();
    expect(towers).toHaveLength(3);
  });

  it('should not include removed towers in getPlacedTowers', () => {
    const t1 = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());

    registry.removeTower(t1.instanceId);
    const towers = registry.getPlacedTowers();
    expect(towers).toHaveLength(1);
    expect(towers[0]!.towerType).toBe('focused');
  });

  it('should return an empty array when no towers are placed', () => {
    expect(registry.getPlacedTowers()).toHaveLength(0);
  });

  // --- getTowerCount ---

  it('should return the correct tower count', () => {
    expect(registry.getTowerCount()).toBe(0);

    registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(registry.getTowerCount()).toBe(1);

    registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());
    expect(registry.getTowerCount()).toBe(2);
  });

  it('should decrement count after removal', () => {
    const tower = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(registry.getTowerCount()).toBe(1);

    registry.removeTower(tower.instanceId);
    expect(registry.getTowerCount()).toBe(0);
  });

  // --- Upgrade ---

  it('should upgrade a tower to a new level', () => {
    const tower = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(tower.upgradeLevel).toBe(1);

    const result = registry.upgradeTower(tower.instanceId, 2);
    expect(result).toBe(true);

    const found = registry.getTowerById(tower.instanceId);
    expect(found!.upgradeLevel).toBe(2);
  });

  it('should return false when upgrading a nonexistent tower', () => {
    const result = registry.upgradeTower('tower-nonexistent', 3);
    expect(result).toBe(false);
  });

  // --- Refund calculation ---

  it('should calculate 50% refund rounded down for even cost', () => {
    const tower = registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    expect(registry.getRefundAmount(tower.instanceId)).toBe(25);
  });

  it('should calculate 50% refund rounded down for odd cost', () => {
    const tower = registry.registerTower('broadcast', 1, 1, 96, 96, 75, createMockSprite());
    expect(registry.getRefundAmount(tower.instanceId)).toBe(37);
  });

  it('should return 0 refund for nonexistent tower', () => {
    expect(registry.getRefundAmount('tower-nonexistent')).toBe(0);
  });

  it('should use SELL_REFUND_RATE of 0.5', () => {
    expect(SELL_REFUND_RATE).toBe(0.5);
  });

  // --- Destroy / cleanup ---

  it('should clear all data and remove from Phaser registry on destroy', () => {
    registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    registry.registerTower('focused', 2, 2, 160, 160, 100, createMockSprite());

    registry.destroy();

    expect(registry.getTowerCount()).toBe(0);
    expect(registry.getPlacedTowers()).toHaveLength(0);
    expect(mockScene.registry.remove).toHaveBeenCalledWith('towerRegistry');
  });

  // --- Sell and re-place on same tile ---

  it('should allow placement on a tile after the previous tower is sold', () => {
    const t1 = registry.registerTower('ranged', 5, 3, 352, 224, 50, createMockSprite());
    expect(registry.isOccupied(5, 3)).toBe(true);

    registry.removeTower(t1.instanceId);
    expect(registry.isOccupied(5, 3)).toBe(false);

    const t2 = registry.registerTower('focused', 5, 3, 352, 224, 100, createMockSprite());
    expect(registry.isOccupied(5, 3)).toBe(true);
    expect(t2.towerType).toBe('focused');
  });

  // --- Multiple towers at different positions ---

  it('should track multiple towers at different positions independently', () => {
    registry.registerTower('ranged', 1, 1, 96, 96, 50, createMockSprite());
    registry.registerTower('focused', 5, 3, 352, 224, 100, createMockSprite());
    registry.registerTower('broadcast', 8, 7, 544, 480, 75, createMockSprite());

    expect(registry.isOccupied(1, 1)).toBe(true);
    expect(registry.isOccupied(5, 3)).toBe(true);
    expect(registry.isOccupied(8, 7)).toBe(true);
    expect(registry.isOccupied(2, 2)).toBe(false);

    expect(registry.getTowerAt(1, 1)!.towerType).toBe('ranged');
    expect(registry.getTowerAt(5, 3)!.towerType).toBe('focused');
    expect(registry.getTowerAt(8, 7)!.towerType).toBe('broadcast');
  });
});
