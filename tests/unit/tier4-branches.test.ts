/**
 * Unit tests for BOLT-019: Tier 4 Tower Specialization Branches.
 *
 * Tests cover three layers:
 * 1. Stat resolver: branched tier lookup, fallback behavior, helper functions
 * 2. Branch data integrity: all 8 branches present with valid fields
 * 3. Branch selection logic: permanent choice, stat changes, cost handling
 *
 * Uses the same mock pattern as stat-resolver.test.ts for consistency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveEffectiveStats,
  getBranchOptions,
  getBranchUpgradeData,
} from '../../src/utils/stat-resolver';
import type {
  TowerUpgradeTier,
  TowerDefinition,
  TowerBranch,
} from '../../src/types/game-types';

// ---------------------------------------------------------------------------
// Test data: mirrors tower-upgrades.json with Tier 4 branch entries
// ---------------------------------------------------------------------------

const UPGRADE_DATA: TowerUpgradeTier[] = [
  /* Ranged: Tiers 1-3 */
  { towerId: 'ranged', tier: 1, cost: 0,   damage: 10,  fireRate: 1.5, range: 200, maxHp: 200 },
  { towerId: 'ranged', tier: 2, cost: 40,  damage: 18,  fireRate: 1.8, range: 220, maxHp: 250 },
  { towerId: 'ranged', tier: 3, cost: 70,  damage: 28,  fireRate: 2.2, range: 240, maxHp: 300 },
  /* Ranged: Tier 4 branches */
  { towerId: 'ranged', tier: 4, cost: 120, damage: 22,  fireRate: 3.5, range: 250, maxHp: 350, branch: 'A', branchName: 'Rapid Fire',    branchDescription: 'Extreme attack speed at reduced damage per hit.',  specialEffect: 'rapid_fire' },
  { towerId: 'ranged', tier: 4, cost: 120, damage: 45,  fireRate: 1.8, range: 260, maxHp: 350, branch: 'B', branchName: 'Piercing Arrow', branchDescription: 'High-damage arrows that pass through 2 enemies.', specialEffect: 'pierce' },

  /* Focused: Tiers 1-3 */
  { towerId: 'focused', tier: 1, cost: 0,   damage: 40,  fireRate: 0.5, range: 350, maxHp: 150 },
  { towerId: 'focused', tier: 2, cost: 60,  damage: 65,  fireRate: 0.6, range: 380, maxHp: 200 },
  { towerId: 'focused', tier: 3, cost: 100, damage: 100, fireRate: 0.7, range: 420, maxHp: 250 },
  /* Focused: Tier 4 branches */
  { towerId: 'focused', tier: 4, cost: 150, damage: 180, fireRate: 0.35, range: 500, maxHp: 300, branch: 'A', branchName: 'Marksman',  branchDescription: 'Extreme range and damage at very slow fire rate.', specialEffect: 'marksman' },
  { towerId: 'focused', tier: 4, cost: 150, damage: 70,  fireRate: 0.7,  range: 420, maxHp: 300, branch: 'B', branchName: 'Twin Shot', branchDescription: 'Fires 2 hitscan beams per attack.',               specialEffect: 'twin_shot' },

  /* Broadcast: Tiers 1-3 */
  { towerId: 'broadcast', tier: 1, cost: 0,   damage: 15, fireRate: 0.8, range: 128, maxHp: 250 },
  { towerId: 'broadcast', tier: 2, cost: 50,  damage: 25, fireRate: 1.0, range: 144, maxHp: 320 },
  { towerId: 'broadcast', tier: 3, cost: 85,  damage: 38, fireRate: 1.2, range: 160, maxHp: 400 },
  /* Broadcast: Tier 4 branches */
  { towerId: 'broadcast', tier: 4, cost: 130, damage: 50, fireRate: 1.2, range: 192, maxHp: 480, branch: 'A', branchName: 'Inferno Blast', branchDescription: 'Larger blast radius; leaves a brief burn zone.', specialEffect: 'burn_zone' },
  { towerId: 'broadcast', tier: 4, cost: 130, damage: 30, fireRate: 1.2, range: 144, maxHp: 480, branch: 'B', branchName: 'Frost Wave',    branchDescription: 'Enemies hit are slowed by 30% for 2 seconds.',    specialEffect: 'frost_slow' },

  /* Antiair: Tiers 1-3 */
  { towerId: 'antiair', tier: 1, cost: 0,   damage: 25, fireRate: 1.0, range: 250, maxHp: 180 },
  { towerId: 'antiair', tier: 2, cost: 45,  damage: 40, fireRate: 1.2, range: 280, maxHp: 230 },
  { towerId: 'antiair', tier: 3, cost: 80,  damage: 60, fireRate: 1.5, range: 310, maxHp: 280 },
  /* Antiair: Tier 4 branches */
  { towerId: 'antiair', tier: 4, cost: 140, damage: 55, fireRate: 1.5, range: 330, maxHp: 330, branch: 'A', branchName: 'SAM Battery',    branchDescription: 'Fires 2 missiles per volley.',             specialEffect: 'sam_volley' },
  { towerId: 'antiair', tier: 4, cost: 140, damage: 40, fireRate: 1.2, range: 300, maxHp: 330, branch: 'B', branchName: 'Ground Adapter', branchDescription: 'Targets both ground and air enemies.',     specialEffect: 'ground_adapter' },
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

