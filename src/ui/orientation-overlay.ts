/**
 * Orientation overlay -- "Rotate your device" prompt for portrait mode.
 *
 * BOLT-022: When a mobile device is detected in portrait orientation,
 * this overlay blocks all game interaction and prompts the user to rotate
 * to landscape. The overlay is a pure DOM element (not Phaser) so it
 * renders correctly even when the Phaser canvas is scaled oddly in portrait.
 *
 * The overlay listens to 'resize' and 'orientationchange' events and
 * auto-dismisses when the device rotates to landscape.
 */
import { isMobileDevice, isPortraitOrientation } from '../utils/mobile-detect';

/** CSS id for the overlay element -- used for querySelector lookups. */
const OVERLAY_ID = 'orientation-overlay';

/** Background color that matches the game's dark theme. */
const BG_COLOR = '#1a1a2e';

/** SVG namespace for creating SVG elements programmatically. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates a phone-rotation SVG icon using safe DOM methods.
 * Avoids innerHTML to prevent any XSS risk.
 *
 * @returns An SVG element depicting a phone with a rotation arrow.
 */
function createRotationIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '80');
  svg.setAttribute('height', '80');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('fill', 'none');

  /* Phone body rectangle. */
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '22');
  rect.setAttribute('y', '10');
  rect.setAttribute('width', '36');
  rect.setAttribute('height', '60');
  rect.setAttribute('rx', '4');
  rect.setAttribute('stroke', '#E0E0E0');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('fill', 'none');
  svg.appendChild(rect);

  /* Home button indicator circle. */
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '40');
  circle.setAttribute('cy', '62');
  circle.setAttribute('r', '3');
  circle.setAttribute('fill', '#E0E0E0');
  svg.appendChild(circle);

  /* Rotation arrow curve. */
  const arc = document.createElementNS(SVG_NS, 'path');
  arc.setAttribute('d', 'M58 40 C68 40 68 20 55 15');
  arc.setAttribute('stroke', '#4A90D9');
  arc.setAttribute('stroke-width', '2');
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(arc);

  /* Arrow head. */
  const arrowHead = document.createElementNS(SVG_NS, 'path');
  arrowHead.setAttribute('d', 'M55 15 L58 20 L52 19');
  arrowHead.setAttribute('stroke', '#4A90D9');
  arrowHead.setAttribute('stroke-width', '2');
  arrowHead.setAttribute('fill', 'none');
  arrowHead.setAttribute('stroke-linecap', 'round');
  arrowHead.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(arrowHead);

  return svg;
}

/**
 * Creates and manages the portrait orientation overlay.
 * Call init() once at game startup; it handles its own lifecycle after that.
 *
 * @returns A cleanup function to remove event listeners and DOM elements.
 */
export function initOrientationOverlay(): () => void {
  /* Only activate on mobile devices. Desktop users can resize freely. */
  if (!isMobileDevice()) {
    return () => {};
  }

  /* Create the overlay DOM element. */
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');

  /* Style: fullscreen fixed overlay that blocks interaction. */
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: BG_COLOR,
    display: 'none',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: '10000',
    fontFamily: 'monospace',
    color: '#E0E0E0',
    textAlign: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  } as CSSStyleDeclaration);

  /* Rotation icon. */
  const iconContainer = document.createElement('div');
  iconContainer.style.marginBottom = '24px';
  iconContainer.appendChild(createRotationIcon());

  /* Primary text prompt. */
  const text = document.createElement('div');
  text.textContent = 'Rotate your device to landscape';
  text.style.fontSize = '20px';
  text.style.fontWeight = 'bold';
  text.style.marginBottom = '12px';

  /* Secondary explanation text. */
  const subtext = document.createElement('div');
  subtext.textContent = 'This game is designed for landscape orientation';
  subtext.style.fontSize = '14px';
  subtext.style.color = '#888888';

  overlay.appendChild(iconContainer);
  overlay.appendChild(text);
  overlay.appendChild(subtext);
  document.body.appendChild(overlay);

  /**
   * Checks orientation and shows/hides the overlay accordingly.
   * Called on initial load and on every resize/orientationchange event.
   */
  function checkOrientation(): void {
    if (isPortraitOrientation()) {
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }

  /* Listen for orientation changes via both APIs for broad browser coverage. */
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);

  /* Initial check. */
  checkOrientation();

  /* Return cleanup function for teardown. */
  return () => {
    window.removeEventListener('resize', checkOrientation);
    window.removeEventListener('orientationchange', checkOrientation);
    overlay.remove();
  };
}
