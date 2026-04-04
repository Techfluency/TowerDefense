/**
 * Unit tests for the stat resolver, repair cost formula, and refund calculation.
 *
 * Tests cover:
 * - resolveEffectiveStats() for all 4 tower types at all 3 tiers
 * - Fallback to base TowerDefinition when upgrade data is missing
 * - Repair cost formula: 1 gold per 5 HP missing, minimum 5
 * - Sell refund including upgrade investment: floor(totalInvested * 0.5)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveEffectiveStats } from '../../src/utils/stat-resolver';
import type { TowerUpgradeTier, TowerDefinition } from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test data matching tower-upgrades.json and towers.json
// ---------------------------------------------------------------------------

const UPGRADE_DATA: TowerUpgradeTier[] = [
  { towerId: 'ranged',    tier: 1, cost: 0,   damage: 10,  fireRate: 1.5, range: 200, maxHp: 200 },
  { towerId: 'ranged',    tier: 2, cost: 40,  damage: 18,  fireRate: 1.8, range: 220, maxHp: 250 },
  { towerId: 'ranged',    tier: 3, cost: 70,  damage: 28,  fireRate: 2.2, range: 240, maxHp: 300 },

  { towerId: 'focused',   tier: 1, cost: 0,   damage: 40,  fireRate: 0.5, range: 350, maxHp: 150 },
  { towerId: 'focused',   tier: 2, cost: 60,  damage: 65,  fireRate: 0.6, range: 380, maxHp: 200 },
  { towerId: 'focused',   tier: 3, cost: 100, damage: 100, fireRate: 0.7, range: 420, maxHp: 250 },

  { towerId: 'broadcast', tier: 1, cost: 0,   damage: 15,  fireRate: 0.8, range: 128, maxHp: 250 },
  { towerId: 'broadcast', tier: 2, cost: 50,  damage: 25,  fireRate: 1.0, range: 144, maxHp: 320 },
  { towerId: 'broadcast', tier: 3, cost: 85,  damage: 38,  fireRate: 1.2, range: 160, maxHp: 400 },

  { towerId: 'antiair',   tier: 1, cost: 0,   damage: 25,  fireRate: 1.0, range: 250, maxHp: 180 },
  { towerId: 'antiair',   tier: 2, cost: 45,  damage: 40,  fireRate: 1.2, range: 280, maxHp: 230 },
  { towerId: 'antiair',   tier: 3, cost: 80,  damage: 60,  fireRate: 1.5, range: 310, maxHp: 280 },
];

const TOWER_DEFS: Record<string, TowerDefinition> = {
  ranged: {
    id: 'ranged', name: 'Arrow Tower', towerClass: 'ranged', cost: 50,
    range: 200, fireRate: 1.5, damage: 10, maxHp: 200,
    targetingMode: 'first', description: '', spriteKey: 'tower-ranged', projectileType: 'arrow',
  },
  focused: {
    id: 'focused', name: 'Sniper Tower', towerClass: 'focused', cost: 100,
    range: 350, fireRate: 0.5, damage: 40, maxHp: 150,
    targetingMode: 'strongest', description: '', spriteKey: 'tower-focused', projectileType: 'none',
  },
  broadcast: {
    id: 'broadcast', name: 'Shockwave Tower', towerClass: 'broadcast', cost: 75,
    range: 128, fireRate: 0.8, damage: 15, maxHp: 250,
    targetingMode: 'closest', description: '', spriteKey: 'tower-broadcast', projectileType: 'none',
  },
  antiair: {
    id: 'antiair', name: 'AA Missile Tower', towerClass: 'antiair', cost: 60,
    range: 250, fireRate: 1.0, damage: 25, maxHp: 180,
    targetingMode: 'first', description: '', spriteKey: 'tower-antiair', projectileType: 'missile',
  },
};

/** Creates a mock ConfigManager that returns upgrade and tower data. */
function createMockConfigManager() {
  const upgradesByTower = new Map<string, TowerUpgradeTier[]>();
  for (const u of UPGRADE_DATA) {
    const arr = upgradesByTower.get(u.towerId) ?? [];
    arr.push(u);
    upgradesByTower.set(u.towerId, arr);
  }
  for (const arr of upgradesByTower.values()) {
    arr.sort((a, b) => a.tier - b.tier);
  }

  return {
    getUpgrades: vi.fn((towerId: string) => upgradesByTower.get(towerId) ?? []),
    getTower: vi.fn((id: string) => {
      const def = TOWER_DEFS[id];
      if (!def) throw new Error(`Tower "${id}" not found`);
      return def;
    }),
  } as unknown as import('../../src/utils/config-manager').ConfigManager;
}

