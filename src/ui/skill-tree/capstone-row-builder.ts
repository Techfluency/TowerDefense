/**
 * Capstone placeholder row builder for the skill tree UI.
 *
 * Renders capstone nodes as non-interactive placeholders showing name,
 * cost, description, and prerequisite status. Purchase interactivity
 * is deferred to BOLT-026.
 *
 * BOLT-025.
 */
import Phaser from 'phaser';
import type { SkillTreeManager } from '../../utils/skill-tree-manager';
import type { CapstoneDefinition } from '../../types/game-types';
import {
  COLOR_GREEN, COLOR_GREEN_STR,
  COLOR_GOLD,
  COLOR_GRAY, COLOR_GRAY_STR,
  GAME_WIDTH,
} from './skill-tree-layout';
import { formatCapstonePrereq } from './bonus-format';

/**
 * Builds a capstone placeholder row showing the node's name, cost,
 * description, prerequisite text, and purchased/locked visual state.
 *
 * @param scene - The Phaser scene for creating game objects.
 * @param container - Parent container.
 * @param manager - SkillTreeManager for state lookups.
 * @param capstoneDef - Capstone definition from config.
 * @param towerId - Tower ID for state lookups.
 * @param y - Y position within the content container.
 */
export function buildCapstoneRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  manager: SkillTreeManager,
  capstoneDef: CapstoneDefinition,
  towerId: string,
  y: number,
): void {
  const towerState = manager.getTowerState(towerId);
  const capstoneKey = capstoneDef.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
  const isPurchased = towerState?.[capstoneKey] === true;
  const prereqsMet = towerState
    ? manager.checkCapstonePrerequisites(capstoneDef, towerState)
    : false;

  /* Capstone node circle (larger than stat pips for visual distinction). */
  const nodeRadius = 22;
  const nodeX = 60;
  const nodeY = y + nodeRadius + 4;
  const gfx = scene.add.graphics();

  if (isPurchased) {
    gfx.fillStyle(COLOR_GREEN, 1);
    gfx.fillCircle(nodeX, nodeY, nodeRadius);
    gfx.fillStyle(0xFFFFFF, 0.3);
    gfx.fillCircle(nodeX, nodeY, nodeRadius * 0.4);
  } else if (prereqsMet) {
    /* Prerequisites met -- BOLT-026 enables purchase interactivity. */
    gfx.lineStyle(3, COLOR_GOLD, 0.7);
    gfx.strokeCircle(nodeX, nodeY, nodeRadius);
    gfx.fillStyle(COLOR_GOLD, 0.1);
    gfx.fillCircle(nodeX, nodeY, nodeRadius);
  } else {
    /* Prerequisites not met -- grayed out. */
    gfx.lineStyle(2, COLOR_GRAY, 0.4);
    gfx.strokeCircle(nodeX, nodeY, nodeRadius);
  }
  container.add(gfx);

  /* Capstone name. */
  const nameColor = isPurchased ? COLOR_GREEN_STR : (prereqsMet ? '#FFFFFF' : COLOR_GRAY_STR);
  const nameText = scene.add.text(100, y + 6, capstoneDef.name, {
    fontSize: '15px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: nameColor,
  }).setOrigin(0, 0);
  container.add(nameText);

  /* Description. */
  const descText = scene.add.text(100, y + 24, capstoneDef.description, {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#888888',
    wordWrap: { width: GAME_WIDTH - 260 },
  }).setOrigin(0, 0);
  container.add(descText);

  /* Prerequisite requirement text. */
  const prereqText = formatCapstonePrereq(capstoneDef);
  const prereqLabel = scene.add.text(100, y + 44, prereqText, {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: prereqsMet ? COLOR_GREEN_STR : COLOR_GRAY_STR,
  }).setOrigin(0, 0);
  container.add(prereqLabel);

  /* Cost display (right side). */
  const costStr = isPurchased ? 'OWNED' : `${capstoneDef.cost} XP`;
  const costColor = isPurchased ? COLOR_GREEN_STR : COLOR_GRAY_STR;
  const costLabel = scene.add.text(GAME_WIDTH - 40, y + 16, costStr, {
    fontSize: '13px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: costColor,
  }).setOrigin(1, 0);
  container.add(costLabel);
}
