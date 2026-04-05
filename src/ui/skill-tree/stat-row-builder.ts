/**
 * Per-tower stat row builder for the skill tree UI.
 *
 * Creates a single stat row with: stat name label, 5 tier pips,
 * current bonus text, and next-tier cost. Used by the SkillTree scene
 * for each of the 4 stats on tower-specific tabs.
 *
 * BOLT-025.
 */
import Phaser from 'phaser';
import type { SkillTreeManager } from '../../utils/skill-tree-manager';
import type { TowerStatName, GlobalUpgradeDefinition } from '../../types/game-types';
import {
  STAT_DISPLAY_NAMES,
  PIP_SPACING,
  MAX_STAT_TIER,
  MAX_GLOBAL_TIER,
  COLOR_GREEN_STR,
  COLOR_GRAY_STR,
  COLOR_GOLD_STR,
  COLOR_GOLD,
} from './skill-tree-layout';
import { buildPip } from './pip-builder';
import { formatStatBonus, formatGlobalBonus } from './bonus-format';

/** X offset where stat pips start. */
const PIP_START_X = 280;

/**
 * Builds a single stat row within a tower tab.
 *
 * @param scene - The Phaser scene for creating game objects.
 * @param container - Parent container for the row elements.
 * @param manager - SkillTreeManager for reading current state.
 * @param towerId - Tower ID (e.g., "ranged").
 * @param stat - Which stat this row represents.
 * @param y - Y position within the content container.
 * @param accentColor - Tower accent color for available pips.
 * @param onPurchase - Callback invoked when a purchasable pip is tapped.
 */
export function buildStatRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  manager: SkillTreeManager,
  towerId: string,
  stat: TowerStatName,
  y: number,
  accentColor: number,
  onPurchase: (towerId: string, stat: TowerStatName, cost: number) => void,
): void {
  const currentTier = manager.getStatTier(towerId, stat);
  const nextCost = manager.getStatTierCost(towerId, stat);
  const availableXp = manager.getAvailableXp();

  /* Stat name label (left side). */
  const nameLabel = scene.add.text(30, y + 12, STAT_DISPLAY_NAMES[stat], {
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#CCCCCC',
  }).setOrigin(0, 0.5);
  container.add(nameLabel);

  /* 5 tier pips (center area). */
  for (let tier = 1; tier <= MAX_STAT_TIER; tier++) {
    const pipX = PIP_START_X + (tier - 1) * PIP_SPACING;
    const purchased = tier <= currentTier;
    const isNext = tier === currentTier + 1;
    const canAfford = isNext && nextCost !== null && availableXp >= nextCost;

    buildPip(
      scene, container, pipX, y + 12,
      purchased, isNext, canAfford, accentColor,
      isNext ? () => onPurchase(towerId, stat, nextCost!) : undefined,
    );
  }

  /* Current bonus text (right of pips). */
  const bonusText = formatStatBonus(manager, towerId, stat);
  const bonusLabel = scene.add.text(
    PIP_START_X + MAX_STAT_TIER * PIP_SPACING + 10, y + 4,
    bonusText,
    {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: currentTier > 0 ? COLOR_GREEN_STR : COLOR_GRAY_STR,
    },
  ).setOrigin(0, 0.5);
  container.add(bonusLabel);

  /* Next tier cost or "MAX". */
  const costStr = nextCost !== null ? `${nextCost} XP` : 'MAX';
  const costColor = nextCost !== null && availableXp >= nextCost
    ? COLOR_GOLD_STR : COLOR_GRAY_STR;
  const costLabel = scene.add.text(
    PIP_START_X + MAX_STAT_TIER * PIP_SPACING + 10, y + 20,
    costStr,
    { fontSize: '11px', fontFamily: 'monospace', color: costColor },
  ).setOrigin(0, 0.5);
  container.add(costLabel);
}

/**
 * Builds a single global upgrade row: name, description, 3 tier pips,
 * current bonus, and next-tier cost.
 *
 * @param scene - The Phaser scene.
 * @param container - Parent container.
 * @param manager - SkillTreeManager for state.
 * @param upgradeDef - Global upgrade definition from config.
 * @param y - Y position within content container.
 * @param onPurchase - Callback for purchasable pip tap.
 */
export function buildGlobalRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  manager: SkillTreeManager,
  upgradeDef: GlobalUpgradeDefinition,
  y: number,
  onPurchase: (upgradeId: string, name: string, cost: number) => void,
): void {
  const currentTier = manager.getGlobalTier(upgradeDef.id);
  const nextCost = manager.getGlobalTierCost(upgradeDef.id);
  const availableXp = manager.getAvailableXp();

  /* Upgrade name (left). */
  const nameLabel = scene.add.text(30, y + 12, upgradeDef.name, {
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#CCCCCC',
  }).setOrigin(0, 0.5);
  container.add(nameLabel);

  /* Description below name. */
  const descLabel = scene.add.text(30, y + 28, upgradeDef.description, {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: '#888888',
  }).setOrigin(0, 0.5);
  container.add(descLabel);

  /* 3 tier pips (center). */
  const pipStartX = 400;
  for (let tier = 1; tier <= MAX_GLOBAL_TIER; tier++) {
    const pipX = pipStartX + (tier - 1) * PIP_SPACING;
    const purchased = tier <= currentTier;
    const isNext = tier === currentTier + 1;
    const canAfford = isNext && nextCost !== null && availableXp >= nextCost;

    buildPip(
      scene, container, pipX, y + 12,
      purchased, isNext, canAfford, COLOR_GOLD,
      isNext ? () => onPurchase(upgradeDef.id, upgradeDef.name, nextCost!) : undefined,
    );
  }

  /* Bonus text. */
  const bonusText = formatGlobalBonus(upgradeDef, currentTier);
  const bonusLabel = scene.add.text(
    pipStartX + MAX_GLOBAL_TIER * PIP_SPACING + 10, y + 4,
    bonusText,
    {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: currentTier > 0 ? COLOR_GREEN_STR : COLOR_GRAY_STR,
    },
  ).setOrigin(0, 0.5);
  container.add(bonusLabel);

  /* Cost display. */
  const costStr = nextCost !== null ? `${nextCost} XP` : 'MAX';
  const costColor = nextCost !== null && availableXp >= nextCost
    ? COLOR_GOLD_STR : COLOR_GRAY_STR;
  const costLabel = scene.add.text(
    pipStartX + MAX_GLOBAL_TIER * PIP_SPACING + 10, y + 20,
    costStr,
    { fontSize: '11px', fontFamily: 'monospace', color: costColor },
  ).setOrigin(0, 0.5);
  container.add(costLabel);
}
