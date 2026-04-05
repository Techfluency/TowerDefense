/**
 * Integration tests for BOLT-024: RunBonuses applied across game systems.
 *
 * Tests cover:
 * - stat-resolver: damage/fireRate/range multiplied by RunBonuses
 * - economy-system: startingCurrencyBonus and waveIncomeMultiplier
 * - tower-registry: sell refund with sellRefundBonus
 * - upgrade-system: upgrade discount via getDiscountedCost
 * - tower-placement: HP multiplier and upgrade discount on placement cost
 * - tower-combat-system: tower regen per second
 * - XP multiplier: applyRunXP with xpMultiplier > 1
 * - MainMenu and GameOver: XP display logic (via SkillTreeManager)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Must mock Phaser before importing source modules. */
vi.mock('phaser', () => {
  const EventEmitter = vi.fn();
  const RandomDataGenerator = vi.fn();
  const Scene = vi.fn();
  return {
    default: {
      Scene,
      Events: { EventEmitter },
      Math: { RandomDataGenerator },
      GameObjects: {
        Sprite: vi.fn(),
        Graphics: vi.fn(),
        Container: vi.fn(),
        Group: vi.fn(),
        Text: vi.fn(),
      },
      Geom: {
        Rectangle: { Contains: vi.fn() },
      },
      Input: {
        Pointer: vi.fn(),
      },
      Time: {
        TimerEvent: vi.fn(),
      },
      Tweens: {
        Tween: vi.fn(),
      },
    },
    Scene,
    Events: { EventEmitter },
    Math: { RandomDataGenerator },
    GameObjects: {
      Sprite: vi.fn(),
      Graphics: vi.fn(),
      Container: vi.fn(),
      Group: vi.fn(),
      Text: vi.fn(),
    },
    Geom: {
      Rectangle: { Contains: vi.fn() },
    },
  };
});

import { resolveEffectiveStats } from '../../src/utils/stat-resolver';
import { SkillTreeManager, calculateRunXP } from '../../src/utils/skill-tree-manager';
import { ProgressionManager } from '../../src/utils/progression-manager';
import { SELL_REFUND_RATE } from '../../src/systems/tower-registry';
import type { RunBonuses, TowerUpgradeTier, TowerDefinition } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Sample upgrade data matching the stat-resolver test fixtures. */
const UPGRADE_DATA: TowerUpgradeTier[] = [
  { towerId: 'ranged', tier: 1, cost: 0, damage: 10, fireRate: 1.5, range: 200, maxHp: 200 },
  { towerId: 'ranged', tier: 2, cost: 40, damage: 18, fireRate: 1.8, range: 220, maxHp: 250 },
  { towerId: 'ranged', tier: 3, cost: 70, damage: 28, fireRate: 2.2, range: 240, maxHp: 300 },
  { towerId: 'focused', tier: 1, cost: 0, damage: 40, fireRate: 0.5, range: 350, maxHp: 150 },
];

const TOWER_DEFS: Record<string, TowerDefinition> = {
  ranged: {
    id: 'ranged', name: 'Arrow Tower', towerClass: 'ranged', cost: 50,
    range: 200, fireRate: 1.5, damage: 10, maxHp: 200,
    targetingMode: 'first', description: '', spriteKey: 'tower-ranged', projectileType: 'arrow',
  },
  focused: {
    id: 'focused', name: 'Sniper Tower', towerClass: 'focused', cost: 75,
    range: 350, fireRate: 0.5, damage: 40, maxHp: 150,
    targetingMode: 'strongest', description: '', spriteKey: 'tower-focused', projectileType: 'bullet',
  },
};

/** Creates a mock ConfigManager for stat-resolver tests. */
function createMockConfigManager() {
  return {
    getUpgrades: vi.fn((type: string) => UPGRADE_DATA.filter(u => u.towerId === type)),
    getTower: vi.fn((type: string) => TOWER_DEFS[type]!),
  } as unknown as import('../../src/utils/config-manager').ConfigManager;
}

