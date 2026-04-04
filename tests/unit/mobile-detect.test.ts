/**
 * Unit tests for mobile detection utilities (BOLT-022).
 *
 * Tests: mobile device detection, portrait orientation detection,
 * fullscreen availability, constants.
 *
 * Uses vi.stubGlobal to inject mock navigator/window/screen objects
 * for testing in the Node environment (no real DOM available).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers -- We re-import the module fresh for each test group
// to ensure our global stubs take effect before module evaluation.
// ---------------------------------------------------------------------------

describe('Mobile detect constants', () => {
  it('should export LONG_PRESS_DURATION_MS as 500', async () => {
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.LONG_PRESS_DURATION_MS).toBe(500);
  });

  it('should export MIN_TOUCH_TARGET_PX as 48', async () => {
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.MIN_TOUCH_TARGET_PX).toBe(48);
  });

  it('should export MIN_HUD_TOUCH_TARGET_PX as 44', async () => {
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.MIN_HUD_TOUCH_TARGET_PX).toBe(44);
  });

  it('should export LONG_PRESS_DURATION_MS less than 1 second', async () => {
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.LONG_PRESS_DURATION_MS).toBeLessThan(1000);
  });

  it('should export MIN_TOUCH_TARGET_PX >= 44 for accessibility', async () => {
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});

describe('isMobileDevice', () => {
  let originalNavigator: PropertyDescriptor | undefined;
  let originalWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    /* Restore originals. */
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    }
  });

  it('should return false when navigator is undefined', async () => {
    /* In a pure Node env without a DOM, navigator may or may not exist.
     * We test the function's defensive check. */
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
    /* Re-import to get fresh evaluation context. */
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    const result = mod.isMobileDevice();
    Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    expect(result).toBe(false);
  });

  it('should detect Android in user agent string', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6)', vendor: '', maxTouchPoints: 5 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 412, innerHeight: 915, ontouchstart: true },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(true);
  });

  it('should detect iPhone in user agent string', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)', vendor: '', maxTouchPoints: 5 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 390, innerHeight: 844, ontouchstart: true },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(true);
  });

  it('should detect iPad in user agent string', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0)', vendor: '', maxTouchPoints: 5 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1024, innerHeight: 768, ontouchstart: true },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(true);
  });

  it('should return false for desktop Chrome user agent without touch', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', vendor: '', maxTouchPoints: 0 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1920, innerHeight: 1080 },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(false);
  });

  it('should detect touch device with small screen via fallback', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; SomeOS) AppleWebKit/537.36', vendor: '', maxTouchPoints: 5 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 800, innerHeight: 600, ontouchstart: true },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(true);
  });

  it('should not detect large touch screen (Surface Pro) as mobile', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit', vendor: '', maxTouchPoints: 10 },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 2736, innerHeight: 1824, ontouchstart: true },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isMobileDevice()).toBe(false);
  });
});

describe('isPortraitOrientation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return false when window is undefined', async () => {
    const saved = globalThis.window;
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    const result = mod.isPortraitOrientation();
    Object.defineProperty(globalThis, 'window', { value: saved, configurable: true });
    expect(result).toBe(false);
  });

  it('should detect portrait from screen.orientation API', async () => {
    Object.defineProperty(globalThis, 'screen', {
      value: { orientation: { type: 'portrait-primary' } },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 414, innerHeight: 896 },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isPortraitOrientation()).toBe(true);
  });

  it('should detect landscape from screen.orientation API', async () => {
    Object.defineProperty(globalThis, 'screen', {
      value: { orientation: { type: 'landscape-primary' } },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 896, innerHeight: 414 },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isPortraitOrientation()).toBe(false);
  });

  it('should use window dimensions as fallback when screen.orientation unavailable', async () => {
    Object.defineProperty(globalThis, 'screen', {
      value: {},
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 414, innerHeight: 896 },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    expect(mod.isPortraitOrientation()).toBe(true);
  });
});

describe('isFullscreenAvailable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return false when document is undefined', async () => {
    const saved = globalThis.document;
    Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    const result = mod.isFullscreenAvailable();
    Object.defineProperty(globalThis, 'document', { value: saved, configurable: true });
    expect(result).toBe(false);
  });

  it('should return true when requestFullscreen exists', async () => {
    /* In Node with minimal DOM shims, document.documentElement may exist. */
    const saved = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      value: { documentElement: { requestFullscreen: () => Promise.resolve() } },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    const result = mod.isFullscreenAvailable();
    Object.defineProperty(globalThis, 'document', { value: saved, configurable: true });
    expect(result).toBe(true);
  });

  it('should return false when no fullscreen API exists', async () => {
    const saved = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      value: { documentElement: {} },
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('../../src/utils/mobile-detect');
    const result = mod.isFullscreenAvailable();
    Object.defineProperty(globalThis, 'document', { value: saved, configurable: true });
    expect(result).toBe(false);
  });
});
