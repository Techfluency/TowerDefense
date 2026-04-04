/**
 * Unit tests for ProgressionManager (BOLT-021).
 *
 * Tests XP calculation, level curve, unlock logic, localStorage persistence,
 * starting currency bonuses, tower gating, and edge cases.
 * No Phaser dependency -- ProgressionManager is pure TypeScript.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProgressionManager,
  xpRequiredForLevel,
  totalXPForLevel,
  levelFromXP,
  calculateRunXP,
  MAX_LEVEL,
  XP_PER_KILL,
  XP_PER_WAVE,
  XP_PER_BOSS_KILL,
  STORAGE_KEY,
  UNLOCK_TABLE,
} from '../../src/utils/progression-manager';
import type { XPRunData, PlayerProfile } from '../../src/utils/progression-manager';

// ---------------------------------------------------------------------------
// localStorage mock -- vitest runs in Node where localStorage doesn't exist
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
// XP Curve Functions
// ---------------------------------------------------------------------------

describe('xpRequiredForLevel', () => {
  it('returns 100 for level 1', () => {
    expect(xpRequiredForLevel(1)).toBe(100);
  });

  it('returns 200 for level 2', () => {
    expect(xpRequiredForLevel(2)).toBe(200);
  });

  it('returns 1000 for level 10', () => {
    expect(xpRequiredForLevel(10)).toBe(1000);
  });

  it('returns 0 for level 0 or negative', () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(-1)).toBe(0);
  });
});

describe('totalXPForLevel', () => {
  it('returns 0 for level 1 (starting level)', () => {
    expect(totalXPForLevel(1)).toBe(0);
  });

  it('returns 100 for level 2 (need 100 XP to reach Lv2)', () => {
    expect(totalXPForLevel(2)).toBe(100);
  });

  it('returns 300 for level 3 (100 + 200)', () => {
    expect(totalXPForLevel(3)).toBe(300);
  });

  it('returns 600 for level 4 (100 + 200 + 300)', () => {
    expect(totalXPForLevel(4)).toBe(600);
  });

  it('returns 4500 for level 10', () => {
    /* Sum: 100+200+300+400+500+600+700+800+900 = 4500 */
    expect(totalXPForLevel(10)).toBe(4500);
  });

  it('total XP to max level is 5500', () => {
    /* To reach Lv10 is 4500, then Lv10 needs 1000 more = 5500 total to "complete" Lv10. */
    expect(totalXPForLevel(10) + xpRequiredForLevel(10)).toBe(5500);
  });
});

describe('levelFromXP', () => {
  it('returns level 1 for 0 XP', () => {
    expect(levelFromXP(0)).toBe(1);
  });

  it('returns level 1 for 99 XP (just below Lv2 threshold)', () => {
    expect(levelFromXP(99)).toBe(1);
  });

  it('returns level 2 for exactly 100 XP', () => {
    expect(levelFromXP(100)).toBe(2);
  });

  it('returns level 3 for exactly 300 XP', () => {
    expect(levelFromXP(300)).toBe(3);
  });

  it('returns MAX_LEVEL for very high XP', () => {
    expect(levelFromXP(999999)).toBe(MAX_LEVEL);
  });

  it('returns level 1 for negative XP', () => {
    expect(levelFromXP(-100)).toBe(1);
  });

  it('correctly maps boundary XP values for each level', () => {
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const floorXP = totalXPForLevel(lvl);
      expect(levelFromXP(floorXP)).toBe(lvl);
    }
  });
});

// ---------------------------------------------------------------------------
// XP Calculation
// ---------------------------------------------------------------------------

