/**
 * Interactive capstone row builder for the skill tree UI.
 *
 * Renders capstone nodes with 4 interactive states: locked, unlockable,
 * xp-insufficient, and purchased. Supports purchase flow via callback,
 * gold particle burst VFX on purchase, and 48x48 touch targets for mobile.
 *
 * BOLT-026: Upgraded from non-interactive placeholders (BOLT-025).
 */
import Phaser from 'phaser';
import type { SkillTreeManager } from '../../utils/skill-tree-manager';
import type { CapstoneDefinition } from '../../types/game-types';
import {
  COLOR_GREEN, COLOR_GREEN_STR,
  COLOR_GOLD, COLOR_GOLD_STR,
  COLOR_GRAY, COLOR_GRAY_STR,
  COLOR_RED_STR,
  GAME_WIDTH,
} from './skill-tree-layout';
import { formatCapstonePrereq } from './bonus-format';

/**
 * Callback invoked when the player confirms a capstone purchase.
 * @param capstoneId - The capstone definition ID (e.g., "ranged_steady_aim").
 * @param capstoneName - Display name for the confirmation modal.
 * @param cost - XP cost of the capstone.
 * @param nodeX - World X of the node (for VFX positioning).
 * @param nodeY - World Y of the node (for VFX positioning).
 */
export type CapstonePurchaseCallback = (
  capstoneId: string,
  capstoneName: string,
  cost: number,
  nodeX: number,
  nodeY: number,
) => void;

/** Duration of the insufficient-XP red flash on the node circle (ms). */
const FLASH_CIRCLE_DURATION_MS = 200;

/** Duration of the insufficient-XP cost text flash (ms). */
const FLASH_TEXT_DURATION_MS = 400;

/**
 * Builds an interactive capstone row showing the node's name, cost,
 * description, prerequisite progress, and purchase state.
 *
 * @param scene - The Phaser scene for creating game objects.
 * @param container - Parent container.
 * @param manager - SkillTreeManager for state lookups.
 * @param capstoneDef - Capstone definition from config.
 * @param towerId - Tower ID for state lookups.
 * @param y - Y position within the content container.
 * @param onPurchase - Callback invoked when the player taps an unlockable node.
 */
export function buildCapstoneRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  manager: SkillTreeManager,
  capstoneDef: CapstoneDefinition,
  towerId: string,
  y: number,
  onPurchase?: CapstonePurchaseCallback,
): void {
  const towerState = manager.getTowerState(towerId);
  const capstoneKey = capstoneDef.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
  const isPurchased = towerState?.[capstoneKey] === true;
  const prereqsMet = towerState
    ? manager.checkCapstonePrerequisites(capstoneDef, towerState)
    : false;
  const hasEnoughXp = manager.getAvailableXp() >= capstoneDef.cost;

  /* Determine the 4-state: locked, unlockable, xp-insufficient, purchased. */
  type CapstoneState = 'locked' | 'unlockable' | 'xp_insufficient' | 'purchased';
  let nodeState: CapstoneState;
  if (isPurchased) {
    nodeState = 'purchased';
  } else if (prereqsMet && hasEnoughXp) {
    nodeState = 'unlockable';
  } else if (prereqsMet && !hasEnoughXp) {
    nodeState = 'xp_insufficient';
  } else {
    nodeState = 'locked';
  }

  /* Capstone node circle. */
  const nodeRadius = 22;
  const nodeX = 60;
  const nodeY = y + nodeRadius + 4;
  const gfx = scene.add.graphics();

  drawNodeCircle(gfx, nodeX, nodeY, nodeRadius, nodeState);
  container.add(gfx);

  /* Capstone name text. */
  const nameColorMap: Record<CapstoneState, string> = {
    purchased: COLOR_GREEN_STR,
    unlockable: '#FFFFFF',
    xp_insufficient: '#AAAAAA',
    locked: COLOR_GRAY_STR,
  };
  const nameText = scene.add.text(100, y + 6, capstoneDef.name, {
    fontSize: '15px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: nameColorMap[nodeState],
  }).setOrigin(0, 0);
  container.add(nameText);

  /* Description text. */
  const descText = scene.add.text(100, y + 24, capstoneDef.description, {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#888888',
    wordWrap: { width: GAME_WIDTH - 260 },
  }).setOrigin(0, 0);
  container.add(descText);

  /* Prerequisite text with progress count. */
  if (nodeState !== 'purchased') {
    const prereqStr = formatCapstonePrereq(capstoneDef, towerState);
    const prereqLabel = scene.add.text(100, y + 44, prereqStr, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: prereqsMet ? COLOR_GREEN_STR : COLOR_GRAY_STR,
    }).setOrigin(0, 0);
    container.add(prereqLabel);
  }

  /* Cost display. */
  const costColorMap: Record<CapstoneState, string> = {
    purchased: COLOR_GREEN_STR,
    unlockable: COLOR_GOLD_STR,
    xp_insufficient: COLOR_RED_STR,
    locked: COLOR_GRAY_STR,
  };
  const costStr = isPurchased ? 'OWNED' : `${capstoneDef.cost} XP`;
  const costLabel = scene.add.text(GAME_WIDTH - 40, y + 16, costStr, {
    fontSize: '13px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: costColorMap[nodeState],
  }).setOrigin(1, 0);
  container.add(costLabel);

  /* Interactive zone for unlockable and xp-insufficient states. */
  if (nodeState === 'unlockable' || nodeState === 'xp_insufficient') {
    /* 48x48 invisible hit zone centered on the node circle (exceeds 44px minimum). */
    const hitZone = scene.add.zone(nodeX, nodeY, 48, 48).setInteractive({
      useHandCursor: nodeState === 'unlockable',
    });
    container.add(hitZone);

    if (nodeState === 'unlockable') {
      hitZone.on('pointerdown', () => {
        if (onPurchase) {
          onPurchase(capstoneDef.id, capstoneDef.name, capstoneDef.cost, nodeX, nodeY);
        }
      });
    } else {
      /* XP-insufficient: flash red feedback on tap. */
      hitZone.on('pointerdown', () => {
        flashInsufficientXp(scene, gfx, nodeX, nodeY, nodeRadius, costLabel);
      });
    }
  }
}

