/**
 * Progression manager -- thin compatibility wrapper for BOLT-023 transition.
 *
 * BOLT-021 originally implemented a level-based progression system here.
 * BOLT-023 replaces it with SkillTreeManager. This file is retained as a
 * compatibility bridge: consumers that read from the Phaser registry
 * (MainMenu, GameOver, EconomySystem, TowerPlacementSystem) still expect
 * a "progressionManager" key with specific methods. Those methods now
 * delegate to SkillTreeManager or return safe defaults.
 *
 * Level/unlock system REMOVED:
 * - No more UNLOCK_TABLE or level-gated unlocks
 * - isTowerUnlocked() always returns true (all towers available from start)
 * - isFeatureUnlocked() always returns true (3x speed, Tier 4 available by default)
 * - getLevel() returns 0 (no levels in skill tree system)
 * - getStartingCurrencyBonus() returns 0 (handled by SkillTreeManager global upgrades)
 *
 * BOLT-024 will update consumers to read from SkillTreeManager directly,
 * at which point this file can be fully removed.
 */

import { SkillTreeManager } from './skill-tree-manager';
import type { XPRunData, XPResult as SkillTreeXPResult } from './skill-tree-manager';

// ---------------------------------------------------------------------------
// Types (kept for backward compatibility during transition)
// ---------------------------------------------------------------------------

/**
 * Legacy XP run data. Re-exported from SkillTreeManager for compatibility.
 */
export type { XPRunData };

/**
 * Legacy XP result for GameOver scene display.
 * Adapted from SkillTreeManager's XPResult to match old interface shape.
 */
export interface XPResult {
  /** XP gained from this run. */
  xpGained: number;
  /** Always 0 -- no levels in skill tree system. */
  previousLevel: number;
  /** Always 0 -- no levels in skill tree system. */
  newLevel: number;
  /** Total XP earned lifetime. */
  totalXP: number;
  /** Always 0 -- no XP-to-next-level concept. */
  xpToNextLevel: number;
  /** Always 0 -- no level progress concept. */
  xpInCurrentLevel: number;
  /** Always empty -- no level-up unlocks in skill tree system. */
  newUnlocks: { id: string; name: string; description: string }[];
}

// ---------------------------------------------------------------------------
// XP Calculation (kept for backward compat, delegates to SkillTreeManager)
// ---------------------------------------------------------------------------

/**
 * Calculates XP earned from a single run.
 * Delegates to SkillTreeManager's calculateRunXP.
 *
 * @param runData - End-of-run statistics.
 * @returns Total XP earned from this run.
 */
export { calculateRunXP } from './skill-tree-manager';

// ---------------------------------------------------------------------------
// ProgressionManager (compatibility wrapper)
// ---------------------------------------------------------------------------

export class ProgressionManager {
  /** The SkillTreeManager that owns all progression state now. */
  private readonly skillTree: SkillTreeManager;

  /**
   * Creates the progression manager. Internally creates a SkillTreeManager
   * which handles migration from the old localStorage format.
   */
  constructor() {
    this.skillTree = new SkillTreeManager();
  }

  /**
   * Returns the underlying SkillTreeManager.
   * Consumers that need skill tree functionality should use this directly.
   *
   * @returns The SkillTreeManager instance.
   */
  getSkillTreeManager(): SkillTreeManager {
    return this.skillTree;
  }

  // -------------------------------------------------------------------------
  // Compatibility stubs -- level system removed
  // -------------------------------------------------------------------------

  /**
   * Returns 0 -- the level system has been removed.
   * BOLT-024 will update MainMenu to show available XP instead.
   *
   * @returns Always 0.
   */
  getLevel(): number {
    return 0;
  }

  /**
   * Returns total lifetime XP earned. Delegates to SkillTreeManager.
   *
   * @returns Total XP earned.
   */
  getTotalXP(): number {
    return this.skillTree.getTotalXpEarned();
  }

  /**
   * Returns 0 -- no XP-to-next-level concept in skill tree system.
   *
   * @returns Always 0.
   */
  getXPToNextLevel(): number {
    return 0;
  }

  /**
   * Returns 0 -- no level progress concept in skill tree system.
   *
   * @returns Always 0.
   */
  getXPInCurrentLevel(): number {
    return 0;
  }

  /**
   * Returns 1.0 -- no level progress bar in skill tree system.
   * MainMenu uses this to fill the XP bar; returning 1.0 fills it fully.
   *
   * @returns Always 1.0.
   */
  getProgressFraction(): number {
    return 1;
  }

  /**
   * All towers are always available in the skill tree system.
   * No tower gating -- players can use any tower from the first run.
   *
   * @param _towerId - Ignored. All towers are unlocked.
   * @returns Always true.
   */
  isTowerUnlocked(_towerId: string): boolean {
    return true;
  }

  /**
   * All features are available by default in the skill tree system.
   * 3x speed, Tier 4 branches, endless high score -- all unlocked.
   *
   * @param _featureKey - Ignored. All features are unlocked.
   * @returns Always true.
   */
  isFeatureUnlocked(_featureKey: string): boolean {
    return true;
  }

  /**
   * Returns 0 -- starting currency bonus is now handled by
   * SkillTreeManager global upgrades (BOLT-024 integration).
   *
   * @returns Always 0.
   */
  getStartingCurrencyBonus(): number {
    return 0;
  }

  /**
   * Applies XP from a completed run. Delegates to SkillTreeManager
   * and wraps the result in the legacy XPResult format.
   *
   * @param runData - End-of-run statistics for XP calculation.
   * @returns Legacy-shaped XP result for GameOver scene.
   */
  applyRunXP(runData: XPRunData): XPResult {
    const result: SkillTreeXPResult = this.skillTree.applyRunXP(runData);
    return {
      xpGained: result.xpGained,
      previousLevel: 0,
      newLevel: 0,
      totalXP: result.totalXpEarned,
      xpToNextLevel: 0,
      xpInCurrentLevel: 0,
      newUnlocks: [],
    };
  }

  /**
   * Returns whether localStorage persistence is available.
   *
   * @returns true if localStorage works.
   */
  isStorageAvailable(): boolean {
    return this.skillTree.isStorageAvailable();
  }

  /**
   * Resets all progression data. Delegates to SkillTreeManager.
   */
  resetProgress(): void {
    this.skillTree.resetProgress();
  }
}
