/**
 * Effective stat resolver for tower upgrade tiers.
 *
 * Pure function that resolves the combat stats for a placed tower at its
 * current upgrade tier. TowerCombatSystem calls this every frame instead
 * of reading raw TowerDefinition values, so upgraded towers deal correct
 * damage without mutating the shared definition objects.
 *
 * Design: absolute values per tier (not deltas). Each tier in
 * tower-upgrades.json is self-contained, eliminating rounding drift.
 *
 * BOLT-019: Extended to handle Tier 4 branched upgrades. When a tower has
 * a branch selected, the resolver matches both tier AND branch to find
 * the correct data entry. Returns specialEffect for combat system dispatch.
 *
 * Consumed by:
 * - BOLT-006 TowerCombatSystem (damage, fireRate, range per tower per frame)
 * - BOLT-007 UpgradePanel (current and next-tier stat display)
 * - BOLT-007 UpgradeSystem (maxHp on upgrade for currentHp adjustment)
 * - BOLT-019 UpgradeSystem (branch preview stats)
 */
import type { PlacedTower, EffectiveTowerStats, TowerBranch } from '../types/game-types';
import type { ConfigManager } from './config-manager';

/**
 * Returns the effective combat stats for a tower at its current upgrade tier.
 *
 * For Tiers 1-3, matches on tier number alone (unchanged from BOLT-007).
 * For Tier 4, requires the tower's branch ('A' or 'B') to select the
 * correct branch entry. If no matching branch data is found, falls back
 * to Tier 3 stats (defensive fallback -- a Tier 4 tower should always
 * have branch data, but we guard against data mismatches).
 *
 * @param tower - The placed tower instance (reads towerType, upgradeLevel, and branch).
 * @param configManager - Config access for upgrade and base tower definitions.
 * @returns Absolute stat values for combat and display use, including specialEffect.
 */
export function resolveEffectiveStats(
  tower: Pick<PlacedTower, 'towerType' | 'upgradeLevel'> & { branch?: TowerBranch },
  configManager: ConfigManager,
): EffectiveTowerStats {
  const upgrades = configManager.getUpgrades(tower.towerType);

  /* Tier 4 with a branch: match both tier and branch. */
  if (tower.upgradeLevel === 4 && tower.branch) {
    const branchData = upgrades.find(
      u => u.tier === 4 && u.branch === tower.branch,
    );
    if (branchData) {
      return {
        damage: branchData.damage,
        fireRate: branchData.fireRate,
        range: branchData.range,
        maxHp: branchData.maxHp,
        specialEffect: branchData.specialEffect,
      };
    }

    /* Defensive fallback: branch data missing -- use Tier 3 instead. */
    const tier3 = upgrades.find(u => u.tier === 3);
    if (tier3) {
      return {
        damage: tier3.damage,
        fireRate: tier3.fireRate,
        range: tier3.range,
        maxHp: tier3.maxHp,
      };
    }
  }

  /* Tiers 1-3: match on tier number alone (original BOLT-007 behavior). */
  const tierData = upgrades.find(u => u.tier === tower.upgradeLevel && !u.branch);
  if (tierData) {
    return {
      damage: tierData.damage,
      fireRate: tierData.fireRate,
      range: tierData.range,
      maxHp: tierData.maxHp,
    };
  }

  /* Fallback: no upgrade data for this tier -- use base TowerDefinition. */
  const def = configManager.getTower(tower.towerType);
  return {
    damage: def.damage,
    fireRate: def.fireRate,
    range: def.range,
    maxHp: def.maxHp,
  };
}

/**
 * Returns the Tier 4 branch upgrade data for a specific tower and branch.
 * Used by UpgradePanel to display branch preview stats before selection.
 *
 * @param towerType - Tower type ID (e.g., "ranged").
 * @param branch - Branch to look up ('A' or 'B').
 * @param configManager - Config access for upgrade definitions.
 * @returns The TowerUpgradeTier for the requested branch, or undefined if not found.
 */
export function getBranchUpgradeData(
  towerType: string,
  branch: TowerBranch,
  configManager: ConfigManager,
) {
  const upgrades = configManager.getUpgrades(towerType);
  return upgrades.find(u => u.tier === 4 && u.branch === branch);
}

/**
 * Returns both Tier 4 branch options for a tower type.
 * Used by UpgradePanel to display the branch selection UI at Tier 3.
 *
 * @param towerType - Tower type ID (e.g., "ranged").
 * @param configManager - Config access for upgrade definitions.
 * @returns Tuple of [branchA, branchB], each may be undefined if data is missing.
 */
export function getBranchOptions(
  towerType: string,
  configManager: ConfigManager,
) {
  const upgrades = configManager.getUpgrades(towerType);
  const branchA = upgrades.find(u => u.tier === 4 && u.branch === 'A');
  const branchB = upgrades.find(u => u.tier === 4 && u.branch === 'B');
  return { branchA, branchB };
}