/**
 * Draws the node circle graphics based on the current state.
 */
function drawNodeCircle(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number, radius: number,
  state: 'locked' | 'unlockable' | 'xp_insufficient' | 'purchased',
): void {
  switch (state) {
    case 'purchased':
      /* Solid green fill with white inner circle (checkmark equivalent). */
      gfx.fillStyle(COLOR_GREEN, 1);
      gfx.fillCircle(x, y, radius);
      gfx.fillStyle(0xFFFFFF, 0.3);
      gfx.fillCircle(x, y, radius * 0.4);
      break;

    case 'unlockable':
      /* Gold glow stroke with subtle inner fill. */
      gfx.lineStyle(3, COLOR_GOLD, 0.7);
      gfx.strokeCircle(x, y, radius);
      gfx.fillStyle(COLOR_GOLD, 0.15);
      gfx.fillCircle(x, y, radius);
      break;

    case 'xp_insufficient':
      /* Dimmer gold stroke, no fill. */
      gfx.lineStyle(2, COLOR_GOLD, 0.35);
      gfx.strokeCircle(x, y, radius);
      break;

    case 'locked':
      /* Gray stroke, no fill. */
      gfx.lineStyle(2, COLOR_GRAY, 0.4);
      gfx.strokeCircle(x, y, radius);
      break;
  }
}

/**
 * Plays the insufficient-XP red flash feedback: briefly flashes the node
 * circle red and shows "Not enough XP" near the cost label.
 */
function flashInsufficientXp(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  nodeX: number, nodeY: number, nodeRadius: number,
  costLabel: Phaser.GameObjects.Text,
): void {
  /* Flash the node circle red briefly. */
  const flashGfx = scene.add.graphics();
  flashGfx.lineStyle(3, 0xFF4444, 1.0);
  flashGfx.strokeCircle(nodeX, nodeY, nodeRadius);
  flashGfx.setDepth(gfx.depth + 1);

  /* Find the container the gfx belongs to and add flashGfx to it. */
  if (gfx.parentContainer) {
    gfx.parentContainer.add(flashGfx);
  }

  scene.time.delayedCall(FLASH_CIRCLE_DURATION_MS, () => {
    flashGfx.destroy();
  });

  /* Flash cost label text color to red briefly. */
  const originalColor = costLabel.style.color as string;
  costLabel.setColor(COLOR_RED_STR);
  scene.time.delayedCall(FLASH_TEXT_DURATION_MS, () => {
    costLabel.setColor(originalColor);
  });
}