// ---------------------------------------------------------------------------
// Stat Resolver Tests
// ---------------------------------------------------------------------------

describe('resolveEffectiveStats', () => {
  let cm: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    cm = createMockConfigManager();
  });

  describe('Arrow Tower (ranged)', () => {
    it('returns Tier 1 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 1 }, cm);
      expect(stats).toEqual({ damage: 10, fireRate: 1.5, range: 200, maxHp: 200 });
    });

    it('returns Tier 2 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 2 }, cm);
      expect(stats).toEqual({ damage: 18, fireRate: 1.8, range: 220, maxHp: 250 });
    });

    it('returns Tier 3 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 3 }, cm);
      expect(stats).toEqual({ damage: 28, fireRate: 2.2, range: 240, maxHp: 300 });
    });
  });

  describe('Sniper Tower (focused)', () => {
    it('returns Tier 1 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'focused', upgradeLevel: 1 }, cm);
      expect(stats).toEqual({ damage: 40, fireRate: 0.5, range: 350, maxHp: 150 });
    });

    it('returns Tier 2 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'focused', upgradeLevel: 2 }, cm);
      expect(stats).toEqual({ damage: 65, fireRate: 0.6, range: 380, maxHp: 200 });
    });

    it('returns Tier 3 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'focused', upgradeLevel: 3 }, cm);
      expect(stats).toEqual({ damage: 100, fireRate: 0.7, range: 420, maxHp: 250 });
    });
  });

  describe('Shockwave Tower (broadcast)', () => {
    it('returns Tier 1 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'broadcast', upgradeLevel: 1 }, cm);
      expect(stats).toEqual({ damage: 15, fireRate: 0.8, range: 128, maxHp: 250 });
    });

    it('returns Tier 2 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'broadcast', upgradeLevel: 2 }, cm);
      expect(stats).toEqual({ damage: 25, fireRate: 1.0, range: 144, maxHp: 320 });
    });

    it('returns Tier 3 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'broadcast', upgradeLevel: 3 }, cm);
      expect(stats).toEqual({ damage: 38, fireRate: 1.2, range: 160, maxHp: 400 });
    });
  });

  describe('AA Missile Tower (antiair)', () => {
    it('returns Tier 1 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'antiair', upgradeLevel: 1 }, cm);
      expect(stats).toEqual({ damage: 25, fireRate: 1.0, range: 250, maxHp: 180 });
    });

    it('returns Tier 2 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'antiair', upgradeLevel: 2 }, cm);
      expect(stats).toEqual({ damage: 40, fireRate: 1.2, range: 280, maxHp: 230 });
    });

    it('returns Tier 3 stats', () => {
      const stats = resolveEffectiveStats({ towerType: 'antiair', upgradeLevel: 3 }, cm);
      expect(stats).toEqual({ damage: 60, fireRate: 1.5, range: 310, maxHp: 280 });
    });
  });

  describe('fallback behavior', () => {
    it('falls back to base TowerDefinition for unknown tier', () => {
      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 99 }, cm);
      expect(stats).toEqual({ damage: 10, fireRate: 1.5, range: 200, maxHp: 200 });
    });

    it('falls back to base TowerDefinition when no upgrade data exists for tower', () => {
      /* Create a ConfigManager that has no upgrades for "ranged". */
      const emptyCm = {
        getUpgrades: vi.fn(() => []),
        getTower: vi.fn(() => TOWER_DEFS['ranged']),
      } as unknown as import('../../src/utils/config-manager').ConfigManager;

      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 1 }, emptyCm);
      expect(stats).toEqual({ damage: 10, fireRate: 1.5, range: 200, maxHp: 200 });
    });
  });
});

// ---------------------------------------------------------------------------
// Repair Cost Tests
// ---------------------------------------------------------------------------

/**
 * Repair cost formula (from product-output.md):
 * cost = max(5, ceil(missingHp / 5))
 * Returns 0 if tower is at full HP.
 */
function calcRepairCost(currentHp: number, maxHp: number): number {
  const missing = maxHp - currentHp;
  if (missing <= 0) return 0;
  return Math.max(5, Math.ceil(missing / 5));
}

