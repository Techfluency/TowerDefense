/**
 * Unit tests for ProgressionManager compatibility wrapper (BOLT-023).
 *
 * BOLT-021 originally implemented a level-based progression system.
 * BOLT-023 replaced it with SkillTreeManager. The ProgressionManager
 * is now a thin compatibility wrapper that:
 * - Delegates XP operations to SkillTreeManager
 * - Returns true for all tower/feature unlock checks (no gating)
 * - Returns 0 for level-related queries (no levels)
 * - Returns 0 for starting currency bonus (handled by skill tree globals)
 *
 * Tests verify the compatibility wrapper's behavior matches these rules.
 * Full skill tree logic is tested in skill-tree-manager.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProgressionManager,
  calculateRunXP,
} from '../../src/utils/progression-manager';
import type { XPRunData } from '../../src/utils/progression-manager';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const storageMap = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() { return storageMap.size; },
  key: vi.fn((_index: number) => null),
};

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// XP Calculation (re-exported from SkillTreeManager)
// ---------------------------------------------------------------------------

describe('calculateRunXP', () => {
  it('calculates XP from kills, waves, and bosses', () => {
    const data: XPRunData = { totalKills: 30, wavesSurvived: 5, bossKills: 1 };
    /* 30*1 + 5*10 + 1*50 = 130. */
    expect(calculateRunXP(data)).toBe(130);
  });

  it('returns 0 for an empty run', () => {
    const data: XPRunData = { totalKills: 0, wavesSurvived: 0, bossKills: 0 };
    expect(calculateRunXP(data)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ProgressionManager Compatibility Wrapper
// ---------------------------------------------------------------------------

describe('ProgressionManager', () => {
  describe('fresh profile', () => {
    it('starts with 0 total XP', () => {
      const pm = new ProgressionManager();
      expect(pm.getTotalXP()).toBe(0);
    });

    it('returns level 0 (levels removed)', () => {
      const pm = new ProgressionManager();
      expect(pm.getLevel()).toBe(0);
    });

    it('reports storage available', () => {
      const pm = new ProgressionManager();
      expect(pm.isStorageAvailable()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // All towers unlocked
  // -------------------------------------------------------------------------

  describe('tower unlocks (all available)', () => {
    it('Arrow Tower is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('ranged')).toBe(true);
    });

    it('Sniper Tower is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('focused')).toBe(true);
    });

    it('Shockwave Tower is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('broadcast')).toBe(true);
    });

    it('AA Missile Tower is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('antiair')).toBe(true);
    });

    it('unknown tower IDs return true', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('unknown')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // All features unlocked
  // -------------------------------------------------------------------------

  describe('feature unlocks (all available)', () => {
    it('tier4_branches is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isFeatureUnlocked('tier4_branches')).toBe(true);
    });

    it('speed_3x is unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isFeatureUnlocked('speed_3x')).toBe(true);
    });

    it('unknown feature keys return true', () => {
      const pm = new ProgressionManager();
      expect(pm.isFeatureUnlocked('nonexistent')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Level system removed
  // -------------------------------------------------------------------------

  describe('level system (removed)', () => {
    it('getLevel returns 0', () => {
      const pm = new ProgressionManager();
      expect(pm.getLevel()).toBe(0);
    });

    it('getXPToNextLevel returns 0', () => {
      const pm = new ProgressionManager();
      expect(pm.getXPToNextLevel()).toBe(0);
    });

    it('getXPInCurrentLevel returns 0', () => {
      const pm = new ProgressionManager();
      expect(pm.getXPInCurrentLevel()).toBe(0);
    });

    it('getProgressFraction returns 1 (bar full)', () => {
      const pm = new ProgressionManager();
      expect(pm.getProgressFraction()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Starting currency bonus (handled by skill tree globals)
  // -------------------------------------------------------------------------

  describe('starting currency bonus', () => {
    it('returns 0 (handled by SkillTreeManager global upgrades)', () => {
      const pm = new ProgressionManager();
      expect(pm.getStartingCurrencyBonus()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // XP Application (delegates to SkillTreeManager)
  // -------------------------------------------------------------------------

  describe('applyRunXP', () => {
    it('applies XP and returns result in legacy format', () => {
      const pm = new ProgressionManager();
      const result = pm.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(result.xpGained).toBe(100);
      expect(result.totalXP).toBe(100);
      expect(result.previousLevel).toBe(0);
      expect(result.newLevel).toBe(0);
      expect(result.newUnlocks).toHaveLength(0);
    });

    it('accumulates XP across runs', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      pm.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getTotalXP()).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // SkillTreeManager delegation
  // -------------------------------------------------------------------------

  describe('getSkillTreeManager', () => {
    it('returns the underlying SkillTreeManager', () => {
      const pm = new ProgressionManager();
      const stm = pm.getSkillTreeManager();
      expect(stm).toBeDefined();
      expect(stm.getAvailableXp()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('resetProgress', () => {
    it('resets all progression data', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 500, wavesSurvived: 0, bossKills: 0 });
      pm.resetProgress();
      expect(pm.getTotalXP()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence degradation
  // -------------------------------------------------------------------------

  describe('localStorage unavailable', () => {
    it('degrades gracefully', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => { throw new Error('SecurityError'); },
        setItem: () => { throw new Error('SecurityError'); },
        removeItem: () => { throw new Error('SecurityError'); },
      });

      const pm = new ProgressionManager();
      expect(pm.isStorageAvailable()).toBe(false);
      /* XP still works in-memory. */
      const result = pm.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      expect(result.xpGained).toBe(50);
    });
  });
});