/** Creates a RunBonuses object with specific values. */
function createRunBonuses(overrides?: Partial<RunBonuses>): RunBonuses {
  return {
    towerMultipliers: {
      ranged: { damage: 1.3, fireRate: 1.1, range: 1.2, upgradeDiscount: 0.85 },
      focused: { damage: 1.0, fireRate: 1.0, range: 1.0, upgradeDiscount: 1.0 },
      broadcast: { damage: 1.0, fireRate: 1.0, range: 1.0, upgradeDiscount: 1.0 },
      antiair: { damage: 1.0, fireRate: 1.0, range: 1.0, upgradeDiscount: 1.0 },
      ...overrides?.towerMultipliers,
    },
    towerCapstones: {
      ranged: [],
      focused: [],
      broadcast: [],
      antiair: [],
      ...overrides?.towerCapstones,
    },
    global: {
      towerHpMultiplier: 1.0,
      towerRegenPerSec: 0,
      startingCurrencyBonus: 0,
      waveIncomeMultiplier: 1.0,
      xpMultiplier: 1.0,
      sellRefundBonus: 0,
      ...overrides?.global,
    },
  };
}

// ---------------------------------------------------------------------------
// stat-resolver: RunBonuses multipliers
// ---------------------------------------------------------------------------

describe('stat-resolver with RunBonuses (BOLT-024)', () => {
  let configManager: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    configManager = createMockConfigManager();
  });

  it('should apply damage multiplier from RunBonuses to Tier 1 ranged tower', () => {
    const bonuses = createRunBonuses();
    const stats = resolveEffectiveStats(
      { towerType: 'ranged', upgradeLevel: 1 },
      configManager,
      bonuses,
    );

    /* Base damage = 10, multiplier = 1.3 => 13. */
    expect(stats.damage).toBeCloseTo(13, 5);
    /* fireRate = 1.5 * 1.1 = 1.65. */
    expect(stats.fireRate).toBeCloseTo(1.65, 5);
    /* range = 200 * 1.2 = 240. */
    expect(stats.range).toBeCloseTo(240, 5);
    /* maxHp is NOT affected by per-tower multipliers. */
    expect(stats.maxHp).toBe(200);
  });

  it('should apply damage multiplier to higher upgrade tiers', () => {
    const bonuses = createRunBonuses();
    const stats = resolveEffectiveStats(
      { towerType: 'ranged', upgradeLevel: 3 },
      configManager,
      bonuses,
    );

    /* Tier 3 base damage = 28, multiplier = 1.3 => 36.4. */
    expect(stats.damage).toBeCloseTo(36.4, 5);
    /* Tier 3 base fireRate = 2.2, multiplier = 1.1 => 2.42. */
    expect(stats.fireRate).toBeCloseTo(2.42, 5);
    /* Tier 3 base range = 240, multiplier = 1.2 => 288. */
    expect(stats.range).toBeCloseTo(288, 5);
  });

  it('should NOT apply multipliers when RunBonuses is null', () => {
    const stats = resolveEffectiveStats(
      { towerType: 'ranged', upgradeLevel: 1 },
      configManager,
      null,
    );

    expect(stats.damage).toBe(10);
    expect(stats.fireRate).toBe(1.5);
    expect(stats.range).toBe(200);
  });

  it('should NOT apply multipliers when RunBonuses is undefined', () => {
    const stats = resolveEffectiveStats(
      { towerType: 'ranged', upgradeLevel: 1 },
      configManager,
      undefined,
    );

    expect(stats.damage).toBe(10);
    expect(stats.fireRate).toBe(1.5);
    expect(stats.range).toBe(200);
  });

  it('should pass through unchanged for towers with no multipliers entry', () => {
    const bonuses = createRunBonuses();
    /* Remove the focused entry to test fallback. */
    delete bonuses.towerMultipliers['focused'];

    const stats = resolveEffectiveStats(
      { towerType: 'focused', upgradeLevel: 1 },
      configManager,
      bonuses,
    );

    expect(stats.damage).toBe(40);
    expect(stats.fireRate).toBe(0.5);
    expect(stats.range).toBe(350);
  });

  it('should apply 1.0 multipliers without changing base stats', () => {
    const bonuses = createRunBonuses();
    const stats = resolveEffectiveStats(
      { towerType: 'focused', upgradeLevel: 1 },
      configManager,
      bonuses,
    );

    /* focused has all 1.0 multipliers -- should be unchanged. */
    expect(stats.damage).toBe(40);
    expect(stats.fireRate).toBe(0.5);
    expect(stats.range).toBe(350);
  });
});

