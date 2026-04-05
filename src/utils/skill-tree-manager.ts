/**
 * Skill tree manager -- persistent skill tree progression across runs.
 *
 * Replaces the old level-based ProgressionManager (BOLT-021) with a
 * flexible skill tree where players spend XP on per-tower stat upgrades,
 * capstone abilities, and global bonuses.
 *
 * This is the single authority for:
 * - SkillTreeProfile persistence (localStorage)
 * - Purchase validation (prerequisites, XP balance)
 * - XP balance tracking (earned - spent)
 * - RunBonuses computation from current profile
 * - Migration from old level/XP format
 *
 * Instantiated once at game boot and stored on the Phaser registry
 * for cross-scene access (MainMenu, GameOver, SkillTree UI).
 *
 * BOLT-023: Skill Tree Data Model, Config, and Migration.
 */
import type {
  SkillTreeProfile,
  TowerUpgradeState,
  SkillTreeConfig,
  RunBonuses,
  CapstoneDefinition,
  GlobalUpgradeDefinition,
  TowerStatName,
} from '../types/game-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the skill tree profile. */
const STORAGE_KEY = 'td_skill_tree';

/** localStorage key used by the old BOLT-021 level system (for migration). */
const OLD_STORAGE_KEY = 'rgtd_player_profile';

/** Maximum tier for per-tower stat upgrades. */
const MAX_STAT_TIER = 5;

/** Maximum tier for global upgrades. */
const MAX_GLOBAL_TIER = 3;

/** The four tower IDs that have skill tree entries. */
const TOWER_IDS = ['ranged', 'focused', 'broadcast', 'antiair'] as const;

/** The four stat names on each tower. */
const STAT_NAMES: TowerStatName[] = ['damage', 'fireRate', 'range', 'upgradeDiscount'];

// ---------------------------------------------------------------------------
// XP Calculation (kept from BOLT-021, unchanged)
// ---------------------------------------------------------------------------

/** XP awarded per enemy killed. */
const XP_PER_KILL = 1;
/** XP awarded per wave survived. */
const XP_PER_WAVE = 10;
/** XP awarded per boss killed. */
const XP_PER_BOSS_KILL = 50;

/**
 * Run results used to calculate XP gained from a single run.
 * Unchanged from BOLT-021.
 */
export interface XPRunData {
  /** Total enemies killed in the run. */
  totalKills: number;
  /** Number of waves survived/completed. */
  wavesSurvived: number;
  /** Number of boss enemies killed in the run. */
  bossKills: number;
}

/**
 * Result of applying run XP to the player profile.
 * Simplified from BOLT-021: no levels, just XP balance.
 */
export interface XPResult {
  /** XP gained from this run (before XP boost). */
  baseXpGained: number;
  /** XP gained after XP boost multiplier. */
  xpGained: number;
  /** Total XP earned lifetime after this run. */
  totalXpEarned: number;
  /** Available XP (earned - spent) after this run. */
  availableXp: number;
}

/**
 * Calculates base XP earned from a single run.
 * XP formula is unchanged from BOLT-021.
 *
 * @param runData - End-of-run statistics.
 * @returns Base XP earned (before any XP boost).
 */
export function calculateRunXP(runData: XPRunData): number {
  return (
    runData.totalKills * XP_PER_KILL +
    runData.wavesSurvived * XP_PER_WAVE +
    runData.bossKills * XP_PER_BOSS_KILL
  );
}

// ---------------------------------------------------------------------------
// SkillTreeManager
// ---------------------------------------------------------------------------

export class SkillTreeManager {
  /** In-memory skill tree profile. Loaded from localStorage on construction. */
  private profile: SkillTreeProfile;

  /** Whether localStorage is available. If false, progression is session-only. */
  private storageAvailable: boolean;

  /** Skill tree config data (costs, bonuses, capstones, globals). */
  private config: SkillTreeConfig | null = null;

