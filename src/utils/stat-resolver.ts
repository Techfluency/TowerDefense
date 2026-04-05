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
 * BOLT-024: After tier lookup, multiplies damage/fireRate/range by
 * skill tree RunBonuses. Formula: baseStat * (1 + skillTreeBonus).
 * RunBonuses are optional -- when absent, stats pass through unchanged.
 *
 * Consumed by:
 * - BOLT-006 TowerCombatSystem (damage, fireRate, range per tower per frame)
 * - BOLT-007 UpgradePanel (current and next-tier stat display)
 * - BOLT-007 UpgradeSystem (maxHp on upgrade for currentHp adjustment)
 * - BOLT-019 UpgradeSystem (branch preview stats)
 */
import type { PlacedTower, EffectiveTowerStats, TowerBranch, RunBonuses } from '../types/game-types';
import type { ConfigManager } from './config-manager';

/**
 * Returns the effective combat stats for a tower at its current upgrade tier,
 * with optional skill tree RunBonuses applied.
 *
 * For Tiers 1-3, matches on tier number alone (unchanged from BOLT-007).
 * For Tier 4, requires the tower's branch ('A' or 'B') to select the
 * correct branch entry. If no matching branch data is found, falls back
 * to Tier 3 stats (defensive fallback -- a Tier 4 tower should always
 * have branch data, but we guard against data mismatches).
 *
 * BOLT-024: After tier lookup, if runBonuses is provided, multiplies
 * damage/fireRate/range by the tower's skill tree multipliers.
 * Formula: baseStat * multiplier (where multiplier = 1.0 + cumulative bonus).
 *
 * @param tower - The placed tower instance (reads towerType, upgradeLevel, and branch).
 * @param configManager - Config access for upgrade and base tower definitions.
 * @param runBonuses - Optional skill tree bonuses from the Phaser registry.
 * @returns Absolute stat values for combat and display use, including specialEffect.
 */
export function resolveEffectiveStats(
  tower: Pick<PlacedTower, 'towerType' | 'upgradeLevel'> & { branch?: TowerBranch },
  configManager: ConfigManager,
  runBonuses?: RunBonuses | null,
): EffectiveTowerStats {
  const upgrades = configManager.getUpgrades(tower.towerType);
  let baseStats: EffectiveTowerStats;

  /* Tier 4 with a branch: match both tier and branch. */
  if (tower.upgradeLevel === 4 && tower.branch) {
    const branchData = upgrades.find(
      u => u.tier === 4 && u.branch === tower.branch,
    );
    if (branchData) {
      baseStats = {
        damage: branchData.damage,
        fireRate: branchData.fireRate,
        range: branchData.range,
        maxHp: branchData.maxHp,
        specialEffect: branchData.specialEffect,
      };
    } else {
      /* Defensive fallback: branch data missing -- use Tier 3 instead. */
      const tier3 = upgrades.find(u => u.tier === 3);
      if (tier3) {
        baseStats = {
          damage: tier3.damage,
          fireRate: tier3.fireRate,
          range: tier3.range,
          maxHp: tier3.maxHp,
        };
      } else {
        const def = configManager.getTower(tower.towerType);
        baseStats = { damage: def.damage, fireRate: def.fireRate, range: def.range, maxHp: def.maxHp };
      }
    }
  } else {
    /* Tiers 1-3: match on tier number alone (original BOLT-007 behavior). */
    const tierData = upgrades.find(u => u.tier === tower.upgradeLevel && !u.branch);
    if (tierData) {
      baseStats = {
        damage: tierData.damage,
        fireRate: tierData.fireRate,
        range: tierData.range,
        maxHp: tierData.maxHp,
      };
    } else {
      /* Fallback: no upgrade data for this tier -- use base TowerDefinition. */
      const def = configManager.getTower(tower.towerType);
      baseStats = { damage: def.damage, fireRate: def.fireRate, range: def.range, maxHp: def.maxHp };
    }
  }

  /* BOLT-024: Apply skill tree tower multipliers if available.
   * Multiplies damage, fireRate, range by the tower's cumulative bonus.
   * maxHp and specialEffect are NOT affected by per-tower multipliers
   * (global towerHpMultiplier is applied at tower creation, not here). */
  return applyTowerMultipliers(baseStats, tower.towerType, runBonuses);
}

/**
 * Applies skill tree per-tower multipliers to base stats.
 * Only affects damage, fireRate, and range. maxHp is excluded because
 * the global HP multiplier is applied once at tower creation (BOLT-024),
 * not per-frame via stat resolver.
 *
 * @param stats - Base stats from tier data lookup.
 * @param towerType - Tower type ID for RunBonuses key lookup.
 * @param runBonuses - Optional RunBonuses from the Phaser registry.
 * @returns Stats with multipliers applied (or unchanged if no bonuses).
 */
function applyTowerMultipliers(
  stats: EffectiveTowerStats,
  towerType: string,
  runBonuses?: RunBonuses | null,
): EffectiveTowerStats {
  if (!runBonuses) return stats;

  const multipliers = runBonuses.towerMultipliers[towerType];
  if (!multipliers) return stats;

  return {
    ...stats,
    damage: stats.damage * multipliers.damage,
    fireRate: stats.fireRate * multipliers.fireRate,
    range: stats.range * multipliers.range,
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