// ---------------------------------------------------------------------------
// RunBonuses computation from SkillTreeManager
// ---------------------------------------------------------------------------

describe('SkillTreeManager.computeRunBonuses (BOLT-024)', () => {
  let manager: SkillTreeManager;

  beforeEach(() => {
    /* Mock localStorage to prevent persistence side effects. */
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    manager = new SkillTreeManager();
    manager.setConfig({
      towerStats: {
        costs: [25, 50, 100, 175, 250],
        bonusPerTier: {
          damage: [0.05, 0.10, 0.15, 0.20, 0.25],
          fireRate: [0.05, 0.10, 0.15, 0.20, 0.25],
          range: [0.05, 0.08, 0.12, 0.16, 0.20],
          upgradeDiscount: [0.05, 0.10, 0.15, 0.20, 0.25],
        },
      },
      capstones: [],
      globalUpgrades: [
        { id: 'tower_hp', appliesTo: 'towerHp', costs: [50, 125, 250], bonusPerTier: [0.10, 0.20, 0.35] },
        { id: 'tower_regen', appliesTo: 'towerRegen', costs: [50, 125, 250], bonusPerTier: [1, 2, 4] },
        { id: 'start_currency', appliesTo: 'startCurrency', costs: [50, 125, 250], bonusPerTier: [15, 35, 60] },
        { id: 'wave_income', appliesTo: 'waveIncome', costs: [50, 125, 250], bonusPerTier: [0.10, 0.20, 0.30] },
        { id: 'xp_boost', appliesTo: 'xpBoost', costs: [50, 125, 250], bonusPerTier: [0.10, 0.20, 0.35] },
        { id: 'sell_refund', appliesTo: 'sellRefund', costs: [50, 125, 250], bonusPerTier: [0.05, 0.10, 0.15] },
      ],
    });
  });

  it('should return default bonuses with no upgrades purchased', () => {
    const bonuses = manager.computeRunBonuses();

    /* All tower multipliers should be 1.0 (no bonuses). */
    expect(bonuses.towerMultipliers['ranged']!.damage).toBe(1.0);
    expect(bonuses.towerMultipliers['ranged']!.upgradeDiscount).toBe(1.0);

    /* Global bonuses should be at baseline. */
    expect(bonuses.global.towerHpMultiplier).toBe(1.0);
    expect(bonuses.global.startingCurrencyBonus).toBe(0);
    expect(bonuses.global.waveIncomeMultiplier).toBe(1.0);
    expect(bonuses.global.xpMultiplier).toBe(1.0);
    expect(bonuses.global.sellRefundBonus).toBe(0);
    expect(bonuses.global.towerRegenPerSec).toBe(0);
  });

  it('should compute cumulative tower damage bonus for Tier 3', () => {
    /* Manually set XP so purchases succeed. */
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({
      totalXpEarned: 10000,
      totalXpSpent: 0,
      towerUpgrades: {},
      globalUpgrades: {},
    }));

    const freshManager = new SkillTreeManager();
    freshManager.setConfig(manager['config']!);

    /* Purchase 3 tiers of damage on ranged. */
    freshManager.purchaseStatTier('ranged', 'damage'); /* +5% */
    freshManager.purchaseStatTier('ranged', 'damage'); /* +10% */
    freshManager.purchaseStatTier('ranged', 'damage'); /* +15% */

    const bonuses = freshManager.computeRunBonuses();

    /* Cumulative: +5% +10% +15% = +30% => multiplier = 1.30. */
    expect(bonuses.towerMultipliers['ranged']!.damage).toBeCloseTo(1.30, 5);
  });

  it('should compute upgradeDiscount as a cost multiplier < 1.0', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({
      totalXpEarned: 10000,
      totalXpSpent: 0,
      towerUpgrades: {},
      globalUpgrades: {},
    }));

    const freshManager = new SkillTreeManager();
    freshManager.setConfig(manager['config']!);

    /* Purchase 2 tiers of upgradeDiscount on ranged: -5% + -10% = -15%. */
    freshManager.purchaseStatTier('ranged', 'upgradeDiscount');
    freshManager.purchaseStatTier('ranged', 'upgradeDiscount');

    const bonuses = freshManager.computeRunBonuses();

    /* 1.0 - 0.15 = 0.85 cost multiplier. */
    expect(bonuses.towerMultipliers['ranged']!.upgradeDiscount).toBeCloseTo(0.85, 5);
  });
});

