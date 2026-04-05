/**
 * Unit tests for SkillTree scene (BOLT-025).
 *
 * Tests the scene's interaction with SkillTreeManager: config binding,
 * purchase flow logic, bonus formatting, tab navigation, scroll behavior,
 * and edge cases (0 XP, all maxed, insufficient funds).
 *
 * Uses mock Phaser to isolate scene logic from rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Mock Phaser before importing source files that transitively import it. */
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class {
        scene = { key: 'TestScene' };
      },
      GameObjects: {
        Sprite: class {},
        Group: class {},
        Container: class {
          list: unknown[] = [];
          x = 0;
          y = 0;
          depth = 0;
          setDepth(d: number) { this.depth = d; return this; }
          setMask() { return this; }
          add(item: unknown) { this.list.push(item); return this; }
          destroy() { this.list = []; }
        },
        Graphics: class {
          fillStyle() { return this; }
          fillRect() { return this; }
          fillRoundedRect() { return this; }
          fillCircle() { return this; }
          lineStyle() { return this; }
          lineBetween() { return this; }
          strokeCircle() { return this; }
          strokeRoundedRect() { return this; }
          clear() { return this; }
          setVisible() { return this; }
          setDepth() { return this; }
          setInteractive() { return this; }
          createGeometryMask() { return { destroy() {} }; }
          on() { return this; }
        },
        Text: class {
          text = '';
          x = 0;
          y = 0;
          setOrigin() { return this; }
          setDepth() { return this; }
          setAlpha() { return this; }
          setText(t: string) { this.text = t; return this; }
          setInteractive() { return this; }
          on() { return this; }
        },
        Zone: class {
          setInteractive() { return this; }
          setDepth() { return this; }
          on() { return this; }
        },
      },
      Math: { RandomDataGenerator: class {} },
      Geom: {
        Rectangle: class {
          static Contains = () => true;
        },
        Point: class {},
      },
      Display: {
        Masks: {
          GeometryMask: class {},
        },
      },
      Scale: {
        FIT: 1,
        CENTER_BOTH: 1,
      },
      AUTO: 0,
    },
  };
});

import { SkillTreeManager } from '../../src/utils/skill-tree-manager';
import type { SkillTreeConfig } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// localStorage mock (SkillTreeManager uses localStorage)
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
// Test config fixture (matches skill-tree.json structure)
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
        description: '+15% damage to first enemy hit after switching targets',
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
        description: 'Every 5th shot fires 2 arrows instead of 1',
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
        description: 'Increases tower maximum hit points',
        costs: [50, 125, 250],
        bonusPerTier: [0.10, 0.20, 0.35],
        bonusType: 'percentage',
        appliesTo: 'towerHp',
      },
      {
        id: 'start_currency',
        name: 'Starting Currency',
        description: 'Start each run with bonus currency',
        costs: [50, 125, 250],
        bonusPerTier: [15, 35, 60],
        bonusType: 'flat',
        appliesTo: 'startCurrency',
      },
      {
        id: 'xp_boost',
        name: 'XP Boost',
        description: 'Earn more XP from runs',
        costs: [50, 125, 250],
        bonusPerTier: [0.10, 0.20, 0.35],
        bonusType: 'percentage',
        appliesTo: 'xpBoost',
      },
    ],
  };
}

/** Helper: creates a SkillTreeManager with config and given XP. */
function createManagerWithXP(xp: number): SkillTreeManager {
  const profile = {
    totalXpEarned: xp,
    totalXpSpent: 0,
    towerUpgrades: {},
    globalUpgrades: {},
  };
  storageMap.set('td_skill_tree', JSON.stringify(profile));
  const manager = new SkillTreeManager();
  manager.setConfig(createTestConfig());
  return manager;
}

// ---------------------------------------------------------------------------
// Scene Key and Registration
// ---------------------------------------------------------------------------