  /**
   * Creates the skill tree manager. Runs migration if old profile
   * is detected, then loads the skill tree profile from localStorage
   * (or creates a fresh one if none exists).
   */
  constructor() {
    this.storageAvailable = SkillTreeManager.checkStorageAvailable();
    this.migrateFromOldProfile();
    this.profile = this.loadProfile();
  }

  // -------------------------------------------------------------------------
  // Config Binding
  // -------------------------------------------------------------------------

  /**
   * Binds the skill tree config data. Must be called after the config
   * is loaded from the Phaser cache (typically during scene creation).
   * Without config, purchase operations will throw.
   *
   * @param config - The parsed SkillTreeConfig from skill-tree.json.
   */
  setConfig(config: SkillTreeConfig): void {
    this.config = config;
  }

  /**
   * Returns the bound skill tree config, or throws if not yet bound.
   *
   * @returns The skill tree config.
   * @throws Error if config has not been set via setConfig().
   */
  getConfig(): SkillTreeConfig {
    if (!this.config) {
      throw new Error(
        'SkillTreeManager: config not set. Call setConfig() after loading skill-tree.json.',
      );
    }
    return this.config;
  }

  // -------------------------------------------------------------------------
  // XP Balance
  // -------------------------------------------------------------------------

  /**
   * Returns the player's available (spendable) XP.
   * Available XP = totalXpEarned - totalXpSpent.
   *
   * @returns Available XP balance.
   */
  getAvailableXp(): number {
    return this.profile.totalXpEarned - this.profile.totalXpSpent;
  }

  /**
   * Returns the total lifetime XP earned across all runs.
   *
   * @returns Total XP earned.
   */
  getTotalXpEarned(): number {
    return this.profile.totalXpEarned;
  }

  /**
   * Returns the total XP spent on skill tree upgrades.
   *
   * @returns Total XP spent.
   */
  getTotalXpSpent(): number {
    return this.profile.totalXpSpent;
  }

  // -------------------------------------------------------------------------
  // Purchase: Per-Tower Stat Tier
  // -------------------------------------------------------------------------

  /**
   * Purchases the next tier of a stat for a tower. Validates that:
   * 1. The tower and stat exist
   * 2. The stat is not already maxed (tier 5)
   * 3. The player has enough available XP
   *
   * @param towerId - Tower ID (e.g., "ranged").
   * @param stat - Stat name (e.g., "damage").
   * @returns true if the purchase succeeded.
   * @throws Error if config is not set.
   */
  purchaseStatTier(towerId: string, stat: TowerStatName): boolean {
    const config = this.getConfig();
    const towerState = this.getOrCreateTowerState(towerId);
    const currentTier = towerState[stat];

    /* Already at max tier. */
    if (currentTier >= MAX_STAT_TIER) return false;

    const cost = config.towerStats.costs[currentTier];
    if (cost === undefined) return false;

    /* Insufficient XP. */
    if (this.getAvailableXp() < cost) return false;

    /* Apply purchase. */
    towerState[stat] = currentTier + 1;
    this.profile.totalXpSpent += cost;
    this.saveProfile();
    return true;
  }

  /**
   * Returns the cost of the next tier for a tower stat, or null if maxed.
   *
   * @param towerId - Tower ID.
   * @param stat - Stat name.
   * @returns XP cost for the next tier, or null if at max.
   */
  getStatTierCost(towerId: string, stat: TowerStatName): number | null {
    const config = this.getConfig();
    const towerState = this.getTowerState(towerId);
    const currentTier = towerState ? towerState[stat] : 0;
    if (currentTier >= MAX_STAT_TIER) return null;
    return config.towerStats.costs[currentTier] ?? null;
  }

  /**
   * Returns the current tier of a stat for a tower.
   *
   * @param towerId - Tower ID.
   * @param stat - Stat name.
   * @returns Current tier (0-5).
   */
  getStatTier(towerId: string, stat: TowerStatName): number {
    const towerState = this.getTowerState(towerId);
    return towerState ? towerState[stat] : 0;
  }

