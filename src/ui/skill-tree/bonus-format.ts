/**
 * Formatting helpers for skill tree bonus display.
 *
 * Converts raw multiplier values from SkillTreeManager into
 * human-readable strings for the UI (e.g., "+30% Damage", "-15% Cost").
 * Handles both percentage and flat bonus types for global upgrades.
 *
 * BOLT-025.
 */
import type { SkillTreeManager } from '../../utils/skill-tree-manager';
import type { TowerStatName, GlobalUpgradeDefinition, CapstoneDefinition } from '../../types/game-types';

/**
 * Formats the current cumulative bonus for a per-tower stat.
 * Damage/FireRate/Range show as "+X%", upgrade discount as "-X% Cost".
 *
 * @param manager - The SkillTreeManager to read multipliers from.
 * @param towerId - Tower ID (e.g., "ranged").
 * @param stat - Stat name.
 * @returns Formatted bonus string (e.g., "+30%", "-15% Cost", "+0%").
 */
export function formatStatBonus(
  manager: SkillTreeManager,
  towerId: string,
  stat: TowerStatName,
): string {
  const multipliers = manager.getTowerStatMultipliers(towerId);
  const value = multipliers[stat];

  if (stat === 'upgradeDiscount') {
    /* Discount is subtracted: multiplier 0.85 means -15% cost. */
    const pct = Math.round((1 - value) * 100);
    return pct > 0 ? `-${pct}% Cost` : '+0%';
  }
  /* Other stats are additive: multiplier 1.30 means +30%. */
  const pct = Math.round((value - 1) * 100);
  return pct > 0 ? `+${pct}%` : '+0%';
}

/**
 * Formats the current cumulative bonus for a global upgrade.
 * Percentage bonuses show as "+X%", flat bonuses as "+X".
 *
 * @param upgradeDef - Global upgrade definition with bonus metadata.
 * @param currentTier - Current purchased tier (0-3).
 * @returns Formatted bonus string (e.g., "+30%", "+50", "+0").
 */
export function formatGlobalBonus(
  upgradeDef: GlobalUpgradeDefinition,
  currentTier: number,
): string {
  if (currentTier === 0) return '+0';

  /* Sum bonuses from tier 1 through the player's current tier. */
  let total = 0;
  for (let i = 0; i < currentTier; i++) {
    total += upgradeDef.bonusPerTier[i] ?? 0;
  }

  if (upgradeDef.bonusType === 'percentage') {
    return `+${Math.round(total * 100)}%`;
  }
  /* Flat bonus: display integer when whole, 1 decimal otherwise. */
  return `+${Number.isInteger(total) ? total : total.toFixed(1)}`;
}

/**
 * Formats the prerequisite requirement text for a capstone node.
 * All prerequisites for a given capstone share the same minTier.
 *
 * @param capstoneDef - Capstone definition with prerequisite data.
 * @returns Human-readable prerequisite string (e.g., "Requires: 2 stats at Tier 2").
 */
export function formatCapstonePrereq(capstoneDef: CapstoneDefinition): string {
  const minTier = capstoneDef.prerequisites[0]?.minTier ?? 0;
  return `Requires: ${capstoneDef.requiredCount} stats at Tier ${minTier}`;
}