describe('calculateRunXP', () => {
  it('calculates XP from kills only', () => {
    const data: XPRunData = { totalKills: 50, wavesSurvived: 0, bossKills: 0 };
    expect(calculateRunXP(data)).toBe(50 * XP_PER_KILL);
  });

  it('calculates XP from waves only', () => {
    const data: XPRunData = { totalKills: 0, wavesSurvived: 10, bossKills: 0 };
    expect(calculateRunXP(data)).toBe(10 * XP_PER_WAVE);
  });

  it('calculates XP from boss kills only', () => {
    const data: XPRunData = { totalKills: 0, wavesSurvived: 0, bossKills: 2 };
    expect(calculateRunXP(data)).toBe(2 * XP_PER_BOSS_KILL);
  });

  it('sums all XP sources correctly', () => {
    const data: XPRunData = { totalKills: 30, wavesSurvived: 5, bossKills: 1 };
    const expected = 30 * XP_PER_KILL + 5 * XP_PER_WAVE + 1 * XP_PER_BOSS_KILL;
    expect(calculateRunXP(data)).toBe(expected);
  });

  it('returns 0 for an empty run', () => {
    const data: XPRunData = { totalKills: 0, wavesSurvived: 0, bossKills: 0 };
    expect(calculateRunXP(data)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ProgressionManager -- Construction & Defaults
// ---------------------------------------------------------------------------

describe('ProgressionManager', () => {
  describe('fresh profile', () => {
    it('starts at level 1 with 0 XP', () => {
      const pm = new ProgressionManager();
      expect(pm.getLevel()).toBe(1);
      expect(pm.getTotalXP()).toBe(0);
    });

    it('has Arrow Tower unlocked by default', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('ranged')).toBe(true);
    });

    it('does not have Sniper Tower unlocked at level 1', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('focused')).toBe(false);
    });

    it('reports XP to next level as 100', () => {
      const pm = new ProgressionManager();
      expect(pm.getXPToNextLevel()).toBe(100);
    });

    it('reports progress fraction as 0', () => {
      const pm = new ProgressionManager();
      expect(pm.getProgressFraction()).toBe(0);
    });

    it('reports storage available', () => {
      const pm = new ProgressionManager();
      expect(pm.isStorageAvailable()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // XP Application
  // -------------------------------------------------------------------------

  describe('applyRunXP', () => {
    it('applies XP from a run and advances level', () => {
      const pm = new ProgressionManager();
      const result = pm.applyRunXP({ totalKills: 50, wavesSurvived: 5, bossKills: 0 });

      /* 50*1 + 5*10 = 100 XP -- exactly level 2 threshold. */
      expect(result.xpGained).toBe(100);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(2);
      expect(pm.getLevel()).toBe(2);
    });

    it('returns new unlocks when leveling up', () => {
      const pm = new ProgressionManager();
      const result = pm.applyRunXP({ totalKills: 50, wavesSurvived: 5, bossKills: 0 });

      expect(result.newUnlocks).toHaveLength(1);
      expect(result.newUnlocks[0]!.id).toBe('tower_sniper');
    });

    it('handles multiple level-ups in a single run', () => {
      const pm = new ProgressionManager();
      /* 200 kills + 20 waves + 2 bosses = 200 + 200 + 100 = 500 XP -> Lv3 (needs 300) */
      const result = pm.applyRunXP({ totalKills: 200, wavesSurvived: 20, bossKills: 2 });

      expect(result.xpGained).toBe(500);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(3);
      expect(result.newUnlocks).toHaveLength(2);
      expect(result.newUnlocks.map(u => u.id)).toContain('tower_sniper');
      expect(result.newUnlocks.map(u => u.id)).toContain('tower_shockwave');
    });

    it('persists XP to localStorage', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 50, wavesSurvived: 5, bossKills: 0 });

      const stored = storageMap.get(STORAGE_KEY);
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!) as PlayerProfile;
      expect(parsed.totalXP).toBe(100);
    });

    it('accumulates XP across multiple runs', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 30, wavesSurvived: 3, bossKills: 0 });
      /* 30 + 30 = 60 XP */
      expect(pm.getTotalXP()).toBe(60);

      pm.applyRunXP({ totalKills: 20, wavesSurvived: 2, bossKills: 0 });
      /* 60 + 40 = 100 XP */
      expect(pm.getTotalXP()).toBe(100);
      expect(pm.getLevel()).toBe(2);
    });

    it('caps at MAX_LEVEL but continues accumulating XP', () => {
      const pm = new ProgressionManager();
      /* Give massive XP to reach max level. */
      pm.applyRunXP({ totalKills: 5500, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getLevel()).toBe(MAX_LEVEL);

      /* More XP still accumulates. */
      pm.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getTotalXP()).toBe(5600);
      expect(pm.getLevel()).toBe(MAX_LEVEL);
    });

    it('reports 0 XP to next level at max level', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 5500, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getXPToNextLevel()).toBe(0);
      expect(pm.getProgressFraction()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Tower Unlock Gating
  // -------------------------------------------------------------------------

  describe('tower unlock gating', () => {
    it('Arrow Tower is always unlocked', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('ranged')).toBe(true);
    });

    it('Sniper Tower requires level 2', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('focused')).toBe(false);

      pm.applyRunXP({ totalKills: 50, wavesSurvived: 5, bossKills: 0 });
      expect(pm.isTowerUnlocked('focused')).toBe(true);
    });

    it('Shockwave Tower requires level 3', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('broadcast')).toBe(false);

      /* 300 XP to reach level 3. */
      pm.applyRunXP({ totalKills: 100, wavesSurvived: 20, bossKills: 0 });
      expect(pm.isTowerUnlocked('broadcast')).toBe(true);
    });

    it('AA Missile Tower requires level 4', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('antiair')).toBe(false);

      /* 600 XP to reach level 4. */
      pm.applyRunXP({ totalKills: 200, wavesSurvived: 20, bossKills: 4 });
      expect(pm.isTowerUnlocked('antiair')).toBe(true);
    });

    it('returns true for unknown tower IDs (future-proofing)', () => {
      const pm = new ProgressionManager();
      expect(pm.isTowerUnlocked('unknown_tower')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Starting Currency Bonus
  // -------------------------------------------------------------------------

  describe('starting currency bonus', () => {
    it('returns 0 at level 1', () => {
      const pm = new ProgressionManager();
      expect(pm.getStartingCurrencyBonus()).toBe(0);
    });

    it('returns 25 at level 5', () => {
      const pm = new ProgressionManager();
      /* Level 5 floor = totalXPForLevel(5) = 1000 */
      pm.applyRunXP({ totalKills: 1000, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getLevel()).toBe(5);
      expect(pm.getStartingCurrencyBonus()).toBe(25);
    });

    it('returns 75 at level 8+ (25 + 50 stacked)', () => {
      const pm = new ProgressionManager();
      /* Level 8 floor = totalXPForLevel(8) = 2800 */
      pm.applyRunXP({ totalKills: 2800, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getLevel()).toBe(8);
      expect(pm.getStartingCurrencyBonus()).toBe(75);
    });
  });

  // -------------------------------------------------------------------------
  // Feature Unlocks
  // -------------------------------------------------------------------------

  describe('feature unlocks', () => {
    it('tier4_branches not unlocked at level 5', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 1000, wavesSurvived: 0, bossKills: 0 });
      expect(pm.isFeatureUnlocked('tier4_branches')).toBe(false);
    });

    it('tier4_branches unlocked at level 6', () => {
      const pm = new ProgressionManager();
      /* Level 6 floor = totalXPForLevel(6) = 1500 */
      pm.applyRunXP({ totalKills: 1500, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getLevel()).toBe(6);
      expect(pm.isFeatureUnlocked('tier4_branches')).toBe(true);
    });

    it('speed_3x unlocked at level 7', () => {
      const pm = new ProgressionManager();
      /* Level 7 floor = totalXPForLevel(7) = 2100 */
      pm.applyRunXP({ totalKills: 2100, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getLevel()).toBe(7);
      expect(pm.isFeatureUnlocked('speed_3x')).toBe(true);
    });

    it('returns false for unknown feature key', () => {
      const pm = new ProgressionManager();
      expect(pm.isFeatureUnlocked('nonexistent_feature')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('localStorage persistence', () => {
    it('loads existing profile from localStorage', () => {
      const profile: PlayerProfile = {
        version: 1,
        totalXP: 500,
        unlockedItems: ['tower_arrow', 'tower_sniper', 'tower_shockwave'],
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(profile));

      const pm = new ProgressionManager();
      expect(pm.getTotalXP()).toBe(500);
      expect(pm.getLevel()).toBe(3);
    });

    it('handles corrupt JSON gracefully', () => {
      storageMap.set(STORAGE_KEY, '{not valid json!!!');

      const pm = new ProgressionManager();
      expect(pm.getTotalXP()).toBe(0);
      expect(pm.getLevel()).toBe(1);
    });

    it('handles missing fields gracefully', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify({ version: 1 }));

      const pm = new ProgressionManager();
      expect(pm.getTotalXP()).toBe(0);
    });

    it('handles negative XP in stored data', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify({
        version: 1, totalXP: -100, unlockedItems: [],
      }));

      const pm = new ProgressionManager();
      expect(pm.getTotalXP()).toBe(0);
    });

    it('filters non-string items from unlockedItems', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify({
        version: 1, totalXP: 100, unlockedItems: ['tower_arrow', 42, null],
      }));

      const pm = new ProgressionManager();
      const profile = pm.getProfile();
      expect(profile.unlockedItems).toEqual(['tower_arrow']);
    });

    it('degrades gracefully when localStorage throws', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => { throw new Error('SecurityError'); },
        setItem: () => { throw new Error('SecurityError'); },
        removeItem: () => { throw new Error('SecurityError'); },
      });

      const pm = new ProgressionManager();
      expect(pm.isStorageAvailable()).toBe(false);
      expect(pm.getLevel()).toBe(1);

      /* XP still works in-memory. */
      const result = pm.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(result.xpGained).toBe(100);
      expect(pm.getLevel()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('resetProgress', () => {
    it('resets to default profile', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 1000, wavesSurvived: 20, bossKills: 5 });
      expect(pm.getLevel()).toBeGreaterThan(1);

      pm.resetProgress();
      expect(pm.getLevel()).toBe(1);
      expect(pm.getTotalXP()).toBe(0);
    });

    it('clears localStorage on reset', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      pm.resetProgress();

      const stored = storageMap.get(STORAGE_KEY);
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!) as PlayerProfile;
      expect(parsed.totalXP).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Unlock Table
  // -------------------------------------------------------------------------

  describe('unlock table', () => {
    it('has exactly 10 entries', () => {
      expect(UNLOCK_TABLE).toHaveLength(10);
    });

    it('has unique IDs', () => {
      const ids = UNLOCK_TABLE.map(e => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique levels (one unlock per level)', () => {
      const levels = UNLOCK_TABLE.map(e => e.level);
      expect(new Set(levels).size).toBe(levels.length);
    });

    it('covers levels 1 through 10', () => {
      const levels = UNLOCK_TABLE.map(e => e.level).sort((a, b) => a - b);
      expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('getUnlockTable returns a copy', () => {
      const pm = new ProgressionManager();
      const table = pm.getUnlockTable();
      table.pop();
      expect(pm.getUnlockTable()).toHaveLength(10);
    });

    it('getUnlockedEntries returns only unlocked entries', () => {
      const pm = new ProgressionManager();
      expect(pm.getUnlockedEntries()).toHaveLength(1);

      pm.applyRunXP({ totalKills: 300, wavesSurvived: 0, bossKills: 0 });
      /* 300 XP = Level 3, entries for Lv1, Lv2, Lv3. */
      expect(pm.getUnlockedEntries()).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Progress Fraction
  // -------------------------------------------------------------------------

  describe('progress fraction', () => {
    it('returns 0 at level floor', () => {
      const pm = new ProgressionManager();
      expect(pm.getProgressFraction()).toBe(0);
    });

    it('returns 0.5 at halfway through a level', () => {
      const pm = new ProgressionManager();
      /* Level 1 needs 100 XP. At 50 XP we're halfway. */
      pm.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getProgressFraction()).toBe(0.5);
    });

    it('returns 1.0 at max level', () => {
      const pm = new ProgressionManager();
      pm.applyRunXP({ totalKills: 5500, wavesSurvived: 0, bossKills: 0 });
      expect(pm.getProgressFraction()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // isUnlocked
  // -------------------------------------------------------------------------

  describe('isUnlocked', () => {
    it('returns true for unlocked items', () => {
      const pm = new ProgressionManager();
      expect(pm.isUnlocked('tower_arrow')).toBe(true);
    });

    it('returns false for locked items', () => {
      const pm = new ProgressionManager();
      expect(pm.isUnlocked('tower_sniper')).toBe(false);
    });

    it('returns false for nonexistent IDs', () => {
      const pm = new ProgressionManager();
      expect(pm.isUnlocked('does_not_exist')).toBe(false);
    });
  });
});