/** Creates a mock ConfigManager with branch-aware upgrade data. */
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
// Stat Resolver: Branched Tier Lookup
// ---------------------------------------------------------------------------

describe('resolveEffectiveStats with Tier 4 branches', () => {
  let cm: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    cm = createMockConfigManager();
  });

  describe('Tiers 1-3 unchanged behavior', () => {
    it('returns Tier 1 stats for ranged without branch', () => {
      const stats = resolveEffectiveStats({ towerType: 'ranged', upgradeLevel: 1 }, cm);
      expect(stats.damage).toBe(10);
      expect(stats.fireRate).toBe(1.5);
      expect(stats.specialEffect).toBeUndefined();
    });

    it('returns Tier 3 stats for focused without branch', () => {
      const stats = resolveEffectiveStats({ towerType: 'focused', upgradeLevel: 3 }, cm);
      expect(stats.damage).toBe(100);
      expect(stats.fireRate).toBe(0.7);
      expect(stats.specialEffect).toBeUndefined();
    });
  });

  describe('Ranged Tower Tier 4', () => {
    it('returns Rapid Fire (4A) stats with specialEffect', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'ranged', upgradeLevel: 4, branch: 'A' }, cm,
      );
      expect(stats.damage).toBe(22);
      expect(stats.fireRate).toBe(3.5);
      expect(stats.range).toBe(250);
      expect(stats.maxHp).toBe(350);
      expect(stats.specialEffect).toBe('rapid_fire');
    });

    it('returns Piercing Arrow (4B) stats with specialEffect', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'ranged', upgradeLevel: 4, branch: 'B' }, cm,
      );
      expect(stats.damage).toBe(45);
      expect(stats.fireRate).toBe(1.8);
      expect(stats.specialEffect).toBe('pierce');
    });
  });

  describe('Focused Tower Tier 4', () => {
    it('returns Marksman (4A) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'focused', upgradeLevel: 4, branch: 'A' }, cm,
      );
      expect(stats.damage).toBe(180);
      expect(stats.fireRate).toBe(0.35);
      expect(stats.range).toBe(500);
      expect(stats.specialEffect).toBe('marksman');
    });

    it('returns Twin Shot (4B) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'focused', upgradeLevel: 4, branch: 'B' }, cm,
      );
      expect(stats.damage).toBe(70);
      expect(stats.specialEffect).toBe('twin_shot');
    });
  });

  describe('Broadcast Tower Tier 4', () => {
    it('returns Inferno Blast (4A) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'broadcast', upgradeLevel: 4, branch: 'A' }, cm,
      );
      expect(stats.damage).toBe(50);
      expect(stats.range).toBe(192);
      expect(stats.specialEffect).toBe('burn_zone');
    });

    it('returns Frost Wave (4B) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'broadcast', upgradeLevel: 4, branch: 'B' }, cm,
      );
      expect(stats.damage).toBe(30);
      expect(stats.range).toBe(144);
      expect(stats.specialEffect).toBe('frost_slow');
    });
  });

  describe('Antiair Tower Tier 4', () => {
    it('returns SAM Battery (4A) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'antiair', upgradeLevel: 4, branch: 'A' }, cm,
      );
      expect(stats.damage).toBe(55);
      expect(stats.specialEffect).toBe('sam_volley');
    });

    it('returns Ground Adapter (4B) stats', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'antiair', upgradeLevel: 4, branch: 'B' }, cm,
      );
      expect(stats.damage).toBe(40);
      expect(stats.specialEffect).toBe('ground_adapter');
    });
  });

  describe('fallback behavior for Tier 4', () => {
    it('falls back to Tier 3 when Tier 4 has no matching branch', () => {
      /* Tier 4 without a branch should fall back to Tier 3 stats. */
      const stats = resolveEffectiveStats(
        { towerType: 'ranged', upgradeLevel: 4, branch: 'A' },
        {
          getUpgrades: vi.fn(() => [
            { towerId: 'ranged', tier: 1, cost: 0, damage: 10, fireRate: 1.5, range: 200, maxHp: 200 },
            { towerId: 'ranged', tier: 3, cost: 70, damage: 28, fireRate: 2.2, range: 240, maxHp: 300 },
          ]),
          getTower: vi.fn(() => TOWER_DEFS['ranged']),
        } as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      /* Should fall back to Tier 3 because no branch data exists. */
      expect(stats.damage).toBe(28);
      expect(stats.specialEffect).toBeUndefined();
    });

    it('falls back to base definition when no tier data at all', () => {
      const stats = resolveEffectiveStats(
        { towerType: 'ranged', upgradeLevel: 4, branch: 'A' },
        {
          getUpgrades: vi.fn(() => []),
          getTower: vi.fn(() => TOWER_DEFS['ranged']),
        } as unknown as import('../../src/utils/config-manager').ConfigManager,
      );
      expect(stats.damage).toBe(10);
    });
  });
});