  // -------------------------------------------------------------------------
  // Purchase: Global Upgrade Tier
  // -------------------------------------------------------------------------

  /**
   * Purchases the next tier of a global upgrade. Validates that:
   * 1. The upgrade ID exists in config
   * 2. The upgrade is not already maxed (tier 3)
   * 3. The player has enough available XP
   *
   * @param upgradeId - Global upgrade ID (e.g., "tower_hp").
   * @returns true if the purchase succeeded.
   * @throws Error if config is not set.
   */
  purchaseGlobalTier(upgradeId: string): boolean {
    const config = this.getConfig();
    const upgradeDef = config.globalUpgrades.find(u => u.id === upgradeId);
    if (!upgradeDef) return false;

    const currentTier = this.profile.globalUpgrades[upgradeId] ?? 0;

    /* Already at max tier. */
    if (currentTier >= MAX_GLOBAL_TIER) return false;

    const cost = upgradeDef.costs[currentTier];
    if (cost === undefined) return false;

    /* Insufficient XP. */
    if (this.getAvailableXp() < cost) return false;

    /* Apply purchase. */
    this.profile.globalUpgrades[upgradeId] = currentTier + 1;
    this.profile.totalXpSpent += cost;
    this.saveProfile();
    return true;
  }

  /**
   * Returns the current tier of a global upgrade.
   *
   * @param upgradeId - Global upgrade ID.
   * @returns Current tier (0-3).
   */
  getGlobalTier(upgradeId: string): number {
    return this.profile.globalUpgrades[upgradeId] ?? 0;
  }

  /**
   * Returns the cost of the next tier for a global upgrade, or null if maxed.
   *
   * @param upgradeId - Global upgrade ID.
   * @returns XP cost for the next tier, or null if at max.
   */
  getGlobalTierCost(upgradeId: string): number | null {
    const config = this.getConfig();
    const upgradeDef = config.globalUpgrades.find(u => u.id === upgradeId);
    if (!upgradeDef) return null;

    const currentTier = this.profile.globalUpgrades[upgradeId] ?? 0;
    if (currentTier >= MAX_GLOBAL_TIER) return null;
    return upgradeDef.costs[currentTier] ?? null;
  }

  // -------------------------------------------------------------------------
  // Purchase: Capstone
  // -------------------------------------------------------------------------

  /**
   * Purchases a capstone node. Validates that:
   * 1. The capstone exists in config
   * 2. The capstone is not already purchased
   * 3. Prerequisites are met (enough stats at required tiers)
   * 4. The player has enough available XP
   *
   * @param capstoneId - Capstone ID (e.g., "ranged_steady_aim").
   * @returns true if the purchase succeeded.
   * @throws Error if config is not set.
   */
  purchaseCapstone(capstoneId: string): boolean {
    const config = this.getConfig();
    const capstoneDef = config.capstones.find(c => c.id === capstoneId);
    if (!capstoneDef) return false;

    const towerState = this.getOrCreateTowerState(capstoneDef.towerId);

    /* Check if already purchased. */
    const capstoneKey = capstoneDef.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
    if (towerState[capstoneKey]) return false;

    /* Check prerequisites. */
    if (!this.checkCapstonePrerequisites(capstoneDef, towerState)) return false;

    /* Check XP balance. */
    if (this.getAvailableXp() < capstoneDef.cost) return false;

    /* Apply purchase. */
    towerState[capstoneKey] = true;
    this.profile.totalXpSpent += capstoneDef.cost;
    this.saveProfile();
    return true;
  }

  /**
   * Checks whether a capstone's prerequisites are met for the given tower state.
   * Mid capstone: requires N stats at minTier (N = requiredCount, typically 2 stats at Tier 2).
   * Mastery capstone: requires N stats at minTier (N = requiredCount, typically 3 stats at Tier 4).
   *
   * @param capstoneDef - The capstone definition to check.
   * @param towerState - The current tower upgrade state.
   * @returns true if enough prerequisites are met.
   */
  checkCapstonePrerequisites(
    capstoneDef: CapstoneDefinition,
    towerState: TowerUpgradeState,
  ): boolean {
    let metCount = 0;
    for (const prereq of capstoneDef.prerequisites) {
      const statName = prereq.stat as TowerStatName;
      if (STAT_NAMES.includes(statName) && towerState[statName] >= prereq.minTier) {
        metCount++;
      }
    }
    return metCount >= capstoneDef.requiredCount;
  }

