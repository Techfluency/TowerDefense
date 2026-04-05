/**
 * Purchase confirmation modal for the skill tree UI.
 *
 * Displays upgrade name, XP cost, remaining XP after purchase, and
 * Confirm/Cancel buttons. Uses a semi-transparent backdrop to block
 * interaction with the content behind the modal. Animated with
 * scale-in on open and scale-down on close.
 *
 * BOLT-025.
 */
import Phaser from 'phaser';
import { scaleIn } from '../ui-animations';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MODAL_BG_COLOR,
  MODAL_BORDER_COLOR,
  BTN_BG,
  BTN_HOVER,
  BTN_CONFIRM_BG,
  BTN_CONFIRM_HOVER,
  BTN_CORNER_RADIUS,
  COLOR_GOLD_STR,
  COLOR_RED_STR,
} from './skill-tree-layout';

/**
 * Creates and shows the purchase confirmation modal.
 * Returns the modal container so the caller can track and close it.
 *
 * @param scene - The Phaser scene for creating game objects.
 * @param upgradeName - Display name of the upgrade being purchased.
 * @param cost - XP cost for this purchase.
 * @param remainingAfter - Player's XP balance after the purchase.
 * @param onConfirm - Callback when the player confirms the purchase.
 * @param onCancel - Callback when the player cancels.
 * @returns The modal container (caller manages lifecycle).
 */
export function showConfirmationModal(
  scene: Phaser.Scene,
  upgradeName: string,
  cost: number,
  remainingAfter: number,
  onConfirm: () => void,
  onCancel: () => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  container.setDepth(100);

  /* Semi-transparent backdrop blocks interaction with content behind. */
  const backdrop = scene.add.graphics();
  backdrop.fillStyle(0x000000, 0.6);
  backdrop.fillRect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
  backdrop.setInteractive(
    new Phaser.Geom.Rectangle(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT),
    Phaser.Geom.Rectangle.Contains,
  );
  container.add(backdrop);

  /* Modal panel. */
  const panelW = 340;
  const panelH = 200;
  const panel = scene.add.graphics();
  panel.fillStyle(MODAL_BG_COLOR, 0.95);
  panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
  panel.lineStyle(1, MODAL_BORDER_COLOR, 1);
  panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
  container.add(panel);

  /* Title. */
  const title = scene.add.text(0, -panelH / 2 + 24, 'Confirm Purchase', {
    fontSize: '18px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: '#E0E0E0',
  }).setOrigin(0.5);
  container.add(title);

  /* Upgrade name. */
  const nameText = scene.add.text(0, -panelH / 2 + 54, upgradeName, {
    fontSize: '16px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: COLOR_GOLD_STR,
  }).setOrigin(0.5);
  container.add(nameText);

  /* Cost line. */
  const costText = scene.add.text(0, -panelH / 2 + 82, `Cost: ${cost} XP`, {
    fontSize: '15px',
    fontFamily: 'monospace',
    color: '#CCCCCC',
  }).setOrigin(0.5);
  container.add(costText);

  /* Remaining XP line. */
  const remainText = scene.add.text(
    0, -panelH / 2 + 106,
    `Remaining: ${remainingAfter} XP`,
    {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: remainingAfter >= 0 ? COLOR_GOLD_STR : COLOR_RED_STR,
    },
  ).setOrigin(0.5);
  container.add(remainText);

  /* Confirm button. */
  createModalButton(scene, container, -70, panelH / 2 - 36,
    'Confirm', BTN_CONFIRM_BG, BTN_CONFIRM_HOVER, onConfirm);

  /* Cancel button. */
  createModalButton(scene, container, 70, panelH / 2 - 36,
    'Cancel', BTN_BG, BTN_HOVER, onCancel);

  scaleIn(scene, container);
  return container;
}

/**
 * Closes and destroys a modal container with a scale-down animation.
 *
 * @param scene - The Phaser scene for tweens.
 * @param modal - The modal container to close.
 */
export function closeModal(
  scene: Phaser.Scene,
  modal: Phaser.GameObjects.Container,
): void {
  scene.tweens.add({
    targets: modal,
    scaleX: 0,
    scaleY: 0,
    alpha: 0,
    duration: 150,
    ease: 'Sine.easeIn',
    onComplete: () => modal.destroy(),
  });
}

/**
 * Creates a styled button within the modal container.
 *
 * @param scene - The Phaser scene.
 * @param container - Modal container to add the button to.
 * @param x - Button center X relative to modal center.
 * @param y - Button center Y relative to modal center.
 * @param label - Button text.
 * @param bgColor - Normal background color.
 * @param hoverColor - Hover background color.
 * @param onClick - Click callback.
 */
function createModalButton(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  bgColor: number,
  hoverColor: number,
  onClick: () => void,
): void {
  const width = 110;
  const height = 36;

  const bg = scene.add.graphics();
  bg.fillStyle(bgColor, 1);
  bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
  container.add(bg);

  const text = scene.add.text(x, y, label, {
    fontSize: '14px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: '#FFFFFF',
  }).setOrigin(0.5);
  container.add(text);

  const hitZone = scene.add.zone(x, y, width, height)
    .setInteractive({ useHandCursor: true });

  hitZone.on('pointerover', () => {
    bg.clear();
    bg.fillStyle(hoverColor, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
  });
  hitZone.on('pointerout', () => {
    bg.clear();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
  });
  hitZone.on('pointerdown', onClick);
  container.add(hitZone);
}