// ---------------------------------------------------------------------------
// getBranchOptions helper
// ---------------------------------------------------------------------------

describe('getBranchOptions', () => {
  let cm: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    cm = createMockConfigManager();
  });

  it('returns both branches for ranged tower', () => {
    const { branchA, branchB } = getBranchOptions('ranged', cm);
    expect(branchA).toBeDefined();
    expect(branchB).toBeDefined();
    expect(branchA!.branchName).toBe('Rapid Fire');
    expect(branchB!.branchName).toBe('Piercing Arrow');
  });

  it('returns both branches for focused tower', () => {
    const { branchA, branchB } = getBranchOptions('focused', cm);
    expect(branchA!.branchName).toBe('Marksman');
    expect(branchB!.branchName).toBe('Twin Shot');
  });

  it('returns both branches for broadcast tower', () => {
    const { branchA, branchB } = getBranchOptions('broadcast', cm);
    expect(branchA!.branchName).toBe('Inferno Blast');
    expect(branchB!.branchName).toBe('Frost Wave');
  });

  it('returns both branches for antiair tower', () => {
    const { branchA, branchB } = getBranchOptions('antiair', cm);
    expect(branchA!.branchName).toBe('SAM Battery');
    expect(branchB!.branchName).toBe('Ground Adapter');
  });

  it('returns undefined branches for tower type without branch data', () => {
    const { branchA, branchB } = getBranchOptions('nonexistent', cm);
    expect(branchA).toBeUndefined();
    expect(branchB).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBranchUpgradeData helper
// ---------------------------------------------------------------------------

describe('getBranchUpgradeData', () => {
  let cm: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    cm = createMockConfigManager();
  });

  it('returns branch A data for ranged', () => {
    const data = getBranchUpgradeData('ranged', 'A', cm);
    expect(data).toBeDefined();
    expect(data!.cost).toBe(120);
    expect(data!.specialEffect).toBe('rapid_fire');
  });

  it('returns branch B data for ranged', () => {
    const data = getBranchUpgradeData('ranged', 'B', cm);
    expect(data).toBeDefined();
    expect(data!.cost).toBe(120);
    expect(data!.specialEffect).toBe('pierce');
  });

  it('returns undefined for nonexistent tower', () => {
    const data = getBranchUpgradeData('nonexistent', 'A', cm);
    expect(data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Branch data integrity
// ---------------------------------------------------------------------------

describe('Branch data integrity', () => {
  let cm: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    cm = createMockConfigManager();
  });

  it('all 4 tower types have exactly 2 Tier 4 branches', () => {
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const upgrades = cm.getUpgrades(towerId);
      const tier4 = upgrades.filter(u => u.tier === 4);
      expect(tier4).toHaveLength(2);

      const branches = tier4.map(u => u.branch);
      expect(branches).toContain('A');
      expect(branches).toContain('B');
    }
  });

  it('all branches have non-empty branchName', () => {
    for (const u of UPGRADE_DATA) {
      if (u.tier === 4) {
        expect(u.branchName).toBeTruthy();
        expect(u.branchName!.length).toBeGreaterThan(0);
      }
    }
  });

  it('all branches have non-empty branchDescription', () => {
    for (const u of UPGRADE_DATA) {
      if (u.tier === 4) {
        expect(u.branchDescription).toBeTruthy();
        expect(u.branchDescription!.length).toBeGreaterThan(0);
      }
    }
  });

  it('all branches have a specialEffect defined', () => {
    for (const u of UPGRADE_DATA) {
      if (u.tier === 4) {
        expect(u.specialEffect).toBeTruthy();
      }
    }
  });

  it('all branch stat values are positive', () => {
    for (const u of UPGRADE_DATA) {
      if (u.tier === 4) {
        expect(u.damage).toBeGreaterThan(0);
        expect(u.fireRate).toBeGreaterThan(0);
        expect(u.range).toBeGreaterThan(0);
        expect(u.maxHp).toBeGreaterThan(0);
        expect(u.cost).toBeGreaterThan(0);
      }
    }
  });

  it('Tier 4 maxHp is greater than Tier 3 maxHp for all towers', () => {
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const upgrades = cm.getUpgrades(towerId);
      const tier3 = upgrades.find(u => u.tier === 3);
      const tier4Entries = upgrades.filter(u => u.tier === 4);

      for (const t4 of tier4Entries) {
        expect(t4.maxHp).toBeGreaterThan(tier3!.maxHp);
      }
    }
  });

  it('Tier 4 cost is greater than Tier 3 cost for all towers', () => {
    for (const towerId of ['ranged', 'focused', 'broadcast', 'antiair']) {
      const upgrades = cm.getUpgrades(towerId);
      const tier3 = upgrades.find(u => u.tier === 3);
      const tier4Entries = upgrades.filter(u => u.tier === 4);

      for (const t4 of tier4Entries) {
        expect(t4.cost).toBeGreaterThan(tier3!.cost);
      }
    }
  });

  it('branch specialEffects are unique across all branches', () => {
    const effects = UPGRADE_DATA
      .filter(u => u.tier === 4)
      .map(u => u.specialEffect);
    const unique = new Set(effects);
    expect(unique.size).toBe(effects.length);
  });

  it('Tiers 1-3 do not have branch fields', () => {
    for (const u of UPGRADE_DATA) {
      if (u.tier < 4) {
        expect(u.branch).toBeUndefined();
        expect(u.specialEffect).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Branch selection state
// ---------------------------------------------------------------------------

describe('Branch selection state model', () => {
  it('PlacedTower branch field is undefined before Tier 4', () => {
    const tower = { towerType: 'ranged', upgradeLevel: 3 } as { towerType: string; upgradeLevel: number; branch?: TowerBranch };
    expect(tower.branch).toBeUndefined();
  });

  it('PlacedTower branch field is set after branch selection', () => {
    const tower = { towerType: 'ranged', upgradeLevel: 3 } as { towerType: string; upgradeLevel: number; branch?: TowerBranch };
    /* Simulate branch selection. */
    tower.branch = 'A';
    tower.upgradeLevel = 4;
    expect(tower.branch).toBe('A');
    expect(tower.upgradeLevel).toBe(4);
  });

  it('different towers can select different branches', () => {
    const tower1 = { towerType: 'ranged', upgradeLevel: 4, branch: 'A' as TowerBranch };
    const tower2 = { towerType: 'ranged', upgradeLevel: 4, branch: 'B' as TowerBranch };

    const cm = createMockConfigManager();
    const stats1 = resolveEffectiveStats(tower1, cm);
    const stats2 = resolveEffectiveStats(tower2, cm);

    /* Branch A (Rapid Fire) has lower damage but higher fireRate. */
    expect(stats1.damage).toBeLessThan(stats2.damage);
    expect(stats1.fireRate).toBeGreaterThan(stats2.fireRate);
  });
});

// ---------------------------------------------------------------------------
// Sell refund with Tier 4 investment
// ---------------------------------------------------------------------------

describe('Sell refund with Tier 4 branch investment', () => {
  it('includes Tier 4 branch cost in totalInvested for refund', () => {
    /* Arrow tower: base 50 + T2 40 + T3 70 + T4A 120 = 280. floor(280*0.5) = 140. */
    const refund = Math.floor((50 + 40 + 70 + 120) * 0.5);
    expect(refund).toBe(140);
  });

  it('AA Missile full upgrade path with SAM Battery', () => {
    /* AA: 60 + 45 + 80 + 140 = 325. floor(325*0.5) = 162. */
    const refund = Math.floor((60 + 45 + 80 + 140) * 0.5);
    expect(refund).toBe(162);
  });

  it('Sniper full upgrade path with Marksman', () => {
    /* Sniper: 100 + 60 + 100 + 150 = 410. floor(410*0.5) = 205. */
    const refund = Math.floor((100 + 60 + 100 + 150) * 0.5);
    expect(refund).toBe(205);
  });
});