  // -------------------------------------------------------------------------
  // Can-Purchase Check (unified)
  // -------------------------------------------------------------------------

  /**
   * Checks whether a node can be purchased. Handles stat tiers, global tiers,
   * and capstones. Returns true if prerequisites + XP balance allow purchase.
   *
   * @param nodeId - One of: "towerId:stat" for stat tiers, "global:upgradeId" for globals, or capstone ID.
   * @returns true if the node can be purchased.
   */
  canPurchase(nodeId: string): boolean {
    if (!this.config) return false;

    /* Check if this is a stat tier node (format: "towerId:stat"). */
    if (nodeId.includes(':')) {
      const [towerId, stat] = nodeId.split(':');
      if (towerId && STAT_NAMES.includes(stat as TowerStatName)) {
        const cost = this.getStatTierCost(towerId, stat as TowerStatName);
        return cost !== null && this.getAvailableXp() >= cost;
      }
      /* Check if this is a global node (format: "global:upgradeId"). */
      if (towerId === 'global' && stat) {
        const cost = this.getGlobalTierCost(stat);
        return cost !== null && this.getAvailableXp() >= cost;
      }
      return false;
    }

    /* Otherwise, treat as a capstone ID. */
    const capstoneDef = this.config.capstones.find(c => c.id === nodeId);
    if (!capstoneDef) return false;

    const towerState = this.getTowerState(capstoneDef.towerId);
    if (!towerState) return false;

    const capstoneKey = capstoneDef.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
    if (towerState[capstoneKey]) return false;

    if (!this.checkCapstonePrerequisites(capstoneDef, towerState)) return false;
    return this.getAvailableXp() >= capstoneDef.cost;
  }

  // -------------------------------------------------------------------------
  // Bonus Computation
  // -------------------------------------------------------------------------

  /**
   * Computes cumulative stat multipliers for a tower based on purchased tiers.
   * Bonuses are cumulative: Tier 3 damage gives +5% +10% +15% = +30% total.
   *
   * @param towerId - Tower ID (e.g., "ranged").
   * @returns Object with multiplier for each stat (1.0 = no bonus).
   */
  getTowerStatMultipliers(towerId: string): {
    damage: number;
    fireRate: number;
    range: number;
    upgradeDiscount: number;
  } {
    const result = { damage: 1.0, fireRate: 1.0, range: 1.0, upgradeDiscount: 1.0 };
    const towerState = this.getTowerState(towerId);
    if (!towerState || !this.config) return result;

    const bonusPerTier = this.config.towerStats.bonusPerTier;

    for (const stat of STAT_NAMES) {
      const tier = towerState[stat];
      let totalBonus = 0;
      /* Sum bonuses from tier 1 through the player's current tier. */
      for (let i = 0; i < tier; i++) {
        totalBonus += bonusPerTier[stat][i] ?? 0;
      }
      if (stat === 'upgradeDiscount') {
        /* Discount is subtracted: 1.0 - bonus = effective cost multiplier. */
        result[stat] = 1.0 - totalBonus;
      } else {
        /* Other stats are additive bonuses: 1.0 + bonus = effective multiplier. */
        result[stat] = 1.0 + totalBonus;
      }
    }

    return result;
  }