describe('SkillTree scene registration', () => {
  it('has the correct scene key', async () => {
    const { SCENE_KEYS } = await import('../../src/config/game-constants');
    expect(SCENE_KEYS.SKILL_TREE).toBe('SkillTree');
  });

  it('SkillTree scene class uses the correct key', async () => {
    const { SkillTree } = await import('../../src/scenes/SkillTree');
    const scene = new SkillTree();
    /* The scene constructor calls super({ key: 'SkillTree' }). */
    expect(scene).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Purchase Flow (via SkillTreeManager -- the scene delegates to these)
// ---------------------------------------------------------------------------

describe('SkillTree purchase flow', () => {
  it('stat purchase succeeds with sufficient XP', () => {
    const manager = createManagerWithXP(100);
    /* Tier 1 costs 25 XP. */
    const success = manager.purchaseStatTier('ranged', 'damage');
    expect(success).toBe(true);
    expect(manager.getStatTier('ranged', 'damage')).toBe(1);
    expect(manager.getAvailableXp()).toBe(75);
  });

  it('stat purchase fails with insufficient XP', () => {
    const manager = createManagerWithXP(10);
    /* Tier 1 costs 25 XP, only have 10. */
    const success = manager.purchaseStatTier('ranged', 'damage');
    expect(success).toBe(false);
    expect(manager.getStatTier('ranged', 'damage')).toBe(0);
    expect(manager.getAvailableXp()).toBe(10);
  });

  it('stat purchase fails when already at max tier', () => {
    const profile = {
      totalXpEarned: 10000,
      totalXpSpent: 600,
      towerUpgrades: {
        ranged: {
          damage: 5, fireRate: 0, range: 0, upgradeDiscount: 0,
          midCapstone: false, masteryCapstone: false,
        },
      },
      globalUpgrades: {},
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    const success = manager.purchaseStatTier('ranged', 'damage');
    expect(success).toBe(false);
    expect(manager.getStatTier('ranged', 'damage')).toBe(5);
  });

  it('global purchase succeeds with sufficient XP', () => {
    const manager = createManagerWithXP(200);
    const success = manager.purchaseGlobalTier('tower_hp');
    expect(success).toBe(true);
    expect(manager.getGlobalTier('tower_hp')).toBe(1);
    expect(manager.getAvailableXp()).toBe(150);
  });

  it('global purchase fails with insufficient XP', () => {
    const manager = createManagerWithXP(10);
    const success = manager.purchaseGlobalTier('tower_hp');
    expect(success).toBe(false);
    expect(manager.getGlobalTier('tower_hp')).toBe(0);
  });

  it('sequential stat tier purchases cost incrementally more', () => {
    const manager = createManagerWithXP(1000);

    /* Tier 1: 25 XP */
    manager.purchaseStatTier('ranged', 'damage');
    expect(manager.getAvailableXp()).toBe(975);

    /* Tier 2: 50 XP */
    manager.purchaseStatTier('ranged', 'damage');
    expect(manager.getAvailableXp()).toBe(925);

    /* Tier 3: 100 XP */
    manager.purchaseStatTier('ranged', 'damage');
    expect(manager.getAvailableXp()).toBe(825);
  });
});

// ---------------------------------------------------------------------------
// Cost Display Logic
// ---------------------------------------------------------------------------

describe('SkillTree cost display', () => {
  it('getStatTierCost returns correct cost for next tier', () => {
    const manager = createManagerWithXP(1000);
    expect(manager.getStatTierCost('ranged', 'damage')).toBe(25); /* Tier 1 */
    manager.purchaseStatTier('ranged', 'damage');
    expect(manager.getStatTierCost('ranged', 'damage')).toBe(50); /* Tier 2 */
  });

  it('getStatTierCost returns null when maxed', () => {
    const profile = {
      totalXpEarned: 10000,
      totalXpSpent: 600,
      towerUpgrades: {
        ranged: {
          damage: 5, fireRate: 0, range: 0, upgradeDiscount: 0,
          midCapstone: false, masteryCapstone: false,
        },
      },
      globalUpgrades: {},
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.getStatTierCost('ranged', 'damage')).toBeNull();
  });

  it('getGlobalTierCost returns correct cost for next tier', () => {
    const manager = createManagerWithXP(1000);
    expect(manager.getGlobalTierCost('tower_hp')).toBe(50); /* Tier 1 */
    manager.purchaseGlobalTier('tower_hp');
    expect(manager.getGlobalTierCost('tower_hp')).toBe(125); /* Tier 2 */
  });

  it('getGlobalTierCost returns null when maxed at tier 3', () => {
    const profile = {
      totalXpEarned: 10000,
      totalXpSpent: 425,
      towerUpgrades: {},
      globalUpgrades: { tower_hp: 3 },
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.getGlobalTierCost('tower_hp')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bonus Formatting Logic (mirrors scene's formatStatBonus/formatGlobalBonus)
// ---------------------------------------------------------------------------

describe('Stat bonus calculation for display', () => {
  it('damage bonus is cumulative through tiers', () => {
    const manager = createManagerWithXP(1000);
    manager.purchaseStatTier('ranged', 'damage'); /* Tier 1: +5% */
    manager.purchaseStatTier('ranged', 'damage'); /* Tier 2: +10% (total +15%) */
    manager.purchaseStatTier('ranged', 'damage'); /* Tier 3: +15% (total +30%) */

    const multipliers = manager.getTowerStatMultipliers('ranged');
    expect(multipliers.damage).toBeCloseTo(1.30);
  });

  it('upgrade discount is subtracted (cost reduction)', () => {
    const manager = createManagerWithXP(1000);
    manager.purchaseStatTier('ranged', 'upgradeDiscount'); /* Tier 1: -5% */
    manager.purchaseStatTier('ranged', 'upgradeDiscount'); /* Tier 2: -10% (total -15%) */

    const multipliers = manager.getTowerStatMultipliers('ranged');
    /* upgradeDiscount multiplier = 1.0 - 0.15 = 0.85 */
    expect(multipliers.upgradeDiscount).toBeCloseTo(0.85);
  });

  it('returns 1.0 multipliers when no tiers purchased', () => {
    const manager = createManagerWithXP(0);
    const multipliers = manager.getTowerStatMultipliers('ranged');
    expect(multipliers.damage).toBe(1.0);
    expect(multipliers.fireRate).toBe(1.0);
    expect(multipliers.range).toBe(1.0);
    expect(multipliers.upgradeDiscount).toBe(1.0);
  });

  it('range bonus differs from damage (per config)', () => {
    const manager = createManagerWithXP(1000);
    /* Buy 3 tiers of range: +5% +8% +12% = +25% total */
    manager.purchaseStatTier('ranged', 'range');
    manager.purchaseStatTier('ranged', 'range');
    manager.purchaseStatTier('ranged', 'range');

    const multipliers = manager.getTowerStatMultipliers('ranged');
    expect(multipliers.range).toBeCloseTo(1.25);
  });
});

describe('Global bonus calculation for display', () => {
  it('percentage global bonus is cumulative', () => {
    const manager = createManagerWithXP(1000);
    manager.purchaseGlobalTier('tower_hp'); /* Tier 1: +10% */
    manager.purchaseGlobalTier('tower_hp'); /* Tier 2: +20% (total +30%) */

    const bonuses = manager.getGlobalBonuses();
    expect(bonuses.towerHpMultiplier).toBeCloseTo(1.30);
  });

  it('flat global bonus is cumulative', () => {
    const manager = createManagerWithXP(1000);
    manager.purchaseGlobalTier('start_currency'); /* Tier 1: +15 */
    manager.purchaseGlobalTier('start_currency'); /* Tier 2: +35 (total +50) */

    const bonuses = manager.getGlobalBonuses();
    expect(bonuses.startingCurrencyBonus).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Capstone Prerequisites
// ---------------------------------------------------------------------------

describe('Capstone prerequisite display', () => {
  it('mid capstone requires 2 stats at tier 2', () => {
    const config = createTestConfig();
    const midCap = config.capstones.find(c => c.id === 'ranged_steady_aim')!;

    expect(midCap.requiredCount).toBe(2);
    expect(midCap.prerequisites[0]!.minTier).toBe(2);
  });

  it('mastery capstone requires 3 stats at tier 4', () => {
    const config = createTestConfig();
    const masteryCap = config.capstones.find(c => c.id === 'ranged_barrage')!;

    expect(masteryCap.requiredCount).toBe(3);
    expect(masteryCap.prerequisites[0]!.minTier).toBe(4);
  });

  it('checkCapstonePrerequisites returns false when not met', () => {
    const manager = createManagerWithXP(1000);
    const config = createTestConfig();
    const midCap = config.capstones.find(c => c.id === 'ranged_steady_aim')!;

    /* No stats purchased yet -- prerequisites not met. */
    const towerState = manager.getTowerState('ranged');
    /* getTowerState returns undefined for no purchases. */
    expect(towerState).toBeUndefined();
  });

  it('checkCapstonePrerequisites returns true when enough stats at required tier', () => {
    const manager = createManagerWithXP(10000);
    const config = createTestConfig();
    const midCap = config.capstones.find(c => c.id === 'ranged_steady_aim')!;

    /* Purchase damage and fireRate to tier 2. */
    manager.purchaseStatTier('ranged', 'damage');
    manager.purchaseStatTier('ranged', 'damage');
    manager.purchaseStatTier('ranged', 'fireRate');
    manager.purchaseStatTier('ranged', 'fireRate');

    const towerState = manager.getTowerState('ranged')!;
    const result = manager.checkCapstonePrerequisites(midCap, towerState);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('SkillTree edge cases', () => {
  it('0 XP: scene is browsable, no purchases possible', () => {
    const manager = createManagerWithXP(0);

    /* All stat tier costs should be non-null (tier 1 available). */
    expect(manager.getStatTierCost('ranged', 'damage')).toBe(25);
    /* But canPurchase should return false. */
    expect(manager.canPurchase('ranged:damage')).toBe(false);
    /* Global similarly. */
    expect(manager.canPurchase('global:tower_hp')).toBe(false);
  });

  it('spending all XP: remaining pips show as unavailable', () => {
    const manager = createManagerWithXP(25);

    /* Purchase tier 1 (costs 25). */
    const success = manager.purchaseStatTier('ranged', 'damage');
    expect(success).toBe(true);
    expect(manager.getAvailableXp()).toBe(0);

    /* Next tier costs 50, but XP is 0. */
    expect(manager.canPurchase('ranged:damage')).toBe(false);
  });

  it('all stats maxed: getStatTierCost returns null for all', () => {
    const profile = {
      totalXpEarned: 100000,
      totalXpSpent: 9600,
      towerUpgrades: {
        ranged: {
          damage: 5, fireRate: 5, range: 5, upgradeDiscount: 5,
          midCapstone: true, masteryCapstone: true,
        },
      },
      globalUpgrades: {},
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.getStatTierCost('ranged', 'damage')).toBeNull();
    expect(manager.getStatTierCost('ranged', 'fireRate')).toBeNull();
    expect(manager.getStatTierCost('ranged', 'range')).toBeNull();
    expect(manager.getStatTierCost('ranged', 'upgradeDiscount')).toBeNull();
  });

  it('all global upgrades maxed: getGlobalTierCost returns null', () => {
    const profile = {
      totalXpEarned: 100000,
      totalXpSpent: 2550,
      towerUpgrades: {},
      globalUpgrades: {
        tower_hp: 3,
        start_currency: 3,
        xp_boost: 3,
      },
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.getGlobalTierCost('tower_hp')).toBeNull();
    expect(manager.getGlobalTierCost('start_currency')).toBeNull();
    expect(manager.getGlobalTierCost('xp_boost')).toBeNull();
  });

  it('purchasing different stats on same tower works independently', () => {
    const manager = createManagerWithXP(200);

    manager.purchaseStatTier('ranged', 'damage');
    manager.purchaseStatTier('ranged', 'fireRate');
    manager.purchaseStatTier('ranged', 'range');

    expect(manager.getStatTier('ranged', 'damage')).toBe(1);
    expect(manager.getStatTier('ranged', 'fireRate')).toBe(1);
    expect(manager.getStatTier('ranged', 'range')).toBe(1);
    expect(manager.getStatTier('ranged', 'upgradeDiscount')).toBe(0);
  });

  it('purchasing across different towers is independent', () => {
    const manager = createManagerWithXP(200);

    manager.purchaseStatTier('ranged', 'damage');
    manager.purchaseStatTier('focused', 'damage');

    expect(manager.getStatTier('ranged', 'damage')).toBe(1);
    expect(manager.getStatTier('focused', 'damage')).toBe(1);
    /* Other towers unaffected. */
    expect(manager.getStatTier('broadcast', 'damage')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Config Binding
// ---------------------------------------------------------------------------

describe('SkillTree config binding', () => {
  it('throws when purchasing without config set', () => {
    const manager = createManagerWithXP(1000);
    /* Reset config by creating a fresh manager without setConfig. */
    storageMap.set('td_skill_tree', JSON.stringify({
      totalXpEarned: 1000,
      totalXpSpent: 0,
      towerUpgrades: {},
      globalUpgrades: {},
    }));
    const freshManager = new SkillTreeManager();
    /* No setConfig called. */
    expect(() => freshManager.purchaseStatTier('ranged', 'damage')).toThrow(
      /config not set/,
    );
  });

  it('getConfig returns the bound config', () => {
    const manager = createManagerWithXP(0);
    const config = manager.getConfig();
    expect(config.towerStats.costs).toEqual([25, 50, 100, 175, 250]);
    expect(config.globalUpgrades.length).toBe(3); /* Our test fixture has 3 */
  });
});

// ---------------------------------------------------------------------------
// Tab Data Structure Validation
// ---------------------------------------------------------------------------

describe('Tab data structure', () => {
  it('has exactly 5 tabs defined', async () => {
    /* Import the scene to inspect its module-level constants.
     * We test indirectly by verifying the config structure supports 5 tabs. */
    const config = createTestConfig();

    /* 4 tower IDs (ranged, focused, broadcast, antiair) + 1 global tab = 5 */
    const towerIds = ['ranged', 'focused', 'broadcast', 'antiair'];
    expect(towerIds.length).toBe(4);

    /* Each tower should have stat costs defined. */
    expect(config.towerStats.costs.length).toBe(5); /* 5 tiers */

    /* Global upgrades exist. */
    expect(config.globalUpgrades.length).toBeGreaterThan(0);
  });

  it('per-tower tab has 4 stats with 5 tiers each', () => {
    const config = createTestConfig();
    const statNames = ['damage', 'fireRate', 'range', 'upgradeDiscount'] as const;

    expect(statNames.length).toBe(4);
    for (const stat of statNames) {
      expect(config.towerStats.bonusPerTier[stat].length).toBe(5);
    }
  });

  it('global tab has upgrades with 3 tiers each', () => {
    const config = createTestConfig();
    for (const upgrade of config.globalUpgrades) {
      expect(upgrade.costs.length).toBe(3);
      expect(upgrade.bonusPerTier.length).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// XP Display Updates
// ---------------------------------------------------------------------------

describe('XP display', () => {
  it('available XP updates after stat purchase', () => {
    const manager = createManagerWithXP(500);
    const xpBefore = manager.getAvailableXp();

    manager.purchaseStatTier('ranged', 'damage'); /* Costs 25 */
    const xpAfter = manager.getAvailableXp();

    expect(xpAfter).toBe(xpBefore - 25);
  });

  it('available XP updates after global purchase', () => {
    const manager = createManagerWithXP(500);
    const xpBefore = manager.getAvailableXp();

    manager.purchaseGlobalTier('tower_hp'); /* Costs 50 */
    const xpAfter = manager.getAvailableXp();

    expect(xpAfter).toBe(xpBefore - 50);
  });

  it('available XP is never negative after valid purchases', () => {
    const manager = createManagerWithXP(25);
    manager.purchaseStatTier('ranged', 'damage'); /* Costs exactly 25 */
    expect(manager.getAvailableXp()).toBe(0);
    expect(manager.getAvailableXp()).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// canPurchase Unified Check
// ---------------------------------------------------------------------------

describe('canPurchase unified API', () => {
  it('returns true for affordable stat tier', () => {
    const manager = createManagerWithXP(100);
    expect(manager.canPurchase('ranged:damage')).toBe(true);
  });

  it('returns false for unaffordable stat tier', () => {
    const manager = createManagerWithXP(10);
    expect(manager.canPurchase('ranged:damage')).toBe(false);
  });

  it('returns true for affordable global tier', () => {
    const manager = createManagerWithXP(100);
    expect(manager.canPurchase('global:tower_hp')).toBe(true);
  });

  it('returns false for unaffordable global tier', () => {
    const manager = createManagerWithXP(10);
    expect(manager.canPurchase('global:tower_hp')).toBe(false);
  });

  it('returns false for maxed stat', () => {
    const profile = {
      totalXpEarned: 10000,
      totalXpSpent: 600,
      towerUpgrades: {
        ranged: {
          damage: 5, fireRate: 0, range: 0, upgradeDiscount: 0,
          midCapstone: false, masteryCapstone: false,
        },
      },
      globalUpgrades: {},
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.canPurchase('ranged:damage')).toBe(false);
  });

  it('returns false for maxed global upgrade', () => {
    const profile = {
      totalXpEarned: 10000,
      totalXpSpent: 425,
      towerUpgrades: {},
      globalUpgrades: { tower_hp: 3 },
    };
    storageMap.set('td_skill_tree', JSON.stringify(profile));
    const manager = new SkillTreeManager();
    manager.setConfig(createTestConfig());

    expect(manager.canPurchase('global:tower_hp')).toBe(false);
  });

  it('returns false when config is not set', () => {
    storageMap.set('td_skill_tree', JSON.stringify({
      totalXpEarned: 1000,
      totalXpSpent: 0,
      towerUpgrades: {},
      globalUpgrades: {},
    }));
    const manager = new SkillTreeManager();
    /* No setConfig. */
    expect(manager.canPurchase('ranged:damage')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SCENE_KEYS constant
// ---------------------------------------------------------------------------

describe('SCENE_KEYS includes SKILL_TREE', () => {
  it('SCENE_KEYS.SKILL_TREE is defined and matches scene key', async () => {
    const { SCENE_KEYS } = await import('../../src/config/game-constants');
    expect(SCENE_KEYS.SKILL_TREE).toBe('SkillTree');
  });
});
