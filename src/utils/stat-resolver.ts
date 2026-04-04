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
 * Consumed by:
 * - BOLT-006 TowerCombatSystem (damage, fireRate, range per tower per frame)
 * - BOLT-007 UpgradePanel (current and next-tier stat display)
 * - BOLT-007 UpgradeSystem (maxHp on upgrade for currentHp adjustment)
 */
import type { PlacedTower, EffectiveTowerStats } from '../types/game-types';
import type { ConfigManager } from './config-manager';

/**
 * Returns the effective combat stats for a tower at its current upgrade tier.
 *
 * Reads the tower-upgrades.json data via ConfigManager. If no upgrade data
 * exists for the tower's type or tier, falls back to the base TowerDefinition
 * values from towers.json.
 *
 * @param tower - The placed tower instance (reads towerType and upgradeLevel).
 * @param configManager - Config access for upgrade and base tower definitions.
 * @returns Absolute stat values for combat and display use.
 */
export function resolveEffectiveStats(
  tower: Pick<PlacedTower, 'towerType' | 'upgradeLevel'>,
  configManager: ConfigManager,
): EffectiveTowerStats {
  const upgrades = configManager.getUpgrades(tower.towerType);
  const tierData = upgrades.find(u => u.tier === tower.upgradeLevel);

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
