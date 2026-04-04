/**
 * Unit tests for orientation overlay (BOLT-022).
 *
 * Tests: overlay creation logic, mobile/desktop branching, cleanup.
 * Mocks isMobileDevice/isPortraitOrientation since we cannot rely on
 * a real DOM in the Node test environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// DOM stubs -- minimal DOM surface needed by the overlay module
// ---------------------------------------------------------------------------

let mockOverlay: Record<string, unknown>;
let appendedChildren: unknown[];
let eventListeners: Record<string, Function[]>;

const mockIsMobile = vi.fn(() => true);
const mockIsPortrait = vi.fn(() => false);

vi.mock('../../src/utils/mobile-detect', () => ({
  isMobileDevice: () => mockIsMobile(),
  isPortraitOrientation: () => mockIsPortrait(),
}));

beforeEach(() => {
  mockIsMobile.mockReturnValue(true);
  mockIsPortrait.mockReturnValue(false);
  appendedChildren = [];
  eventListeners = {};

  mockOverlay = {
    id: '',
    style: {},
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
  };

  /* Stub document methods. */
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'div') {
        return { ...mockOverlay };
      }
      return mockOverlay;
    }),
    createElementNS: vi.fn(() => ({
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
    })),
    body: {
      appendChild: vi.fn((child: unknown) => {
        appendedChildren.push(child);
      }),
    },
  });

  vi.stubGlobal('window', {
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event]!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, _handler: Function) => {
      delete eventListeners[event];
    }),
    innerWidth: 896,
    innerHeight: 414,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initOrientationOverlay', () => {
  it('should append overlay to document.body on mobile', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();
    expect(appendedChildren.length).toBe(1);
  });

  it('should not append overlay on desktop', async () => {
    mockIsMobile.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();
    expect(appendedChildren.length).toBe(0);
  });

  it('should listen for resize and orientationchange events on mobile', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('orientationchange', expect.any(Function));
  });

  it('should return a cleanup function on mobile', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    const cleanup = mod.initOrientationOverlay();
    expect(typeof cleanup).toBe('function');
  });

  it('should return a no-op cleanup function on desktop', async () => {
    mockIsMobile.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/orientation-overlay');
    const cleanup = mod.initOrientationOverlay();
    expect(() => cleanup()).not.toThrow();
    expect(appendedChildren.length).toBe(0);
  });

  it('cleanup should call window.removeEventListener for resize', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    const cleanup = mod.initOrientationOverlay();
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('cleanup should call window.removeEventListener for orientationchange', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    const cleanup = mod.initOrientationOverlay();
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalledWith('orientationchange', expect.any(Function));
  });

  it('should show overlay (display flex) when portrait is detected', async () => {
    mockIsPortrait.mockReturnValue(true);
    vi.resetModules();
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    /* The overlay's style.display should have been set to 'flex'. */
    const appended = appendedChildren[0] as Record<string, Record<string, string>>;
    expect(appended.style.display).toBe('flex');
  });

  it('should hide overlay (display none) when landscape is detected', async () => {
    mockIsPortrait.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    const appended = appendedChildren[0] as Record<string, Record<string, string>>;
    expect(appended.style.display).toBe('none');
  });

  it('should set accessibility attributes on the overlay', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    const appended = appendedChildren[0] as Record<string, Function>;
    expect(appended.setAttribute).toHaveBeenCalledWith('role', 'alert');
    expect(appended.setAttribute).toHaveBeenCalledWith('aria-live', 'assertive');
  });

  it('should set overlay id to orientation-overlay', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    const appended = appendedChildren[0] as Record<string, string>;
    expect(appended.id).toBe('orientation-overlay');
  });

  it('should set z-index to 10000 to block game interaction', async () => {
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    const appended = appendedChildren[0] as Record<string, Record<string, string>>;
    expect(appended.style.zIndex).toBe('10000');
  });

  it('should toggle overlay on resize event', async () => {
    mockIsPortrait.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/orientation-overlay');
    mod.initOrientationOverlay();

    const appended = appendedChildren[0] as Record<string, Record<string, string>>;
    expect(appended.style.display).toBe('none');

    /* Simulate orientation change to portrait via the resize listener. */
    mockIsPortrait.mockReturnValue(true);
    const resizeHandlers = eventListeners['resize'];
    expect(resizeHandlers).toBeDefined();
    resizeHandlers![0]!();
    expect(appended.style.display).toBe('flex');
  });
});
