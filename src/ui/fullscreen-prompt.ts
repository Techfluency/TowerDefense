/**
 * Fullscreen prompt -- "Tap to enter fullscreen" for mobile devices.
 *
 * BOLT-022: On mobile devices, shows a one-time prompt inviting the user
 * to tap for fullscreen mode. This hides the browser chrome and gives
 * the game maximum screen real estate. The prompt auto-dismisses after
 * the first tap, whether or not fullscreen was successfully entered.
 *
 * Uses the Phaser scale manager's built-in fullscreen API rather than
 * raw DOM calls, because Phaser handles the canvas resize after
 * fullscreen transitions.
 */
import { isMobileDevice, isFullscreenAvailable } from '../utils/mobile-detect';

/** CSS id for the prompt element. */
const PROMPT_ID = 'fullscreen-prompt';

/**
 * Shows a transient fullscreen prompt on mobile.
 * Attaches to the document body as a DOM overlay, styled to match the game theme.
 * Dismisses on tap and attempts to enter fullscreen via Phaser's scale manager.
 *
 * @param scaleManager - Phaser's scale manager for fullscreen toggle.
 * @returns A cleanup function to remove the prompt if still visible.
 */
export function showFullscreenPrompt(
  scaleManager: { startFullscreen(): void },
): () => void {
  /* Only show on mobile devices with fullscreen support. */
  if (!isMobileDevice() || !isFullscreenAvailable()) {
    return () => {};
  }

  /* Don't show if already in fullscreen. */
  if (document.fullscreenElement) {
    return () => {};
  }

  const prompt = document.createElement('div');
  prompt.id = PROMPT_ID;

  /* Style: semi-transparent bar at the bottom of the screen. */
  Object.assign(prompt.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    width: '100%',
    padding: '14px',
    backgroundColor: 'rgba(13, 13, 26, 0.9)',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    fontSize: '14px',
    textAlign: 'center',
    zIndex: '9999',
    cursor: 'pointer',
    borderTop: '1px solid #4A4A6A',
    boxSizing: 'border-box',
  } as CSSStyleDeclaration);

  prompt.textContent = 'Tap to enter fullscreen';

  /**
   * Handles tap: attempts fullscreen then removes the prompt.
   * Must be called from a user gesture to satisfy browser requirements.
   */
  function handleTap(): void {
    try {
      scaleManager.startFullscreen();
    } catch {
      /* Fullscreen rejected by browser -- not critical. */
    }
    cleanup();
  }

  /** Removes the prompt and its event listener. */
  function cleanup(): void {
    prompt.removeEventListener('pointerdown', handleTap);
    prompt.remove();
  }

  prompt.addEventListener('pointerdown', handleTap);
  document.body.appendChild(prompt);

  /* Auto-dismiss after 5 seconds if the user doesn't tap. */
  const autoTimer = window.setTimeout(cleanup, 5000);

  return () => {
    window.clearTimeout(autoTimer);
    cleanup();
  };
}