  /**
   * Computes global bonus values from the current global upgrade tiers.
   * Bonuses are cumulative per upgrade.
   *
   * @returns Global bonus object matching RunBonuses.global shape.
   */
  getGlobalBonuses(): RunBonuses['global'] {
    const result: RunBonuses['global'] = {
      towerHpMultiplier: 1.0,
      towerRegenPerSec: 0,
      startingCurrencyBonus: 0,
      waveIncomeMultiplier: 1.0,
      xpMultiplier: 1.0,
      sellRefundBonus: 0,
    };

    if (!this.config) return result;

    /* Map from appliesTo key to the result field and accumulation strategy. */
    for (const upgradeDef of this.config.globalUpgrades) {
      const tier = this.profile.globalUpgrades[upgradeDef.id] ?? 0;
      if (tier === 0) continue;

      /* Sum bonuses from tier 1 through current tier. */
      let totalBonus = 0;
      for (let i = 0; i < tier; i++) {
        totalBonus += upgradeDef.bonusPerTier[i] ?? 0;
      }

      this.applyGlobalBonus(result, upgradeDef, totalBonus);
    }

    return result;
  }

  /**
   * Applies a single global upgrade's cumulative bonus to the result object.
   * Percentage bonuses become multipliers (1.0 + bonus), flat bonuses add directly.
   *
   * @param result - The RunBonuses.global object being built.
   * @param upgradeDef - The global upgrade definition.
   * @param totalBonus - The cumulative bonus value.
   */
  private applyGlobalBonus(
    result: RunBonuses['global'],
    upgradeDef: GlobalUpgradeDefinition,
    totalBonus: number,
  ): void {
    switch (upgradeDef.appliesTo) {
      case 'towerHp':
        result.towerHpMultiplier = 1.0 + totalBonus;
        break;
      case 'towerRegen':
        result.towerRegenPerSec = totalBonus;
        break;
      case 'startCurrency':
        result.startingCurrencyBonus = totalBonus;
        break;
      case 'waveIncome':
        result.waveIncomeMultiplier = 1.0 + totalBonus;
        break;
      case 'xpBoost':
        result.xpMultiplier = 1.0 + totalBonus;
        break;
      case 'sellRefund':
        result.sellRefundBonus = totalBonus;
        break;
    }
  }

  /**
   * Computes the full RunBonuses object from the current profile.
   * This is called at run start and stored on the Phaser registry.
   *
   * @returns Complete RunBonuses with per-tower and global bonuses.
   */
  computeRunBonuses(): RunBonuses {
    const towerMultipliers: RunBonuses['towerMultipliers'] = {};
    const towerCapstones: RunBonuses['towerCapstones'] = {};

    for (const towerId of TOWER_IDS) {
      towerMultipliers[towerId] = this.getTowerStatMultipliers(towerId);

      /* Collect active capstone effect keys for this tower. */
      const activeCapstones: string[] = [];
      if (this.config) {
        for (const capstone of this.config.capstones) {
          if (capstone.towerId !== towerId) continue;
          const towerState = this.getTowerState(towerId);
          if (!towerState) continue;
          const key = capstone.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
          if (towerState[key]) {
            activeCapstones.push(capstone.effectKey);
          }
        }
      }
      towerCapstones[towerId] = activeCapstones;
    }

    return {
      towerMultipliers,
      towerCapstones,
      global: this.getGlobalBonuses(),
    };
  }

  // -------------------------------------------------------------------------
  // XP Application
  // -------------------------------------------------------------------------

  /**
   * Applies XP from a completed run. Applies XP boost multiplier from
   * global upgrades, then adds to totalXpEarned.
   *
   * @param runData - End-of-run statistics for XP calculation.
   * @returns XP result with balance information.
   */
  applyRunXP(runData: XPRunData): XPResult {
    const baseXp = calculateRunXP(runData);

    /* Apply XP boost from global upgrades. */
    const globalBonuses = this.getGlobalBonuses();
    const boostedXp = Math.floor(baseXp * globalBonuses.xpMultiplier);

    this.profile.totalXpEarned += boostedXp;
    this.saveProfile();

    return {
      baseXpGained: baseXp,
      xpGained: boostedXp,
      totalXpEarned: this.profile.totalXpEarned,
      availableXp: this.getAvailableXp(),
    };
  }

  // -------------------------------------------------------------------------
  // Profile Access
  // -------------------------------------------------------------------------