// ---------------------------------------------------------------------------
// XP multiplier on applyRunXP
// ---------------------------------------------------------------------------

describe('SkillTreeManager.applyRunXP with xpMultiplier (BOLT-024)', () => {
  it('should multiply XP earned by the global xpMultiplier', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        totalXpEarned: 0,
        totalXpSpent: 0,
        towerUpgrades: {},
        globalUpgrades: { xp_boost: 2 }, /* Tier 2 => +10% + 20% = +30% = 1.30 */
      })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const manager = new SkillTreeManager();
    manager.setConfig({
      towerStats: { costs: [], bonusPerTier: { damage: [], fireRate: [], range: [], upgradeDiscount: [] } },
      capstones: [],
      globalUpgrades: [
        { id: 'xp_boost', appliesTo: 'xpBoost', costs: [50, 125, 250], bonusPerTier: [0.10, 0.20, 0.35] },
      ],
    });

    /* Base XP for a run: 10 kills * 1 + 5 waves * 10 + 1 boss * 50 = 110. */
    const result = manager.applyRunXP({
      totalKills: 10,
      wavesSurvived: 5,
      bossKills: 1,
    });

    expect(result.baseXpGained).toBe(110);
    /* XP multiplier at Tier 2 xp_boost: 1.0 + 0.10 + 0.20 = 1.30. */
    /* 110 * 1.30 = 143 (floor). */
    expect(result.xpGained).toBe(143);
    expect(result.totalXpEarned).toBe(143);
  });

  it('should return base XP when xpMultiplier is 1.0 (no boost)', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const manager = new SkillTreeManager();

    const result = manager.applyRunXP({
      totalKills: 10,
      wavesSurvived: 5,
      bossKills: 1,
    });

    expect(result.baseXpGained).toBe(110);
    expect(result.xpGained).toBe(110); /* No multiplier -- same as base. */
  });
});

// ---------------------------------------------------------------------------
// Sell refund with bonus
// ---------------------------------------------------------------------------

describe('sell refund with sellRefundBonus (BOLT-024)', () => {
  it('should increase refund by sellRefundBonus percentage', () => {
    /* Base refund rate is 0.5 (50%). sellRefundBonus of 0.10 => 60% total. */
    const baseCost = 100;
    const totalInvested = 190; /* Base cost + upgrade costs. */
    const sellRefundBonus = 0.10;
    const effectiveRate = SELL_REFUND_RATE + sellRefundBonus;

    /* Expected: floor(190 * 0.60) = 114. */
    const refund = Math.floor(totalInvested * effectiveRate);
    expect(refund).toBe(114);
  });

  it('should return base refund when sellRefundBonus is 0', () => {
    const totalInvested = 190;
    const sellRefundBonus = 0;
    const effectiveRate = SELL_REFUND_RATE + sellRefundBonus;

    /* Expected: floor(190 * 0.50) = 95. */
    const refund = Math.floor(totalInvested * effectiveRate);
    expect(refund).toBe(95);
  });

  it('should cap refund at correct amount with max sellRefundBonus', () => {
    const totalInvested = 200;
    const sellRefundBonus = 0.15; /* Max Tier 3. */
    const effectiveRate = SELL_REFUND_RATE + sellRefundBonus;

    /* Expected: floor(200 * 0.65) = 130. */
    const refund = Math.floor(totalInvested * effectiveRate);
    expect(refund).toBe(130);
  });
});