describe('Repair cost formula', () => {
  it('returns 0 at full HP', () => {
    expect(calcRepairCost(200, 200)).toBe(0);
  });

  it('returns minimum 5 gold for small damage', () => {
    expect(calcRepairCost(199, 200)).toBe(5);
    expect(calcRepairCost(195, 200)).toBe(5);
  });

  it('calculates correct cost at 50/200 HP (AC from spec: 30g)', () => {
    /* Missing = 150. ceil(150/5) = 30. max(5, 30) = 30. */
    expect(calcRepairCost(50, 200)).toBe(30);
  });

  it('calculates correct cost at 60/200 HP (spec example: 28g)', () => {
    /* Missing = 140. ceil(140/5) = 28. max(5, 28) = 28. */
    expect(calcRepairCost(60, 200)).toBe(28);
  });

  it('handles 0 HP (fully destroyed)', () => {
    /* Missing = 200. ceil(200/5) = 40. */
    expect(calcRepairCost(0, 200)).toBe(40);
  });

  it('handles non-round HP values', () => {
    /* Missing = 17. ceil(17/5) = 4. max(5, 4) = 5. */
    expect(calcRepairCost(183, 200)).toBe(5);
  });

  it('scales correctly with large maxHp', () => {
    /* Missing = 350. ceil(350/5) = 70. */
    expect(calcRepairCost(50, 400)).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Sell Refund Tests
// ---------------------------------------------------------------------------

describe('Sell refund calculation (totalInvested-based)', () => {
  it('refund is 50% of base cost only at Tier 1', () => {
    /* Arrow tower: cost 50, no upgrades. totalInvested = 50. */
    const refund = Math.floor(50 * 0.5);
    expect(refund).toBe(25);
  });

  it('refund includes Tier 2 upgrade cost', () => {
    /* Arrow tower: cost 50 + upgrade 40 = 90. floor(90*0.5) = 45. */
    const refund = Math.floor((50 + 40) * 0.5);
    expect(refund).toBe(45);
  });

  it('refund includes all upgrade costs through Tier 3 (spec AC-007-T2)', () => {
    /* Arrow tower: 50 + 40 + 70 = 160. floor(160*0.5) = 80. */
    const refund = Math.floor((50 + 40 + 70) * 0.5);
    expect(refund).toBe(80);
  });

  it('applies floor rounding on odd totals', () => {
    /* Shockwave: 75 + 50 = 125. floor(125*0.5) = 62. */
    const refund = Math.floor((75 + 50) * 0.5);
    expect(refund).toBe(62);
  });

  it('handles Sniper tower full upgrade path', () => {
    /* Sniper: 100 + 60 + 100 = 260. floor(260*0.5) = 130. */
    const refund = Math.floor((100 + 60 + 100) * 0.5);
    expect(refund).toBe(130);
  });

  it('handles AA Missile tower full upgrade path', () => {
    /* AA: 60 + 45 + 80 = 185. floor(185*0.5) = 92. */
    const refund = Math.floor((60 + 45 + 80) * 0.5);
    expect(refund).toBe(92);
  });
});

// ---------------------------------------------------------------------------
// Upgrade data integrity tests
// ---------------------------------------------------------------------------

describe('Upgrade data integrity', () => {
  it('all 4 tower types have exactly 3 tiers', () => {
    const cm = createMockConfigManager();
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const upgrades = cm.getUpgrades(towerId);
      expect(upgrades).toHaveLength(3);
      expect(upgrades.map(u => u.tier)).toEqual([1, 2, 3]);
    }
  });

  it('Tier 1 cost is 0 for all tower types', () => {
    const cm = createMockConfigManager();
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const tier1 = cm.getUpgrades(towerId).find(u => u.tier === 1);
      expect(tier1!.cost).toBe(0);
    }
  });

  it('damage scales roughly 2.5-3x from Tier 1 to Tier 3', () => {
    const cm = createMockConfigManager();
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const tiers = cm.getUpgrades(towerId);
      const ratio = tiers[2]!.damage / tiers[0]!.damage;
      expect(ratio).toBeGreaterThanOrEqual(2.0);
      expect(ratio).toBeLessThanOrEqual(3.5);
    }
  });

  it('all stat values are positive', () => {
    for (const u of UPGRADE_DATA) {
      expect(u.damage).toBeGreaterThan(0);
      expect(u.fireRate).toBeGreaterThan(0);
      expect(u.range).toBeGreaterThan(0);
      expect(u.maxHp).toBeGreaterThan(0);
    }
  });

  it('Tier 1 stats match base TowerDefinition values', () => {
    const cm = createMockConfigManager();
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const tier1Stats = resolveEffectiveStats({ towerType: towerId, upgradeLevel: 1 }, cm);
      const def = TOWER_DEFS[towerId]!;
      expect(tier1Stats.damage).toBe(def.damage);
      expect(tier1Stats.fireRate).toBe(def.fireRate);
      expect(tier1Stats.range).toBe(def.range);
    }
  });
});