  /**
   * Returns a deep copy of the current skill tree profile.
   * Used for serialization, debugging, and UI display.
   *
   * @returns Copy of the skill tree profile.
   */
  getProfile(): SkillTreeProfile {
    return JSON.parse(JSON.stringify(this.profile)) as SkillTreeProfile;
  }

  /**
   * Returns the tower upgrade state for a tower, or undefined if none exists.
   *
   * @param towerId - Tower ID.
   * @returns Tower upgrade state or undefined.
   */
  getTowerState(towerId: string): TowerUpgradeState | undefined {
    return this.profile.towerUpgrades[towerId];
  }

  /**
   * Returns whether localStorage persistence is available.
   *
   * @returns true if localStorage works.
   */
  isStorageAvailable(): boolean {
    return this.storageAvailable;
  }

  /**
   * Resets all skill tree progression. Clears all upgrades and XP.
   * Used for testing or player-initiated reset.
   */
  resetProgress(): void {
    this.profile = SkillTreeManager.createDefaultProfile();
    this.saveProfile();
  }

  // -------------------------------------------------------------------------
  // Migration from old level system (BOLT-021 -> BOLT-023)
  // -------------------------------------------------------------------------

  /**
   * Detects the old BOLT-021 profile format in localStorage and migrates
   * to the new SkillTreeProfile format. Migration rules:
   * - totalXpEarned = old totalXP (preserving all earned XP)
   * - totalXpSpent = 0 (player gets to re-spend everything)
   * - All upgrade nodes start at 0 (unpurchased)
   * - Old key is deleted after successful migration
   *
   * This runs once per player; subsequent loads find the new key.
   */
  private migrateFromOldProfile(): void {
    if (!this.storageAvailable) return;

    try {
      /* Only migrate if the old key exists AND the new key does not. */
      const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
      const newRaw = localStorage.getItem(STORAGE_KEY);
      if (!oldRaw || newRaw) return;

      const oldProfile = JSON.parse(oldRaw) as { totalXP?: number };
      const oldTotalXP = typeof oldProfile.totalXP === 'number'
        ? Math.max(0, oldProfile.totalXP)
        : 0;

      /* Create new profile with old XP as the earned balance. */
      const newProfile = SkillTreeManager.createDefaultProfile();
      newProfile.totalXpEarned = oldTotalXP;

      /* Persist the new profile. */
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));

