/**
 * Tower registry -- data store for all placed towers on the map.
 *
 * Owns the authoritative state of placed tower instances: their positions,
 * types, upgrade levels, and sprite references. This is the system that
 * BOLT-006 (combat) and BOLT-007 (upgrades) query to find towers.
 *
 * Dual-indexed for O(1) lookups:
 * - byId: Map<instanceId, PlacedTower> -- for upgrade, sell-by-ID
 * - byPosition: Map<"col,row", PlacedTower> -- for occupancy, sell-by-click
 *
 * TowerRegistry is a BaseSystem with a no-op update(). It follows the
 * established pattern (mapData, enemySystem, waveSystem) of storing itself
 * on the Phaser registry for cross-system access.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import type { GameState, PlacedTower } from '../types/game-types';
import { generateId } from '../utils/id-generator';

/** Refund percentage when selling a tower (50%, rounded down per D1). */
export const SELL_REFUND_RATE = 0.5;

export class TowerRegistry extends BaseSystem {
  /** All placed towers indexed by unique instance ID. */
  private readonly byId = new Map<string, PlacedTower>();

  /** All placed towers indexed by grid position key "col,row". */
  private readonly byPosition = new Map<string, PlacedTower>();

  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers the system on the Phaser registry for cross-system access.
   * Follow the 'mapData', 'enemySystem', 'waveSystem' precedent.
   */
  init(): void {
    this.scene.registry.set('towerRegistry', this);
  }

  /**
   * No per-frame work. Tower registry is event-driven via direct method calls.
   */
  update(_time: number, _delta: number): void {
    /* Registry is query-only -- no per-frame processing. */
  }

  /**
   * Creates and stores a new PlacedTower record with a generated unique ID.
   * Initializes currentHp from the provided maxHp and totalInvested from cost.
   *
   * @param towerType - TowerDefinition.id (e.g., "ranged").
   * @param col - Grid column of placement.
   * @param row - Grid row of placement.
   * @param worldX - World pixel X at tile center.
   * @param worldY - World pixel Y at tile center.
   * @param cost - Original purchase cost for sell refund calculation.
   * @param sprite - The Phaser sprite placed on the map.
   * @param maxHp - Initial max HP from effective stats (BOLT-007). Defaults to 0 for backward compat.
   * @returns The newly created PlacedTower record.
   */
  registerTower(
    towerType: string,
    col: number,
    row: number,
    worldX: number,
    worldY: number,
    cost: number,
    sprite: Phaser.GameObjects.Sprite,
    maxHp: number = 0,
  ): PlacedTower {
    const tower: PlacedTower = {
      instanceId: generateId('tower'),
      towerType,
      col,
      row,
      worldX,
      worldY,
      upgradeLevel: 1,
      cost,
      sprite,
      currentHp: maxHp,
      totalInvested: cost,
    };

    this.byId.set(tower.instanceId, tower);
    this.byPosition.set(this.posKey(col, row), tower);

    return tower;
  }

  /**
   * Removes a tower from both indexes and returns the removed record.
   * Does NOT destroy the sprite -- the caller (TowerPlacementSystem) handles
   * sprite destruction and currency refund.
   *
   * @param towerId - The instance ID of the tower to remove.
   * @returns The removed PlacedTower, or null if not found.
   */
  removeTower(towerId: string): PlacedTower | null {
    const tower = this.byId.get(towerId);
    if (!tower) return null;

    this.byId.delete(towerId);
    this.byPosition.delete(this.posKey(tower.col, tower.row));

    return tower;
  }

  /**
   * Checks whether a tile has a tower placed on it. O(1) via position map.
   *
   * @param col - Grid column to check.
   * @param row - Grid row to check.
   * @returns True if a tower occupies this tile.
   */
  isOccupied(col: number, row: number): boolean {
    return this.byPosition.has(this.posKey(col, row));
  }

  /**
   * Returns the tower at a given grid position, or null if unoccupied.
   * Used by the sell interaction (right-click on placed tower) and BOLT-006 targeting.
   *
   * @param col - Grid column.
   * @param row - Grid row.
   * @returns The PlacedTower at that position, or null.
   */
  getTowerAt(col: number, row: number): PlacedTower | null {
    return this.byPosition.get(this.posKey(col, row)) ?? null;
  }

  /**
   * Returns a tower by its unique instance ID.
   * Used by BOLT-007 (upgrade system) to find the tower to upgrade.
   *
   * @param towerId - The instance ID.
   * @returns The PlacedTower, or null if not found.
   */
  getTowerById(towerId: string): PlacedTower | null {
    return this.byId.get(towerId) ?? null;
  }

  /**
   * Returns all currently placed towers as an array.
   * Used by BOLT-006 (combat) for targeting iteration.
   *
   * @returns Array of all placed towers (non-sold).
   */
  getPlacedTowers(): PlacedTower[] {
    return [...this.byId.values()];
  }

  /**
   * Returns the current count of placed towers.
   * Used by the build menu and debug overlay.
   *
   * @returns Number of towers currently on the map.
   */
  getTowerCount(): number {
    return this.byId.size;
  }

  /**
   * Updates the upgrade level on a placed tower.
   * Called by BOLT-007 when the player upgrades a tower.
   *
   * @param towerId - The instance ID of the tower to upgrade.
   * @param newLevel - The new upgrade tier.
   * @returns True if the tower was found and updated, false otherwise.
   */
  upgradeTower(towerId: string, newLevel: number): boolean {
    const tower = this.byId.get(towerId);
    if (!tower) return false;
    tower.upgradeLevel = newLevel;
    return true;
  }

  /**
   * Calculates the sell refund amount for a tower.
   * 50% of total invested (base cost + all upgrade costs), rounded down.
   * Updated by BOLT-007 to include upgrade investment in refund.
   *
   * @param towerId - The instance ID of the tower.
   * @returns Refund amount in currency, or 0 if tower not found.
   */
  getRefundAmount(towerId: string): number {
    const tower = this.byId.get(towerId);
    if (!tower) return 0;
    return Math.floor(tower.totalInvested * SELL_REFUND_RATE);
  }

  /**
   * Clears both maps and removes from Phaser registry on scene shutdown.
   */
  destroy(): void {
    this.byId.clear();
    this.byPosition.clear();
    this.scene.registry.remove('towerRegistry');
    super.destroy();
  }

  /**
   * Builds the position map key from grid coordinates.
   * Format: "col,row" (e.g., "5,3").
   */
  private posKey(col: number, row: number): string {
    return `${col},${row}`;
  }
}
