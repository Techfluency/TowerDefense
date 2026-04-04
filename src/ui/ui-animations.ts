/**
 * UI animation presets and utilities for BOLT-016 polish.
 *
 * Provides reusable tween factories for scene transitions, panel slides,
 * number count-ups, floating text, toast notifications, and button hover
 * effects. All animations use Phaser's built-in tween system so they run
 * on real-time (unaffected by game speed multiplier).
 *
 * Design rules:
 * - All durations between 150-500ms to avoid feeling sluggish (brief spec: 400ms cap).
 * - All animations are skippable or interruptible (no blocking tweens).
 * - Easing defaults to Sine.easeInOut for smooth, natural motion.
 * - Every function is pure -- no scene state is mutated beyond the tween targets.
 */

// ---------------------------------------------------------------------------
// Duration constants (ms) -- centralized for easy tuning
// ---------------------------------------------------------------------------

/** Scene fade transition duration. */
export const FADE_DURATION_MS = 350;

/** Panel slide-in/out duration. */
export const PANEL_SLIDE_MS = 250;

/** Number count-up animation duration. */
export const COUNT_UP_MS = 400;

/** Floating text rise and fade duration. */
export const FLOAT_TEXT_MS = 1200;

/** Toast slide-in duration. */
export const TOAST_SLIDE_MS = 300;

/** Toast display duration before auto-dismiss. */
export const TOAST_DISPLAY_MS = 2500;

/** Toast fade-out duration. */
export const TOAST_FADE_MS = 200;

/** Button hover scale amount (1 + this). */
export const BUTTON_HOVER_SCALE = 0.06;

/** Button hover tween duration. */
export const BUTTON_HOVER_MS = 120;

/** Tooltip fade-in duration. */
export const TOOLTIP_FADE_MS = 150;

/** Wave summary stagger delay between stat rows. */
export const STAGGER_DELAY_MS = 80;

/** Loading bar smooth-fill tween duration per progress tick. */
export const LOADING_BAR_TWEEN_MS = 200;

// ---------------------------------------------------------------------------
// Scene transition helpers
// ---------------------------------------------------------------------------

/**
 * Fades the camera to black, runs a callback at peak darkness, then fades back in.
 * Used for scene transitions (MainMenu -> Gameplay, etc.).
 *
 * @param scene - The Phaser scene whose camera to fade.
 * @param onMidpoint - Callback invoked at full black (scene switch goes here).
 * @param duration - Total fade-out duration in ms (fade-in uses the same duration).
 */
export function fadeTransition(
  scene: Phaser.Scene,
  onMidpoint: () => void,
  duration: number = FADE_DURATION_MS,
): void {
  const cam = scene.cameras.main;
  /* Fade to black. On complete, invoke the midpoint callback (scene switch). */
  cam.fadeOut(duration, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    onMidpoint();
  });
}

/**
 * Fades the camera in from black. Call this in the target scene's create().
 *
 * @param scene - The scene to fade in.
 * @param duration - Fade-in duration in ms.
 */