      /* Delete the old key to prevent re-migration. */
      localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      /* Migration failed -- the new profile will be created fresh on load.
       * Old data is left intact for potential manual recovery. */
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Loads the skill tree profile from localStorage.
   * Falls back to a default profile on missing, corrupt, or unavailable storage.
   *
   * @returns The loaded or default skill tree profile.
   */
  private loadProfile(): SkillTreeProfile {
    if (!this.storageAvailable) {
      return SkillTreeManager.createDefaultProfile();
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return SkillTreeManager.createDefaultProfile();
      }

      const parsed = JSON.parse(raw) as Partial<SkillTreeProfile>;

      /* Validate top-level fields. */
      if (
        typeof parsed.totalXpEarned !== 'number' ||
        typeof parsed.totalXpSpent !== 'number' ||
        typeof parsed.towerUpgrades !== 'object' ||
        typeof parsed.globalUpgrades !== 'object' ||
        parsed.towerUpgrades === null ||
        parsed.globalUpgrades === null
      ) {
        return SkillTreeManager.createDefaultProfile();
      }

      return {
        totalXpEarned: Math.max(0, parsed.totalXpEarned),
        totalXpSpent: Math.max(0, parsed.totalXpSpent),
        towerUpgrades: this.sanitizeTowerUpgrades(parsed.towerUpgrades),
        globalUpgrades: this.sanitizeGlobalUpgrades(parsed.globalUpgrades),
      };
    } catch {
      /* Corrupt JSON -- start fresh. */
      return SkillTreeManager.createDefaultProfile();
    }
  }

  /**
   * Sanitizes tower upgrade data from stored profile.
   * Clamps stat values to valid range and ensures boolean capstones.
   *
   * @param raw - Raw tower upgrades object from localStorage.
   * @returns Sanitized tower upgrades record.
   */
  private sanitizeTowerUpgrades(
    raw: Record<string, Partial<TowerUpgradeState>>,
  ): Record<string, TowerUpgradeState> {
    const result: Record<string, TowerUpgradeState> = {};
    for (const [towerId, state] of Object.entries(raw)) {
      if (typeof state !== 'object' || state === null) continue;
      result[towerId] = {
        damage: this.clampStatTier(state.damage),
        fireRate: this.clampStatTier(state.fireRate),
        range: this.clampStatTier(state.range),
        upgradeDiscount: this.clampStatTier(state.upgradeDiscount),
        midCapstone: state.midCapstone === true,
        masteryCapstone: state.masteryCapstone === true,
      };
    }
    return result;
  }

  /**
   * Sanitizes global upgrade data from stored profile.
   * Clamps tier values to valid range.
   *
   * @param raw - Raw global upgrades object from localStorage.
   * @returns Sanitized global upgrades record.
   */
  private sanitizeGlobalUpgrades(
    raw: Record<string, unknown>,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [id, tier] of Object.entries(raw)) {
      if (typeof tier === 'number') {
        result[id] = Math.min(MAX_GLOBAL_TIER, Math.max(0, Math.floor(tier)));
      }
    }
    return result;
  }

  /**
   * Clamps a stat tier value to the valid range [0, MAX_STAT_TIER].
   *
   * @param value - Raw stat tier from storage.
   * @returns Clamped integer value.
   */
  private clampStatTier(value: unknown): number {
    if (typeof value !== 'number') return 0;
    return Math.min(MAX_STAT_TIER, Math.max(0, Math.floor(value)));
  }

  /**
   * Persists the current profile to localStorage.
   * Silently fails if localStorage is unavailable.
   */
  private saveProfile(): void {
    if (!this.storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      /* Storage full or unavailable -- degrade gracefully. */
    }
  }

  /**
   * Returns or creates a tower upgrade state for the given tower ID.
   * If the tower has no entry yet, creates a default (all zeros) entry.
   *
   * @param towerId - Tower ID.
   * @returns The tower upgrade state (mutable reference).
   */
  private getOrCreateTowerState(towerId: string): TowerUpgradeState {
    if (!this.profile.towerUpgrades[towerId]) {
      this.profile.towerUpgrades[towerId] = SkillTreeManager.createDefaultTowerState();
    }
    return this.profile.towerUpgrades[towerId]!;
  }

  // -------------------------------------------------------------------------
  // Static Helpers
  // -------------------------------------------------------------------------

  /**
   * Checks whether localStorage is available and writable.
   *
   * @returns true if localStorage works.
   */
  private static checkStorageAvailable(): boolean {
    try {
      const testKey = '__td_skill_tree_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a fresh skill tree profile with no upgrades purchased.
   *
   * @returns Default skill tree profile.
   */
  static createDefaultProfile(): SkillTreeProfile {
    return {
      totalXpEarned: 0,
      totalXpSpent: 0,
      towerUpgrades: {},
      globalUpgrades: {},
    };
  }

  /**
   * Creates a default tower upgrade state (all stats at 0, no capstones).
   *
   * @returns Default tower upgrade state.
   */
  static createDefaultTowerState(): TowerUpgradeState {
    return {
      damage: 0,
      fireRate: 0,
      range: 0,
      upgradeDiscount: 0,
      midCapstone: false,
      masteryCapstone: false,
    };
  }
}

// Export constants for testing
export {
  STORAGE_KEY,
  OLD_STORAGE_KEY,
  MAX_STAT_TIER,
  MAX_GLOBAL_TIER,
  TOWER_IDS,
  STAT_NAMES,
  XP_PER_KILL,
  XP_PER_WAVE,
  XP_PER_BOSS_KILL,
};