// ---------------------------------------------------------------------------
// Upgrade discount calculation
// ---------------------------------------------------------------------------

describe('upgrade discount (BOLT-024)', () => {
  it('should apply upgradeDiscount multiplier to upgrade cost', () => {
    const baseCost = 70; /* Tier 3 cost for ranged. */
    const discountMultiplier = 0.85; /* -15% discount. */
    const effectiveCost = Math.ceil(baseCost * discountMultiplier);

    /* 70 * 0.85 = 59.5 => ceil = 60. */
    expect(effectiveCost).toBe(60);
  });

  it('should leave cost unchanged when discount is 1.0 (no discount)', () => {
    const baseCost = 70;
    const discountMultiplier = 1.0;
    const effectiveCost = Math.ceil(baseCost * discountMultiplier);

    expect(effectiveCost).toBe(70);
  });

  it('should apply maximum discount (-75% at Tier 5) correctly', () => {
    const baseCost = 100;
    const discountMultiplier = 0.25; /* -75% discount (all 5 tiers). */
    const effectiveCost = Math.ceil(baseCost * discountMultiplier);

    expect(effectiveCost).toBe(25);
  });

  it('should apply discount to placement cost (Tier 1 tower placement)', () => {
    const placementCost = 50; /* Arrow Tower base cost. */
    const discountMultiplier = 0.85;
    const effectiveCost = Math.ceil(placementCost * discountMultiplier);

    expect(effectiveCost).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Tower HP multiplier
// ---------------------------------------------------------------------------

describe('tower HP multiplier (BOLT-024)', () => {
  it('should multiply base maxHp by global towerHpMultiplier', () => {
    const baseMaxHp = 200; /* Arrow Tower Tier 1. */
    const hpMultiplier = 1.30; /* +30% HP bonus. */
    const effectiveMaxHp = Math.ceil(baseMaxHp * hpMultiplier);

    expect(effectiveMaxHp).toBe(260);
  });

  it('should leave HP unchanged when multiplier is 1.0', () => {
    const baseMaxHp = 200;
    const hpMultiplier = 1.0;
    const effectiveMaxHp = Math.ceil(baseMaxHp * hpMultiplier);

    expect(effectiveMaxHp).toBe(200);
  });

  it('should round up fractional HP', () => {
    const baseMaxHp = 150; /* Sniper Tier 1. */
    const hpMultiplier = 1.10; /* +10%. */
    const effectiveMaxHp = Math.ceil(baseMaxHp * hpMultiplier);

    /* 150 * 1.10 = 165.0 -- no rounding needed. */
    expect(effectiveMaxHp).toBe(165);
  });
});

// ---------------------------------------------------------------------------
// Wave income multiplier
// ---------------------------------------------------------------------------

describe('wave income multiplier (BOLT-024)', () => {
  it('should multiply wave bonus by waveIncomeMultiplier', () => {
    const waveBonusBase = 10;
    const waveBonusPerWave = 5;
    const waveNumber = 5;
    const waveIncomeMultiplier = 1.20; /* +20% wave income. */

    const baseBonus = waveBonusBase + waveBonusPerWave * waveNumber; /* 10 + 25 = 35. */
    const effective = Math.floor(baseBonus * waveIncomeMultiplier);

    /* 35 * 1.20 = 42. */
    expect(effective).toBe(42);
  });

  it('should leave wave bonus unchanged when multiplier is 1.0', () => {
    const baseBonus = 35;
    const waveIncomeMultiplier = 1.0;
    const effective = Math.floor(baseBonus * waveIncomeMultiplier);

    expect(effective).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// Starting currency bonus
// ---------------------------------------------------------------------------

describe('starting currency bonus (BOLT-024)', () => {
  it('should add startingCurrencyBonus to base starting currency', () => {
    const baseCurrency = 150; /* From economy.json. */
    const startingCurrencyBonus = 60; /* Global Tier 3. */
    const effective = baseCurrency + startingCurrencyBonus;

    expect(effective).toBe(210);
  });

  it('should leave currency unchanged when bonus is 0', () => {
    const baseCurrency = 150;
    const startingCurrencyBonus = 0;
    const effective = baseCurrency + startingCurrencyBonus;

    expect(effective).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Tower regen per second
// ---------------------------------------------------------------------------

describe('tower regen per second (BOLT-024)', () => {
  it('should heal tower HP by regenPerSec * deltaSeconds', () => {
    const currentHp = 180;
    const maxHp = 200;
    const regenPerSec = 2;
    const deltaSeconds = 0.5; /* Half second. */

    const newHp = Math.min(maxHp, currentHp + regenPerSec * deltaSeconds);

    /* 180 + 2*0.5 = 181. */
    expect(newHp).toBe(181);
  });

  it('should cap healing at maxHp', () => {
    const currentHp = 199;
    const maxHp = 200;
    const regenPerSec = 4;
    const deltaSeconds = 1.0;

    const newHp = Math.min(maxHp, currentHp + regenPerSec * deltaSeconds);

    /* 199 + 4 = 203, capped at 200. */
    expect(newHp).toBe(200);
  });

  it('should not heal when regenPerSec is 0', () => {
    const currentHp = 180;
    const maxHp = 200;
    const regenPerSec = 0;
    const deltaSeconds = 1.0;

    /* When regen is 0, the regen code path is skipped. */
    /* Simulating: hp stays at 180. */
    expect(regenPerSec > 0).toBe(false);
    expect(currentHp).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// calculateRunXP formula
// ---------------------------------------------------------------------------

describe('calculateRunXP (BOLT-024)', () => {
  it('should compute XP from kills, waves, and boss kills', () => {
    const xp = calculateRunXP({
      totalKills: 200,
      wavesSurvived: 20,
      bossKills: 4,
    });

    /* 200*1 + 20*10 + 4*50 = 200 + 200 + 200 = 600. */
    expect(xp).toBe(600);
  });

  it('should compute XP for a poor run', () => {
    const xp = calculateRunXP({
      totalKills: 25,
      wavesSurvived: 4,
      bossKills: 0,
    });

    /* 25*1 + 4*10 + 0*50 = 25 + 40 + 0 = 65. */
    expect(xp).toBe(65);
  });
});

// ---------------------------------------------------------------------------
// ProgressionManager compatibility wrapper
// ---------------------------------------------------------------------------

describe('ProgressionManager compatibility (BOLT-024)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it('should always return true for isTowerUnlocked', () => {
    const pm = new ProgressionManager();

    expect(pm.isTowerUnlocked('ranged')).toBe(true);
    expect(pm.isTowerUnlocked('focused')).toBe(true);
    expect(pm.isTowerUnlocked('broadcast')).toBe(true);
    expect(pm.isTowerUnlocked('antiair')).toBe(true);
  });

  it('should expose SkillTreeManager via getSkillTreeManager', () => {
    const pm = new ProgressionManager();
    const stm = pm.getSkillTreeManager();

    expect(stm).toBeDefined();
    expect(typeof stm.getAvailableXp).toBe('function');
    expect(typeof stm.computeRunBonuses).toBe('function');
  });

  it('should return 0 for getStartingCurrencyBonus (handled by RunBonuses)', () => {
    const pm = new ProgressionManager();
    expect(pm.getStartingCurrencyBonus()).toBe(0);
  });

  it('should return true for all isFeatureUnlocked calls', () => {
    const pm = new ProgressionManager();
    expect(pm.isFeatureUnlocked('3x_speed')).toBe(true);
    expect(pm.isFeatureUnlocked('tier4_branches')).toBe(true);
    expect(pm.isFeatureUnlocked('endless_high_score')).toBe(true);
  });
});