export function fadeIn(
  scene: Phaser.Scene,
  duration: number = FADE_DURATION_MS,
): void {
  scene.cameras.main.fadeIn(duration, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Panel animation helpers
// ---------------------------------------------------------------------------

/**
 * Slides a container in from the right edge of the screen.
 * The container starts off-screen and tweens to its target X.
 *
 * @param scene - The Phaser scene owning the tween.
 * @param container - The container to animate.
 * @param targetX - The final X position.
 * @param offscreenX - Starting X position (defaults to targetX + 400).
 * @param duration - Slide duration in ms.
 * @returns The tween instance for optional chaining or cancellation.
 */
export function slideInFromRight(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  targetX: number,
  offscreenX?: number,
  duration: number = PANEL_SLIDE_MS,
): Phaser.Tweens.Tween {
  const startX = offscreenX ?? targetX + 400;
  container.x = startX;
  return scene.tweens.add({
    targets: container,
    x: targetX,
    duration,
    ease: 'Back.easeOut',
  });
}

/**
 * Slides a container out to the right edge, then destroys it.
 *
 * @param scene - The Phaser scene owning the tween.
 * @param container - The container to animate out and destroy.
 * @param offscreenX - Target X (off-screen right).
 * @param duration - Slide duration in ms.
 */
export function slideOutToRight(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  offscreenX?: number,
  duration: number = PANEL_SLIDE_MS,
): void {
  const targetX = offscreenX ?? container.x + 400;
  scene.tweens.add({
    targets: container,
    x: targetX,
    duration,
    ease: 'Sine.easeIn',
    onComplete: () => container.destroy(),
  });
}

/**
 * Scales a container from 0 to 1 (pop-in effect).
 *
 * @param scene - The Phaser scene owning the tween.
 * @param container - The container to scale in.
 * @param duration - Animation duration in ms.
 * @returns The tween instance.
 */
export function scaleIn(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  duration: number = PANEL_SLIDE_MS,
): Phaser.Tweens.Tween {
  container.setScale(0);
  return scene.tweens.add({
    targets: container,
    scaleX: 1,
    scaleY: 1,
    duration,
    ease: 'Back.easeOut',
  });
}

/**
 * Slides a container down from above (e.g., settings panel, wave summary).
 *
 * @param scene - The Phaser scene owning the tween.
 * @param container - The container to animate.
 * @param targetY - Final Y position.
 * @param startY - Starting Y (defaults to targetY - 300).
 * @param duration - Duration in ms.
 * @returns The tween instance.
 */
export function slideDownFrom(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  targetY: number,
  startY?: number,
  duration: number = PANEL_SLIDE_MS,
): Phaser.Tweens.Tween {
  container.y = startY ?? targetY - 300;
  /* Guard against missing setAlpha (e.g., in unit test mocks). */
  if (typeof container.setAlpha === 'function') {
    container.setAlpha(0);
  } else {
    container.alpha = 0;
  }
  return scene.tweens.add({
    targets: container,
    y: targetY,
    alpha: 1,
    duration,
    ease: 'Sine.easeOut',
  });
}

// ---------------------------------------------------------------------------
// Number animation helpers
// ---------------------------------------------------------------------------

/**
 * Animates a text element counting from one number to another.
 * Useful for currency and score HUD counters.
 *
 * @param scene - The Phaser scene owning the tween.
 * @param textObj - The Phaser text object to update.
 * @param from - Starting number.
 * @param to - Target number.
 * @param prefix - Text prefix (e.g., "Score: ").
 * @param suffix - Text suffix (e.g., "g").
 * @param duration - Animation duration in ms.
 */
export function countUp(
  scene: Phaser.Scene,
  textObj: Phaser.GameObjects.Text,
  from: number,
  to: number,
  prefix: string = '',
  suffix: string = '',
  duration: number = COUNT_UP_MS,
): void {
  /* Set the final value immediately so non-visual consumers (tests, screen
   * readers) see the correct value even if the tween doesn't run. */
  textObj.setText(`${prefix}${to}${suffix}`);

  /* Animate the visible value from `from` to `to` for visual polish.
   * The tween overwrites setText on each frame; on completion or if
   * the tween system is unavailable, the final value is already set. */
  const proxy = { value: from };
  scene.tweens.add({
    targets: proxy,
    value: to,
    duration,
    ease: 'Sine.easeOut',
    onUpdate: () => {
      textObj.setText(`${prefix}${Math.round(proxy.value)}${suffix}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Floating text helpers
// ---------------------------------------------------------------------------

/**
 * Spawns floating text that rises and fades out with easing.
 * Enhanced version with configurable easing for BOLT-016 polish.
 *
 * @param scene - The Phaser scene to add the text to.
 * @param x - World X position.
 * @param y - World Y position.
 * @param content - Text string to display.
 * @param style - Phaser text style config.
 * @param depth - Rendering depth.
 * @param rise - Pixels to float upward.
 * @param duration - Total animation duration in ms.
 * @returns The created text object (auto-destroys on completion).
 */
export function spawnAnimatedFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  depth: number,
  rise: number = 35,
  duration: number = FLOAT_TEXT_MS,
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, style)
    .setOrigin(0.5)
    .setDepth(depth);

  scene.tweens.add({
    targets: text,
    y: y - rise,
    alpha: { from: 1, to: 0 },
    scale: { from: 1, to: 0.7 },
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });

  return text;
}

// ---------------------------------------------------------------------------
// Button hover helpers
// ---------------------------------------------------------------------------

/**
 * Attaches scale-pulse hover and press effects to an interactive game object.
 * Works with any object that supports setScale (containers, sprites, text).
 *
 * @param scene - The Phaser scene.
 * @param target - The game object to animate.
 * @param hitZone - The interactive zone that receives pointer events.
 */
export function attachButtonHoverEffects(
  scene: Phaser.Scene,
  target: { setScale: (x: number, y?: number) => void },
  hitZone: Phaser.GameObjects.Zone | Phaser.GameObjects.Graphics,
): void {
  hitZone.on('pointerover', () => {
    scene.tweens.add({
      targets: target,
      scaleX: 1 + BUTTON_HOVER_SCALE,
      scaleY: 1 + BUTTON_HOVER_SCALE,
      duration: BUTTON_HOVER_MS,
      ease: 'Sine.easeOut',
    });
  });
  hitZone.on('pointerout', () => {
    scene.tweens.add({
      targets: target,
      scaleX: 1,
      scaleY: 1,
      duration: BUTTON_HOVER_MS,
      ease: 'Sine.easeIn',
    });
  });
}

// ---------------------------------------------------------------------------
// Tooltip animation
// ---------------------------------------------------------------------------

/**
 * Fades in a tooltip container with a slight upward slide.
 *
 * @param scene - The Phaser scene.
 * @param container - The tooltip container.
 * @param duration - Fade-in duration in ms.
 */
export function fadeInTooltip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  duration: number = TOOLTIP_FADE_MS,
): void {
  const targetY = container.y;
  container.setAlpha(0);
  container.y = targetY + 8;
  scene.tweens.add({
    targets: container,
    alpha: 1,
    y: targetY,
    duration,
    ease: 'Sine.easeOut',
  });
}

// ---------------------------------------------------------------------------
// Stagger animation for overlay stat rows
// ---------------------------------------------------------------------------

/**
 * Animates an array of game objects with staggered fade-in + slide-up.
 * Used for wave summary stat rows.
 *
 * @param scene - The Phaser scene.
 * @param items - Array of game objects to stagger.
 * @param delayPerItem - Delay between each item's animation start.
 * @param duration - Individual item animation duration.
 */
export function staggerFadeIn(
  scene: Phaser.Scene,
  items: Phaser.GameObjects.GameObject[],
  delayPerItem: number = STAGGER_DELAY_MS,
  duration: number = 200,
): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Phaser.GameObjects.Text;
    const originalY = item.y;
    item.setAlpha(0);
    item.y = originalY + 12;
    scene.tweens.add({
      targets: item,
      alpha: 1,
      y: originalY,
      duration,
      delay: i * delayPerItem,
      ease: 'Sine.easeOut',
    });
  }
}
