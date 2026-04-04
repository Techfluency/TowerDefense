/**
 * Mobile device detection utilities.
 *
 * Provides functions to detect whether the game is running on a mobile/tablet
 * device and to determine orientation. Used by BOLT-022 (Mobile Responsive)
 * to auto-configure VFX quality, show orientation overlays, and enable
 * touch-specific UI behaviors.
 *
 * Detection uses a combination of user agent matching and screen dimension
 * heuristics. User agent alone is unreliable (desktop Chrome DevTools can
 * spoof it), so screen size is used as a secondary signal.
 */

/** Threshold below which a screen dimension (in CSS pixels) is considered mobile. */
const MOBILE_SCREEN_THRESHOLD = 1024;

/** Duration in ms for a long-press gesture (standard mobile convention). */
export const LONG_PRESS_DURATION_MS = 500;

/** Minimum touch target size in pixels per WCAG accessibility guidelines. */
export const MIN_TOUCH_TARGET_PX = 48;

/** HUD button minimum touch target (slightly smaller for always-visible controls). */
export const MIN_HUD_TOUCH_TARGET_PX = 44;

/**
 * Detects whether the current device is a mobile phone or tablet.
 * Uses user agent pattern matching with a screen size fallback.
 *
 * @returns True if the device is mobile or tablet, false for desktop.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  /* Check user agent for common mobile/tablet identifiers.
   * This catches iOS Safari, Android Chrome, and most mobile browsers. */
  const ua = navigator.userAgent || navigator.vendor || '';
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;
  if (mobileRegex.test(ua)) {
    return true;
  }

  /* Fallback: check for touch capability combined with small screen.
   * Desktop with touch screens (Surface Pro) will have large screens,
   * so the combination catches phones/tablets that have unusual UAs. */
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < MOBILE_SCREEN_THRESHOLD;
  return hasTouch && smallScreen;
}

/**
 * Detects whether the device is currently in portrait orientation.
 * Returns false on desktop or when orientation cannot be determined.
 *
 * @returns True if the device is in portrait mode (height > width).
 */
export function isPortraitOrientation(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  /* screen.orientation API is the most reliable source. */
  if (screen.orientation?.type) {
    return screen.orientation.type.startsWith('portrait');
  }

  /* Fallback: compare viewport dimensions. */
  return window.innerHeight > window.innerWidth;
}

/**
 * Detects whether the browser supports the Fullscreen API.
 * Used to determine whether to show the "Tap to enter fullscreen" prompt.
 *
 * @returns True if fullscreen is available.
 */
export function isFullscreenAvailable(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen
  );
}

/**
 * Attempts to enter fullscreen mode on the document element.
 * Silently fails if fullscreen is not available or the browser blocks it
 * (e.g., called outside a user gesture handler).
 */
export function requestFullscreen(): void {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {
      /* Browser rejected fullscreen -- not critical. */
    });
  } else {
    /* WebKit fallback for older Safari versions. */
    const webkitEl = el as unknown as { webkitRequestFullscreen?: () => void };
    if (webkitEl.webkitRequestFullscreen) {
      webkitEl.webkitRequestFullscreen();
    }
  }
}
