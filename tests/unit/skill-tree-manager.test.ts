/**
 * Unit tests for SkillTreeManager (BOLT-023).
 *
 * Tests purchase logic, prerequisite enforcement, XP balance tracking,
 * bonus computation, migration from old format, localStorage persistence,
 * capstone purchases, global upgrades, and edge cases.
 * No Phaser dependency -- SkillTreeManager is pure TypeScript.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SkillTreeManager,
  calculateRunXP,
  STORAGE_KEY,
  OLD_STORAGE_KEY,
  MAX_STAT_TIER,
  MAX_GLOBAL_TIER,
  TOWER_IDS,
  STAT_NAMES,
  XP_PER_KILL,
  XP_PER_WAVE,
  XP_PER_BOSS_KILL,
} from '../../src/utils/skill-tree-manager';
import type { XPRunData } from '../../src/utils/skill-tree-manager';
import type { SkillTreeConfig, SkillTreeProfile } from '../../src/types/game-types';

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
// Test config fixture matching skill-tree.json
// ---------------------------------------------------------------------------

function createTestConfig(): SkillTreeConfig {
  return {
    towerStats: {
      costs: [25, 50, 100, 175, 250],
      bonusPerTier: {
        damage: [0.05, 0.10, 0.15, 0.20, 0.25],
        fireRate: [0.05, 0.10, 0.15, 0.20, 0.25],
        range: [0.05, 0.08, 0.12, 0.16, 0.20],
        upgradeDiscount: [0.05, 0.10, 0.15, 0.20, 0.25],
      },
    },
    capstones: [
      {
        id: 'ranged_steady_aim',
        towerId: 'ranged',
        name: 'Steady Aim',
        description: 'Test capstone mid',
        cost: 150,
        tier: 'mid',
        prerequisites: [
          { stat: 'damage', minTier: 2 },
          { stat: 'fireRate', minTier: 2 },
          { stat: 'range', minTier: 2 },
          { stat: 'upgradeDiscount', minTier: 2 },
        ],
        requiredCount: 2,
        effectKey: 'steady_aim',
        effectParams: { damageBonus: 0.15 },
      },
      {
        id: 'ranged_barrage',
        towerId: 'ranged',
        name: 'Barrage',
        description: 'Test capstone mastery',
        cost: 400,
        tier: 'mastery',
        prerequisites: [
          { stat: 'damage', minTier: 4 },
          { stat: 'fireRate', minTier: 4 },
          { stat: 'range', minTier: 4 },
          { stat: 'upgradeDiscount', minTier: 4 },
        ],
        requiredCount: 3,
        effectKey: 'barrage',
        effectParams: { shotsPerCycle: 5, extraProjectiles: 1 },
      },
    ],
    globalUpgrades: [
      {
        id: 'tower_hp',
        name: 'Tower HP',
        description: 'Test global upgrade',
        costs: [50, 125, 250],
        bonusPerTier: [0.10, 0.20, 0.35],
        bonusType: 'percentage',
        appliesTo: 'towerHp',
      },
      {
        id: 'tower_regen',
        name: 'Tower Regen',
        description: 'Test global regen',
        costs: [50, 125, 250],
        bonusPerTier: [1, 2, 4],
        bonusType: 'flat',
        appliesTo: 'towerRegen',
      },
      {
        id: 'start_currency',
        name: 'Starting Currency',
        description: 'Test start currency',
        costs: [50, 125, 250],
        bonusPerTier: [15, 35, 60],
        bonusType: 'flat',
        appliesTo: 'startCurrency',
      },
      {
        id: 'wave_income',
        name: 'Wave Income',
        description: 'Test wave income',
        costs: [50, 125, 250],
        bonusPerTier: [0.10, 0.20, 0.30],
        bonusType: 'percentage',
        appliesTo: 'waveIncome',
      },
      {
        id: 'xp_boost',
        name: 'XP Boost',
        description: 'Test XP boost',
        costs: [50, 125, 250],
        bonusPerTier: [0.10, 0.20, 0.35],
        bonusType: 'percentage',
        appliesTo: 'xpBoost',
      },
      {
        id: 'sell_refund',
        name: 'Sell Refund',
        description: 'Test sell refund',
        costs: [50, 125, 250],
        bonusPerTier: [0.05, 0.10, 0.15],
        bonusType: 'percentage',
        appliesTo: 'sellRefund',
      },
    ],
  };
}

/** Helper: creates a SkillTreeManager with config bound and initial XP. */
function createManager(initialXp = 0): SkillTreeManager {
  const mgr = new SkillTreeManager();
  mgr.setConfig(createTestConfig());
  if (initialXp > 0) {
    mgr.applyRunXP({ totalKills: initialXp, wavesSurvived: 0, bossKills: 0 });
  }
  return mgr;
}

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

  it('sums all XP sources', () => {
    const data: XPRunData = { totalKills: 30, wavesSurvived: 5, bossKills: 1 };
    expect(calculateRunXP(data)).toBe(30 + 50 + 50);
  });

  it('returns 0 for an empty run', () => {
    const data: XPRunData = { totalKills: 0, wavesSurvived: 0, bossKills: 0 };
    expect(calculateRunXP(data)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fresh Profile
// ---------------------------------------------------------------------------

describe('SkillTreeManager', () => {
  describe('fresh profile', () => {
    it('starts with 0 XP earned and 0 XP spent', () => {
      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(0);
      expect(mgr.getTotalXpSpent()).toBe(0);
      expect(mgr.getAvailableXp()).toBe(0);
    });

    it('has no tower upgrades', () => {
      const mgr = new SkillTreeManager();
      expect(mgr.getTowerState('ranged')).toBeUndefined();
    });

    it('reports storage available', () => {
      const mgr = new SkillTreeManager();
      expect(mgr.isStorageAvailable()).toBe(true);
    });

    it('creates a default profile with correct shape', () => {
      const profile = SkillTreeManager.createDefaultProfile();
      expect(profile.totalXpEarned).toBe(0);
      expect(profile.totalXpSpent).toBe(0);
      expect(Object.keys(profile.towerUpgrades)).toHaveLength(0);
      expect(Object.keys(profile.globalUpgrades)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // XP Application
  // -------------------------------------------------------------------------

  describe('applyRunXP', () => {
    it('adds XP to totalXpEarned', () => {
      const mgr = createManager();
      const result = mgr.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(result.xpGained).toBe(100);
      expect(result.totalXpEarned).toBe(100);
      expect(mgr.getAvailableXp()).toBe(100);
    });

    it('accumulates XP across multiple runs', () => {
      const mgr = createManager();
      mgr.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      mgr.applyRunXP({ totalKills: 50, wavesSurvived: 0, bossKills: 0 });
      expect(mgr.getTotalXpEarned()).toBe(100);
      expect(mgr.getAvailableXp()).toBe(100);
    });

    it('persists to localStorage', () => {
      const mgr = createManager();
      mgr.applyRunXP({ totalKills: 200, wavesSurvived: 0, bossKills: 0 });
      const stored = storageMap.get(STORAGE_KEY);
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!) as SkillTreeProfile;
      expect(parsed.totalXpEarned).toBe(200);
    });

    it('applies XP boost from global upgrades', () => {
      const mgr = createManager(500);
      /* Purchase XP boost tier 1: +10% XP. Costs 50 XP. */
      expect(mgr.purchaseGlobalTier('xp_boost')).toBe(true);
      /* 100 base kills * 1.10 boost = 110 XP. */
      const result = mgr.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(result.baseXpGained).toBe(100);
      expect(result.xpGained).toBe(110);
    });
  });

  // -------------------------------------------------------------------------
  // Stat Tier Purchase
  // -------------------------------------------------------------------------

  describe('purchaseStatTier', () => {
    it('purchases tier 1 of damage for ranged tower', () => {
      const mgr = createManager(100);
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(true);
      expect(mgr.getStatTier('ranged', 'damage')).toBe(1);
      /* Tier 1 costs 25 XP. */
      expect(mgr.getAvailableXp()).toBe(75);
    });

    it('purchases sequential tiers', () => {
      const mgr = createManager(1000);
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(true); // 25
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(true); // 50
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(true); // 100
      expect(mgr.getStatTier('ranged', 'damage')).toBe(3);
      expect(mgr.getTotalXpSpent()).toBe(175); // 25+50+100
    });

    it('rejects purchase when at max tier', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_STAT_TIER; i++) {
        expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(true);
      }
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(false);
      expect(mgr.getStatTier('ranged', 'damage')).toBe(MAX_STAT_TIER);
    });

    it('rejects purchase with insufficient XP', () => {
      const mgr = createManager(20); // need 25 for tier 1
      expect(mgr.purchaseStatTier('ranged', 'damage')).toBe(false);
      expect(mgr.getStatTier('ranged', 'damage')).toBe(0);
    });

    it('deducts correct XP for each tier', () => {
      const mgr = createManager(600);
      const expectedCosts = [25, 50, 100, 175, 250];
      let totalSpent = 0;
      for (let i = 0; i < MAX_STAT_TIER; i++) {
        expect(mgr.purchaseStatTier('focused', 'fireRate')).toBe(true);
        totalSpent += expectedCosts[i]!;
        expect(mgr.getTotalXpSpent()).toBe(totalSpent);
      }
      expect(totalSpent).toBe(600);
    });

    it('works for all tower IDs', () => {
      const mgr = createManager(500);
      for (const towerId of TOWER_IDS) {
        expect(mgr.purchaseStatTier(towerId, 'damage')).toBe(true);
        expect(mgr.getStatTier(towerId, 'damage')).toBe(1);
      }
    });

    it('works for all stat names', () => {
      const mgr = createManager(500);
      for (const stat of STAT_NAMES) {
        expect(mgr.purchaseStatTier('ranged', stat)).toBe(true);
        expect(mgr.getStatTier('ranged', stat)).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Global Tier Purchase
  // -------------------------------------------------------------------------

  describe('purchaseGlobalTier', () => {
    it('purchases tier 1 of tower_hp', () => {
      const mgr = createManager(500);
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(true);
      expect(mgr.getGlobalTier('tower_hp')).toBe(1);
      expect(mgr.getTotalXpSpent()).toBe(50);
    });

    it('purchases all 3 tiers', () => {
      const mgr = createManager(500);
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(true); // 50
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(true); // 125
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(true); // 250
      expect(mgr.getGlobalTier('tower_hp')).toBe(3);
      expect(mgr.getTotalXpSpent()).toBe(425);
    });

    it('rejects purchase at max tier', () => {
      const mgr = createManager(1000);
      for (let i = 0; i < MAX_GLOBAL_TIER; i++) {
        mgr.purchaseGlobalTier('tower_hp');
      }
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(false);
    });

    it('rejects unknown upgrade ID', () => {
      const mgr = createManager(500);
      expect(mgr.purchaseGlobalTier('nonexistent')).toBe(false);
    });

    it('rejects when XP is insufficient', () => {
      const mgr = createManager(30); // tier 1 costs 50
      expect(mgr.purchaseGlobalTier('tower_hp')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Capstone Purchase
  // -------------------------------------------------------------------------

  describe('purchaseCapstone', () => {
    it('purchases mid capstone when prerequisites met', () => {
      const mgr = createManager(5000);
      /* Mid capstone needs 2 stats at tier 2. Buy damage and fireRate to tier 2. */
      mgr.purchaseStatTier('ranged', 'damage'); // tier 1: 25
      mgr.purchaseStatTier('ranged', 'damage'); // tier 2: 50
      mgr.purchaseStatTier('ranged', 'fireRate'); // tier 1: 25
      mgr.purchaseStatTier('ranged', 'fireRate'); // tier 2: 50

      expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(true);
      const state = mgr.getTowerState('ranged');
      expect(state?.midCapstone).toBe(true);
    });

    it('rejects mid capstone when prerequisites not met', () => {
      const mgr = createManager(5000);
      /* Only 1 stat at tier 2 -- need 2. */
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'damage');

      expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(false);
    });

    it('rejects mastery capstone with only 2 stats at tier 4', () => {
      const mgr = createManager(10000);
      /* Need 3 stats at tier 4. Buy only 2 to tier 4. */
      for (let i = 0; i < 4; i++) {
        mgr.purchaseStatTier('ranged', 'damage');
        mgr.purchaseStatTier('ranged', 'fireRate');
      }
      expect(mgr.purchaseCapstone('ranged_barrage')).toBe(false);
    });

    it('purchases mastery capstone with 3 stats at tier 4', () => {
      const mgr = createManager(10000);
      /* Buy 3 stats to tier 4. */
      for (let i = 0; i < 4; i++) {
        mgr.purchaseStatTier('ranged', 'damage');
        mgr.purchaseStatTier('ranged', 'fireRate');
        mgr.purchaseStatTier('ranged', 'range');
      }
      expect(mgr.purchaseCapstone('ranged_barrage')).toBe(true);
      expect(mgr.getTowerState('ranged')?.masteryCapstone).toBe(true);
    });

    it('rejects already-purchased capstone', () => {
      const mgr = createManager(10000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'fireRate');
      mgr.purchaseStatTier('ranged', 'fireRate');
      mgr.purchaseCapstone('ranged_steady_aim');

      expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(false);
    });

    it('rejects capstone with insufficient XP', () => {
      /* Set up prerequisites but not enough XP for the capstone itself. */
      const mgr = createManager(160);
      mgr.purchaseStatTier('ranged', 'damage'); // 25
      mgr.purchaseStatTier('ranged', 'damage'); // 50
      mgr.purchaseStatTier('ranged', 'fireRate'); // 25
      mgr.purchaseStatTier('ranged', 'fireRate'); // 50
      /* 160 - 150 = 10 XP remaining. Capstone costs 150. */
      expect(mgr.getAvailableXp()).toBe(10);
      expect(mgr.purchaseCapstone('ranged_steady_aim')).toBe(false);
    });

    it('rejects unknown capstone ID', () => {
      const mgr = createManager(5000);
      expect(mgr.purchaseCapstone('nonexistent_capstone')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // canPurchase (unified)
  // -------------------------------------------------------------------------

  describe('canPurchase', () => {
    it('returns true for affordable stat tier', () => {
      const mgr = createManager(100);
      expect(mgr.canPurchase('ranged:damage')).toBe(true);
    });

    it('returns false for unaffordable stat tier', () => {
      const mgr = createManager(10);
      expect(mgr.canPurchase('ranged:damage')).toBe(false);
    });

    it('returns false for maxed stat', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_STAT_TIER; i++) {
        mgr.purchaseStatTier('ranged', 'damage');
      }
      expect(mgr.canPurchase('ranged:damage')).toBe(false);
    });

    it('returns true for affordable global tier', () => {
      const mgr = createManager(100);
      expect(mgr.canPurchase('global:tower_hp')).toBe(true);
    });

    it('returns false for unaffordable global tier', () => {
      const mgr = createManager(30);
      expect(mgr.canPurchase('global:tower_hp')).toBe(false);
    });

    it('returns true for affordable capstone with prerequisites met', () => {
      const mgr = createManager(5000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'fireRate');
      mgr.purchaseStatTier('ranged', 'fireRate');
      expect(mgr.canPurchase('ranged_steady_aim')).toBe(true);
    });

    it('returns false for capstone with unmet prerequisites', () => {
      const mgr = createManager(5000);
      expect(mgr.canPurchase('ranged_steady_aim')).toBe(false);
    });

    it('returns false without config', () => {
      const mgr = new SkillTreeManager();
      /* No setConfig() called. */
      expect(mgr.canPurchase('ranged:damage')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Bonus Computation: Tower Stats
  // -------------------------------------------------------------------------

  describe('getTowerStatMultipliers', () => {
    it('returns 1.0 for all stats with no upgrades', () => {
      const mgr = createManager();
      const mult = mgr.getTowerStatMultipliers('ranged');
      expect(mult.damage).toBe(1.0);
      expect(mult.fireRate).toBe(1.0);
      expect(mult.range).toBe(1.0);
      expect(mult.upgradeDiscount).toBe(1.0);
    });

    it('calculates cumulative damage bonus', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'damage'); // +5%
      mgr.purchaseStatTier('ranged', 'damage'); // +10%
      mgr.purchaseStatTier('ranged', 'damage'); // +15%
      const mult = mgr.getTowerStatMultipliers('ranged');
      /* Cumulative: 0.05 + 0.10 + 0.15 = 0.30 -> multiplier = 1.30. */
      expect(mult.damage).toBeCloseTo(1.30);
    });

    it('calculates cumulative range bonus (non-uniform)', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'range'); // +5%
      mgr.purchaseStatTier('ranged', 'range'); // +8%
      const mult = mgr.getTowerStatMultipliers('ranged');
      /* 0.05 + 0.08 = 0.13 -> 1.13. */
      expect(mult.range).toBeCloseTo(1.13);
    });

    it('calculates upgrade discount as cost reduction', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'upgradeDiscount'); // -5%
      mgr.purchaseStatTier('ranged', 'upgradeDiscount'); // -10%
      const mult = mgr.getTowerStatMultipliers('ranged');
      /* 0.05 + 0.10 = 0.15 -> cost multiplier = 0.85. */
      expect(mult.upgradeDiscount).toBeCloseTo(0.85);
    });

    it('calculates max tier bonuses correctly', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_STAT_TIER; i++) {
        mgr.purchaseStatTier('ranged', 'damage');
      }
      const mult = mgr.getTowerStatMultipliers('ranged');
      /* 0.05+0.10+0.15+0.20+0.25 = 0.75 -> 1.75. */
      expect(mult.damage).toBeCloseTo(1.75);
    });
  });

  // -------------------------------------------------------------------------
  // Bonus Computation: Global
  // -------------------------------------------------------------------------

  describe('getGlobalBonuses', () => {
    it('returns defaults with no upgrades', () => {
      const mgr = createManager();
      const bonuses = mgr.getGlobalBonuses();
      expect(bonuses.towerHpMultiplier).toBe(1.0);
      expect(bonuses.towerRegenPerSec).toBe(0);
      expect(bonuses.startingCurrencyBonus).toBe(0);
      expect(bonuses.waveIncomeMultiplier).toBe(1.0);
      expect(bonuses.xpMultiplier).toBe(1.0);
      expect(bonuses.sellRefundBonus).toBe(0);
    });

    it('calculates tower HP multiplier', () => {
      const mgr = createManager(500);
      mgr.purchaseGlobalTier('tower_hp'); // +10%
      mgr.purchaseGlobalTier('tower_hp'); // +20%
      const bonuses = mgr.getGlobalBonuses();
      /* 0.10 + 0.20 = 0.30 -> 1.30. */
      expect(bonuses.towerHpMultiplier).toBeCloseTo(1.30);
    });

    it('calculates tower regen (flat)', () => {
      const mgr = createManager(500);
      mgr.purchaseGlobalTier('tower_regen'); // 1 HP/s
      mgr.purchaseGlobalTier('tower_regen'); // 2 HP/s
      const bonuses = mgr.getGlobalBonuses();
      /* 1 + 2 = 3 HP/s. */
      expect(bonuses.towerRegenPerSec).toBe(3);
    });

    it('calculates starting currency bonus (flat)', () => {
      const mgr = createManager(500);
      mgr.purchaseGlobalTier('start_currency'); // +15
      mgr.purchaseGlobalTier('start_currency'); // +35
      const bonuses = mgr.getGlobalBonuses();
      /* 15 + 35 = 50. */
      expect(bonuses.startingCurrencyBonus).toBe(50);
    });

    it('calculates XP multiplier', () => {
      const mgr = createManager(500);
      mgr.purchaseGlobalTier('xp_boost'); // +10%
      const bonuses = mgr.getGlobalBonuses();
      expect(bonuses.xpMultiplier).toBeCloseTo(1.10);
    });

    it('calculates max tier global bonuses', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_GLOBAL_TIER; i++) {
        mgr.purchaseGlobalTier('tower_hp');
      }
      const bonuses = mgr.getGlobalBonuses();
      /* 0.10 + 0.20 + 0.35 = 0.65 -> 1.65. */
      expect(bonuses.towerHpMultiplier).toBeCloseTo(1.65);
    });
  });

  // -------------------------------------------------------------------------
  // RunBonuses Computation
  // -------------------------------------------------------------------------

  describe('computeRunBonuses', () => {
    it('returns default bonuses with no upgrades', () => {
      const mgr = createManager();
      const bonuses = mgr.computeRunBonuses();
      expect(bonuses.towerMultipliers['ranged']?.damage).toBe(1.0);
      expect(bonuses.towerCapstones['ranged']).toEqual([]);
      expect(bonuses.global.towerHpMultiplier).toBe(1.0);
    });

    it('includes tower stat multipliers', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'damage');
      const bonuses = mgr.computeRunBonuses();
      expect(bonuses.towerMultipliers['ranged']?.damage).toBeCloseTo(1.15);
    });

    it('includes active capstone effects', () => {
      const mgr = createManager(5000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseStatTier('ranged', 'fireRate');
      mgr.purchaseStatTier('ranged', 'fireRate');
      mgr.purchaseCapstone('ranged_steady_aim');
      const bonuses = mgr.computeRunBonuses();
      expect(bonuses.towerCapstones['ranged']).toContain('steady_aim');
    });

    it('includes all 4 tower IDs', () => {
      const mgr = createManager();
      const bonuses = mgr.computeRunBonuses();
      for (const towerId of TOWER_IDS) {
        expect(bonuses.towerMultipliers[towerId]).toBeDefined();
        expect(bonuses.towerCapstones[towerId]).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Migration from old profile (BOLT-021)
  // -------------------------------------------------------------------------

  describe('migration from old profile', () => {
    it('migrates old totalXP to new totalXpEarned', () => {
      /* Simulate old BOLT-021 profile. */
      const oldProfile = { version: 1, totalXP: 500, unlockedItems: ['tower_arrow'] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(500);
      expect(mgr.getTotalXpSpent()).toBe(0);
      expect(mgr.getAvailableXp()).toBe(500);
    });

    it('deletes old key after migration', () => {
      const oldProfile = { version: 1, totalXP: 300, unlockedItems: [] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      new SkillTreeManager();
      expect(storageMap.has(OLD_STORAGE_KEY)).toBe(false);
    });

    it('creates new key after migration', () => {
      const oldProfile = { version: 1, totalXP: 300, unlockedItems: [] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      new SkillTreeManager();
      expect(storageMap.has(STORAGE_KEY)).toBe(true);
    });

    it('does not migrate if new key already exists', () => {
      const oldProfile = { version: 1, totalXP: 500, unlockedItems: [] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      const newProfile: SkillTreeProfile = {
        totalXpEarned: 100,
        totalXpSpent: 50,
        towerUpgrades: {},
        globalUpgrades: {},
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(newProfile));

      const mgr = new SkillTreeManager();
      /* Should use existing new profile, not migrate. */
      expect(mgr.getTotalXpEarned()).toBe(100);
      /* Old key should still exist (not deleted). */
      expect(storageMap.has(OLD_STORAGE_KEY)).toBe(true);
    });

    it('handles corrupt old profile gracefully', () => {
      storageMap.set(OLD_STORAGE_KEY, '{not valid json!!!');

      const mgr = new SkillTreeManager();
      /* Should create fresh profile. */
      expect(mgr.getTotalXpEarned()).toBe(0);
    });

    it('treats negative old totalXP as 0', () => {
      const oldProfile = { version: 1, totalXP: -100, unlockedItems: [] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(0);
    });

    it('treats missing old totalXP as 0', () => {
      const oldProfile = { version: 1, unlockedItems: [] };
      storageMap.set(OLD_STORAGE_KEY, JSON.stringify(oldProfile));

      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // localStorage Persistence
  // -------------------------------------------------------------------------

  describe('localStorage persistence', () => {
    it('loads existing profile from localStorage', () => {
      const profile: SkillTreeProfile = {
        totalXpEarned: 500,
        totalXpSpent: 100,
        towerUpgrades: {
          ranged: {
            damage: 2, fireRate: 1, range: 0, upgradeDiscount: 0,
            midCapstone: false, masteryCapstone: false,
          },
        },
        globalUpgrades: { tower_hp: 1 },
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(profile));

      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(500);
      expect(mgr.getTotalXpSpent()).toBe(100);
      expect(mgr.getStatTier('ranged', 'damage')).toBe(2);
      expect(mgr.getGlobalTier('tower_hp')).toBe(1);
    });

    it('handles corrupt JSON gracefully', () => {
      storageMap.set(STORAGE_KEY, '{bad json');
      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(0);
    });

    it('handles missing fields gracefully', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify({ totalXpEarned: 100 }));
      const mgr = new SkillTreeManager();
      /* Missing totalXpSpent, towerUpgrades, globalUpgrades -> default profile. */
      expect(mgr.getTotalXpEarned()).toBe(0);
    });

    it('clamps negative XP values', () => {
      const profile: SkillTreeProfile = {
        totalXpEarned: -50,
        totalXpSpent: -20,
        towerUpgrades: {},
        globalUpgrades: {},
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(profile));
      const mgr = new SkillTreeManager();
      expect(mgr.getTotalXpEarned()).toBe(0);
      expect(mgr.getTotalXpSpent()).toBe(0);
    });

    it('clamps stat tiers to valid range', () => {
      const profile: SkillTreeProfile = {
        totalXpEarned: 1000,
        totalXpSpent: 0,
        towerUpgrades: {
          ranged: {
            damage: 10, fireRate: -1, range: 3.7, upgradeDiscount: 0,
            midCapstone: false, masteryCapstone: false,
          },
        },
        globalUpgrades: {},
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(profile));
      const mgr = new SkillTreeManager();
      expect(mgr.getStatTier('ranged', 'damage')).toBe(MAX_STAT_TIER);
      expect(mgr.getStatTier('ranged', 'fireRate')).toBe(0);
      expect(mgr.getStatTier('ranged', 'range')).toBe(3); // floored
    });

    it('clamps global tiers to valid range', () => {
      const profile: SkillTreeProfile = {
        totalXpEarned: 1000,
        totalXpSpent: 0,
        towerUpgrades: {},
        globalUpgrades: { tower_hp: 5, tower_regen: -1 },
      };
      storageMap.set(STORAGE_KEY, JSON.stringify(profile));
      const mgr = new SkillTreeManager();
      expect(mgr.getGlobalTier('tower_hp')).toBe(MAX_GLOBAL_TIER);
      expect(mgr.getGlobalTier('tower_regen')).toBe(0);
    });

    it('degrades gracefully when localStorage throws', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => { throw new Error('SecurityError'); },
        setItem: () => { throw new Error('SecurityError'); },
        removeItem: () => { throw new Error('SecurityError'); },
      });

      const mgr = new SkillTreeManager();
      expect(mgr.isStorageAvailable()).toBe(false);
      expect(mgr.getTotalXpEarned()).toBe(0);

      /* XP still works in-memory. */
      mgr.setConfig(createTestConfig());
      const result = mgr.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(result.xpGained).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Config Management
  // -------------------------------------------------------------------------

  describe('config management', () => {
    it('throws when accessing config before setConfig', () => {
      const mgr = new SkillTreeManager();
      expect(() => mgr.getConfig()).toThrow('config not set');
    });

    it('throws when purchasing without config', () => {
      const mgr = new SkillTreeManager();
      mgr.applyRunXP({ totalKills: 100, wavesSurvived: 0, bossKills: 0 });
      expect(() => mgr.purchaseStatTier('ranged', 'damage')).toThrow('config not set');
    });

    it('returns config after setConfig', () => {
      const mgr = new SkillTreeManager();
      const config = createTestConfig();
      mgr.setConfig(config);
      expect(mgr.getConfig()).toBe(config);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('resetProgress', () => {
    it('resets all XP and upgrades', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.purchaseGlobalTier('tower_hp');

      mgr.resetProgress();
      expect(mgr.getTotalXpEarned()).toBe(0);
      expect(mgr.getTotalXpSpent()).toBe(0);
      expect(mgr.getStatTier('ranged', 'damage')).toBe(0);
      expect(mgr.getGlobalTier('tower_hp')).toBe(0);
    });

    it('persists reset to localStorage', () => {
      const mgr = createManager(1000);
      mgr.purchaseStatTier('ranged', 'damage');
      mgr.resetProgress();

      const stored = storageMap.get(STORAGE_KEY);
      const parsed = JSON.parse(stored!) as SkillTreeProfile;
      expect(parsed.totalXpEarned).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cost Accessors
  // -------------------------------------------------------------------------

  describe('cost accessors', () => {
    it('getStatTierCost returns correct cost for current tier', () => {
      const mgr = createManager(1000);
      expect(mgr.getStatTierCost('ranged', 'damage')).toBe(25); // tier 0 -> cost[0]
      mgr.purchaseStatTier('ranged', 'damage');
      expect(mgr.getStatTierCost('ranged', 'damage')).toBe(50); // tier 1 -> cost[1]
    });

    it('getStatTierCost returns null when maxed', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_STAT_TIER; i++) {
        mgr.purchaseStatTier('ranged', 'damage');
      }
      expect(mgr.getStatTierCost('ranged', 'damage')).toBeNull();
    });

    it('getGlobalTierCost returns correct cost', () => {
      const mgr = createManager(1000);
      expect(mgr.getGlobalTierCost('tower_hp')).toBe(50);
      mgr.purchaseGlobalTier('tower_hp');
      expect(mgr.getGlobalTierCost('tower_hp')).toBe(125);
    });

    it('getGlobalTierCost returns null when maxed', () => {
      const mgr = createManager(5000);
      for (let i = 0; i < MAX_GLOBAL_TIER; i++) {
        mgr.purchaseGlobalTier('tower_hp');
      }
      expect(mgr.getGlobalTierCost('tower_hp')).toBeNull();
    });

    it('getGlobalTierCost returns null for unknown upgrade', () => {
      const mgr = createManager();
      expect(mgr.getGlobalTierCost('nonexistent')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Profile Snapshot
  // -------------------------------------------------------------------------

  describe('getProfile', () => {
    it('returns a deep copy', () => {
      const mgr = createManager(100);
      mgr.setConfig(createTestConfig());
      mgr.purchaseStatTier('ranged', 'damage');
      const profile = mgr.getProfile();
      /* Mutating the copy should not affect the manager. */
      profile.totalXpEarned = 999;
      expect(mgr.getTotalXpEarned()).toBe(100);
    });
  });
});
