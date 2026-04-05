/**
 * Tier pip builder for the skill tree UI.
 *
 * Creates individual tier pip circles with the correct visual state
 * (purchased, available, locked) and optional click handlers for
 * purchase flow. Pips are 36px diameter minimum for touch accessibility.
 *
 * BOLT-025.
 */
import Phaser from 'phaser';
import {
  PIP_RADIUS,
  COLOR_GREEN,
  COLOR_GRAY,
  COLOR_RED_STR,
} from './skill-tree-layout';

/**
 * Builds a single tier pip (circle) with the appropriate visual state
 * and optional purchase handler.
 *
 * Pip states:
 * - Purchased: filled green with inner dot
 * - Available + can afford: outlined with accent color, interactive
 * - Available + cannot afford: outlined with accent color, dimmed
 * - Locked: dim gray outline, no interaction
 *
 * @param scene - The Phaser scene for creating game objects.
 * @param container - Parent container to add the pip to.
 * @param x - Center X position within the container.
 * @param y - Center Y position within the container.
 * @param purchased - Whether this tier has been bought.
 * @param isNext - Whether this is the next purchasable tier.
 * @param canAfford - Whether the player has enough XP.
 * @param accentColor - Color for the available state (tower accent).
 * @param onPurchase - Callback when a purchasable pip is tapped.
 */
export function buildPip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  purchased: boolean,
  isNext: boolean,
  canAfford: boolean,
  accentColor: number,
  onPurchase?: () => void,
): void {
  const gfx = scene.add.graphics();

  if (purchased) {
    /* Filled green -- already purchased. */
    gfx.fillStyle(COLOR_GREEN, 1);
    gfx.fillCircle(x, y, PIP_RADIUS);
    /* Inner dot for visual clarity (checkmark substitute). */
    gfx.fillStyle(0xFFFFFF, 0.4);
    gfx.fillCircle(x, y, PIP_RADIUS * 0.35);
  } else if (isNext && canAfford) {
    /* Outlined with accent color -- purchasable. */
    gfx.lineStyle(3, accentColor, 1);
    gfx.strokeCircle(x, y, PIP_RADIUS);
    /* Subtle fill to indicate interactivity. */
    gfx.fillStyle(accentColor, 0.15);
    gfx.fillCircle(x, y, PIP_RADIUS);
  } else if (isNext) {
    /* Dimmed outline -- next tier but can't afford. */
    gfx.lineStyle(2, accentColor, 0.5);
    gfx.strokeCircle(x, y, PIP_RADIUS);
  } else {
    /* Dim gray -- locked (not the next tier). */
    gfx.lineStyle(2, COLOR_GRAY, 0.4);
    gfx.strokeCircle(x, y, PIP_RADIUS);
  }

  container.add(gfx);

  /* Interactive hit zone for purchasable pips. */
  if (isNext && onPurchase) {
    const hitZone = scene.add.zone(x, y, PIP_RADIUS * 2, PIP_RADIUS * 2)
      .setInteractive({ useHandCursor: canAfford });
    hitZone.on('pointerdown', () => {
      if (canAfford) {
        onPurchase();
      } else {
        showInsufficientFeedback(scene, container, x, y);
      }
    });
    container.add(hitZone);
  }
}

/**
 * Shows a brief "Not enough XP" floating text near a pip.
 * Non-blocking visual-only feedback for insufficient funds.
 *
 * @param scene - The Phaser scene for tweens.
 * @param container - Parent container to add the text to.
 * @param x - Center X of the pip.
 * @param y - Center Y of the pip.
 */
function showInsufficientFeedback(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
): void {
  const text = scene.add.text(x, y - PIP_RADIUS - 8, 'Not enough XP', {
    fontSize: '11px',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    color: COLOR_RED_STR,
  }).setOrigin(0.5);
  container.add(text);

  /* Fade out and destroy after brief display. */
  scene.tweens.add({
    targets: text,
    alpha: 0,
    y: y - PIP_RADIUS - 24,
    duration: 800,
    ease: 'Sine.easeOut',
    onComplete: () => text.destroy(),
  });
}
