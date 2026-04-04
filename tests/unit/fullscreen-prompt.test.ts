/**
 * Unit tests for fullscreen prompt (BOLT-022).
 *
 * Tests: prompt creation, tap handler, auto-dismiss, desktop skip,
 * cleanup function. Uses global stubs since tests run in Node (no DOM).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsMobile = vi.fn(() => true);
const mockIsFullscreen = vi.fn(() => true);

vi.mock('../../src/utils/mobile-detect', () => ({
  isMobileDevice: () => mockIsMobile(),
  isFullscreenAvailable: () => mockIsFullscreen(),
}));

let appendedChildren: Array<Record<string, unknown>>;
let promptEventListeners: Record<string, Function>;

beforeEach(() => {
  mockIsMobile.mockReturnValue(true);
  mockIsFullscreen.mockReturnValue(true);
  appendedChildren = [];
  promptEventListeners = {};

  /* Stub document. */
  vi.stubGlobal('document', {
    createElement: vi.fn(() => {
      const el: Record<string, unknown> = {
        id: '',
        textContent: '',
        style: {},
        addEventListener: vi.fn((event: string, handler: Function) => {
          promptEventListeners[event] = handler;
        }),
        removeEventListener: vi.fn(),
        remove: vi.fn(),
      };
      return el;
    }),
    body: {
      appendChild: vi.fn((child: Record<string, unknown>) => {
        appendedChildren.push(child);
      }),
    },
    fullscreenElement: null,
  });

  vi.stubGlobal('window', {
    setTimeout: vi.fn((fn: Function, delay: number) => {
      return { fn, delay };
    }),
    clearTimeout: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showFullscreenPrompt', () => {
  function createMockScale() {
    return { startFullscreen: vi.fn() };
  }

  it('should create a prompt element on mobile with fullscreen support', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(appendedChildren.length).toBe(1);
  });

  it('should not create prompt on desktop', async () => {
    mockIsMobile.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(appendedChildren.length).toBe(0);
  });

  it('should not create prompt when fullscreen unavailable', async () => {
    mockIsFullscreen.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(appendedChildren.length).toBe(0);
  });

  it('should set prompt text content', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(appendedChildren[0]!.textContent).toBe('Tap to enter fullscreen');
  });

  it('should set prompt id', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(appendedChildren[0]!.id).toBe('fullscreen-prompt');
  });

  it('should register pointerdown event listener', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(promptEventListeners['pointerdown']).toBeDefined();
  });

  it('should call startFullscreen on tap', async () => {
    const scale = createMockScale();
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(scale);

    const tapHandler = promptEventListeners['pointerdown'];
    expect(tapHandler).toBeDefined();
    tapHandler!();

    expect(scale.startFullscreen).toHaveBeenCalled();
  });

  it('should remove prompt element on tap', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());

    const prompt = appendedChildren[0]!;
    const tapHandler = promptEventListeners['pointerdown'];
    tapHandler!();

    expect(prompt.remove).toHaveBeenCalled();
  });

  it('should not throw when startFullscreen throws', async () => {
    const scale = { startFullscreen: vi.fn(() => { throw new Error('blocked'); }) };
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(scale);

    const tapHandler = promptEventListeners['pointerdown'];
    expect(() => tapHandler!()).not.toThrow();
  });

  it('should set up auto-dismiss timer', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  it('should return a cleanup function', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    const cleanup = mod.showFullscreenPrompt(createMockScale());
    expect(typeof cleanup).toBe('function');
  });

  it('should return no-op cleanup on desktop', async () => {
    mockIsMobile.mockReturnValue(false);
    vi.resetModules();
    const mod = await import('../../src/ui/fullscreen-prompt');
    const cleanup = mod.showFullscreenPrompt(createMockScale());
    expect(() => cleanup()).not.toThrow();
  });

  it('should set z-index to 9999 (below orientation overlay)', async () => {
    const mod = await import('../../src/ui/fullscreen-prompt');
    mod.showFullscreenPrompt(createMockScale());
    const style = appendedChildren[0]!.style as Record<string, string>;
    expect(style.zIndex).toBe('9999');
  });
});
