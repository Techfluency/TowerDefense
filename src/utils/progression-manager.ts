/**
 * Progression manager -- persistent account-level progression across runs.
 *
 * This is the single authority for player XP, account level, and unlock state.
 * All progression data is stored in localStorage under a namespaced key.
 * The manager is instantiated once at game boot and stored on the Phaser
 * registry for cross-scene access (MainMenu, GameOver, Gameplay).
 *
 * XP sources (awarded at end of run):
 * - 1 XP per enemy killed
 * - 10 XP per wave survived
 * - 50 XP per boss killed
 *
 * XP curve: 100 * level XP per level (Lv1=100, Lv2=200, etc.)
 * Total XP to max level 10: 5500
 *
 * BOLT-021: Meta Progression.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Player profile persisted in localStorage.
 * Schema version enables future migrations without data loss.
 */
export interface PlayerProfile {
  /** Schema version for forward compatibility. */
  version: number;
  /** Total accumulated XP across all runs. */
  totalXP: number;
  /** IDs of rewards that have been unlocked. */
  unlockedItems: string[];
}

/**
 * A single entry in the unlock table. Each level grants one reward.
 * Reward types control how the unlock affects gameplay.
 */
export interface UnlockEntry {
  /** Unique stable identifier for this unlock (e.g., "tower_sniper"). */
  id: string;
  /** Player level at which this reward unlocks. */
  level: number;
  /** Reward category for downstream systems to dispatch on. */
  type: 'tower' | 'currency_bonus' | 'feature' | 'display';
  /** Human-readable name shown in level-up notifications. */
  name: string;
  /** Description for the progression dashboard. */
  description: string;
  /**
   * Type-specific value. Interpretation depends on `type`:
   * - tower: TowerDefinition.id (e.g., "focused")
   * - currency_bonus: bonus amount as number string (e.g., "25")
   * - feature: feature key (e.g., "speed_3x", "tier4_branches")
   * - display: display key (e.g., "endless_highscore")
   */
  value: string;
}

/**
 * Run results used to calculate XP gained from a single run.
 * Assembled from GameOverData at end of run.
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
 * Used by the GameOver scene to display XP gain and level-up info.
 */
export interface XPResult {
  /** XP gained from this run. */
  xpGained: number;
  /** Player level before this run's XP was applied. */
  previousLevel: number;
  /** Player level after this run's XP was applied. */
  newLevel: number;
  /** Total XP after this run. */
  totalXP: number;
  /** XP needed for the next level (from current level floor). */
  xpToNextLevel: number;
  /** XP progress within the current level (0 to xpToNextLevel). */
  xpInCurrentLevel: number;
  /** Items newly unlocked by this run's level-ups. */
  newUnlocks: UnlockEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the player profile. Namespaced to avoid collisions. */
const STORAGE_KEY = 'rgtd_player_profile';

/** Current schema version. Increment when profile shape changes. */
const SCHEMA_VERSION = 1;

/** Maximum player level. XP beyond this still accumulates but grants no new rewards. */
const MAX_LEVEL = 10;

// XP award rates per end-of-run stat
/** XP awarded per enemy killed. */
const XP_PER_KILL = 1;
/** XP awarded per wave survived. */
const XP_PER_WAVE = 10;
/** XP awarded per boss killed. */
const XP_PER_BOSS_KILL = 50;

// ---------------------------------------------------------------------------
// Unlock table -- data-driven reward definitions
// ---------------------------------------------------------------------------

/**
 * The unlock table maps player levels to rewards. Stable IDs ensure
 * returning players keep their unlocks even if the table is reordered.
 *
 * Lv1: Arrow Tower is the default (no unlock needed, always available).
 * Lv2-10: One unlock per level.
 */
const UNLOCK_TABLE: UnlockEntry[] = [
  {
    id: 'tower_arrow',
    level: 1,
    type: 'tower',
    name: 'Arrow Tower',
    description: 'Basic ranged tower. Available from the start.',
    value: 'ranged',
  },
  {
    id: 'tower_sniper',
    level: 1,
    type: 'tower',
    name: 'Sniper Tower',
    description: 'High damage, slow fire rate. Best against armored targets.',
    value: 'focused',
  },
  {
    id: 'tower_shockwave',
    level: 1,
    type: 'tower',
    name: 'Shockwave Tower',
    description: 'Damages all enemies in range. Short range, area effect.',
    value: 'broadcast',
  },
  {
    id: 'tower_aa_missile',
    level: 1,
    type: 'tower',
    name: 'AA Missile Tower',
    description: 'Targets flying enemies. Essential for air defense.',
    value: 'antiair',
  },
  {
    id: 'currency_bonus_25',
    level: 5,
    type: 'currency_bonus',
    name: '+25 Starting Currency',
    description: 'Start each run with 25 extra currency.',
    value: '25',
  },
  {
    id: 'tier4_branches',
    level: 6,
    type: 'feature',
    name: 'Tier 4 Branches',
    description: 'Unlocks Tier 4 specialization branches for all towers.',
    value: 'tier4_branches',
  },
  {
    id: 'speed_3x',
    level: 7,
    type: 'feature',
    name: '3x Speed Toggle',
    description: 'Adds a 3x speed option to the speed toggle button.',
    value: 'speed_3x',
  },
  {
    id: 'currency_bonus_50',
    level: 8,
    type: 'currency_bonus',
    name: '+50 Starting Currency',
    description: 'Start each run with 50 extra currency. Stacks with Lv5 bonus.',
    value: '50',
  },
  {
    id: 'bonus_tower_slot',
    level: 9,
    type: 'feature',
    name: 'Extra Tower Slot',
    description: 'Place one additional tower beyond the normal limit.',
    value: 'bonus_tower_slot',
  },
  {
    id: 'endless_highscore',
    level: 10,
    type: 'display',
    name: 'Endless High Score',
    description: 'Displays your endless mode high score on the main menu.',
    value: 'endless_highscore',
  },
];

// ---------------------------------------------------------------------------
// XP Curve Functions (pure, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Calculates the XP required to advance from a given level to the next.
 * Formula: 100 * level. Level 1 needs 100 XP, level 2 needs 200 XP, etc.
 *
 * @param level - The level to calculate XP cost for (1-indexed).
 * @returns XP required to advance past this level.
 */
export function xpRequiredForLevel(level: number): number {
  if (level < 1) return 0;
  return 100 * level;
}

/**
 * Calculates the total cumulative XP needed to reach a given level.
 * Sum of xpRequiredForLevel(1) through xpRequiredForLevel(level).
 * This is the XP "floor" for that level.
 *
 * @param level - Target level (1-indexed). Level 1 floor = 0 (start there).
 * @returns Total XP needed to reach this level.
 */
export function totalXPForLevel(level: number): number {
  if (level <= 1) return 0;
  /* Sum of 100*1 + 100*2 + ... + 100*(level-1) = 100 * (level-1)*level/2 */
  return 100 * ((level - 1) * level) / 2;
}

/**
 * Derives the player level from total accumulated XP.
 * Iterates levels until the next level's floor exceeds totalXP.
 *
 * @param totalXP - Total accumulated XP.
 * @returns Current player level (1 to MAX_LEVEL).
 */
export function levelFromXP(totalXP: number): number {
  if (totalXP < 0) return 1;
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    if (totalXP < totalXPForLevel(lvl + 1)) {
      return lvl;
    }
  }
  return MAX_LEVEL;
}

/**
 * Calculates XP earned from a single run.
 * XP is awarded even on defeat (proportional to progress).
 *
 * @param runData - End-of-run statistics.
 * @returns Total XP earned from this run.
 */
export function calculateRunXP(runData: XPRunData): number {
  const killXP = runData.totalKills * XP_PER_KILL;
  const waveXP = runData.wavesSurvived * XP_PER_WAVE;
  const bossXP = runData.bossKills * XP_PER_BOSS_KILL;
  return killXP + waveXP + bossXP;
}

// ---------------------------------------------------------------------------
// ProgressionManager
// ---------------------------------------------------------------------------

export class ProgressionManager {
  /** In-memory player profile. Loaded from localStorage on construction. */
  private profile: PlayerProfile;

  /** Whether localStorage is available. If false, progression is session-only. */
  private storageAvailable: boolean;

  /**
   * Creates the progression manager. Loads the player profile from
   * localStorage, or creates a fresh profile if none exists or data is corrupt.
   */
  constructor() {
    this.storageAvailable = ProgressionManager.checkStorageAvailable();
    this.profile = this.loadProfile();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the current player level derived from total XP.
   *
   * @returns Player level (1 to MAX_LEVEL).
   */
  getLevel(): number {
    return levelFromXP(this.profile.totalXP);
  }

  /**
   * Returns the total accumulated XP across all runs.
   *
   * @returns Total XP.
   */
  getTotalXP(): number {
    return this.profile.totalXP;
  }

  /**
   * Returns the XP required to advance from the current level to the next.
   *
   * @returns XP needed for next level, or 0 if at max level.
   */
  getXPToNextLevel(): number {
    const level = this.getLevel();
    if (level >= MAX_LEVEL) return 0;
    return xpRequiredForLevel(level);
  }

  /**
   * Returns the XP progress within the current level.
   * This is totalXP minus the floor XP for the current level.
   *
   * @returns XP accumulated toward the next level.
   */
  getXPInCurrentLevel(): number {
    const level = this.getLevel();
    return this.profile.totalXP - totalXPForLevel(level);
  }

  /**
   * Returns the fraction (0-1) of progress toward the next level.
   * Returns 1.0 if at max level.
   *
   * @returns Progress fraction.
   */
  getProgressFraction(): number {
    const level = this.getLevel();
    if (level >= MAX_LEVEL) return 1;
    const needed = xpRequiredForLevel(level);
    if (needed <= 0) return 1;
    return this.getXPInCurrentLevel() / needed;
  }

  /**
   * Returns the full unlock table for UI display (progression dashboard).
   *
   * @returns All unlock entries.
   */
  getUnlockTable(): UnlockEntry[] {
    return [...UNLOCK_TABLE];
  }

  /**
   * Returns all unlocked entries based on current player level.
   *
   * @returns Array of unlocked entries.
   */
  getUnlockedEntries(): UnlockEntry[] {
    const level = this.getLevel();
    return UNLOCK_TABLE.filter(entry => entry.level <= level);
  }

  /**
   * Checks whether a specific unlock is available to the player.
   *
   * @param unlockId - The stable unlock ID (e.g., "tower_sniper").
   * @returns true if the player's level is sufficient.
   */
  isUnlocked(unlockId: string): boolean {
    const level = this.getLevel();
    const entry = UNLOCK_TABLE.find(e => e.id === unlockId);
    if (!entry) return false;
    return entry.level <= level;
  }

  /**
   * Checks whether a tower type is unlocked by the player's progression level.
   * Tower unlocks are entries with type='tower' and value matching the tower ID.
   *
   * @param towerId - TowerDefinition.id (e.g., "ranged", "focused").
   * @returns true if the player's level is sufficient to use this tower.
   */
  isTowerUnlocked(towerId: string): boolean {
    const level = this.getLevel();
    const entry = UNLOCK_TABLE.find(
      e => e.type === 'tower' && e.value === towerId,
    );
    /* Towers not in the unlock table are assumed unlocked (future-proofing). */
    if (!entry) return true;
    return entry.level <= level;
  }

  /**
   * Returns the total starting currency bonus from all unlocked currency bonuses.
   * Lv5 grants +25, Lv8 grants +50. These stack.
   *
   * @returns Total bonus currency to add at run start.
   */
  getStartingCurrencyBonus(): number {
    const level = this.getLevel();
    let bonus = 0;
    for (const entry of UNLOCK_TABLE) {
      if (entry.type === 'currency_bonus' && entry.level <= level) {
        bonus += parseInt(entry.value, 10);
      }
    }
    return bonus;
  }

  /**
   * Checks whether a feature unlock is active.
   *
   * @param featureKey - Feature key (e.g., "speed_3x", "tier4_branches").
   * @returns true if the player has unlocked this feature.
   */
  isFeatureUnlocked(featureKey: string): boolean {
    const level = this.getLevel();
    const entry = UNLOCK_TABLE.find(
      e => e.type === 'feature' && e.value === featureKey,
    );
    if (!entry) return false;
    return entry.level <= level;
  }

  /**
   * Applies XP from a completed run. Calculates XP, updates the profile,
   * persists to localStorage, and returns the result for UI display.
   *
   * @param runData - End-of-run statistics for XP calculation.
   * @returns XP result with level change info and new unlocks.
   */
  applyRunXP(runData: XPRunData): XPResult {
    const xpGained = calculateRunXP(runData);
    const previousLevel = this.getLevel();

    /* Apply XP to profile. */
    this.profile.totalXP += xpGained;

    const newLevel = this.getLevel();

    /* Determine newly unlocked items from this run's level-ups. */
    const newUnlocks = UNLOCK_TABLE.filter(
      entry => entry.level > previousLevel && entry.level <= newLevel,
    );

    /* Update the unlockedItems list in the profile. */
    for (const unlock of newUnlocks) {
      if (!this.profile.unlockedItems.includes(unlock.id)) {
        this.profile.unlockedItems.push(unlock.id);
      }
    }

    /* Persist to localStorage. */
    this.saveProfile();

    return {
      xpGained,
      previousLevel,
      newLevel,
      totalXP: this.profile.totalXP,
      xpToNextLevel: newLevel >= MAX_LEVEL ? 0 : xpRequiredForLevel(newLevel),
      xpInCurrentLevel: this.profile.totalXP - totalXPForLevel(newLevel),
      newUnlocks,
    };
  }

  /**
   * Returns whether localStorage persistence is available.
   * When false, progression works in-memory only (private browsing).
   *
   * @returns true if localStorage is available.
   */
  isStorageAvailable(): boolean {
    return this.storageAvailable;
  }

  /**
   * Resets all progression data. Used for testing or player-initiated reset.
   * Clears localStorage and resets the in-memory profile.
   */
  resetProgress(): void {
    this.profile = ProgressionManager.createDefaultProfile();
    this.saveProfile();
  }

  /**
   * Returns a read-only snapshot of the current player profile.
   * Used for serialization and debugging.
   *
   * @returns Copy of the player profile.
   */
  getProfile(): PlayerProfile {
    return { ...this.profile, unlockedItems: [...this.profile.unlockedItems] };
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Loads the player profile from localStorage.
   * Falls back to a default profile on missing, corrupt, or unavailable storage.
   *
   * @returns The loaded or default player profile.
   */
  private loadProfile(): PlayerProfile {
    if (!this.storageAvailable) {
      return ProgressionManager.createDefaultProfile();
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return ProgressionManager.createDefaultProfile();
      }

      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;

      /* Validate required fields and types. */
      if (
        typeof parsed.version !== 'number' ||
        typeof parsed.totalXP !== 'number' ||
        !Array.isArray(parsed.unlockedItems)
      ) {
        return ProgressionManager.createDefaultProfile();
      }

      /* Future: handle schema migrations here based on parsed.version. */

      return {
        version: SCHEMA_VERSION,
        totalXP: Math.max(0, parsed.totalXP),
        unlockedItems: parsed.unlockedItems.filter(
          item => typeof item === 'string',
        ),
      };
    } catch {
      /* Corrupt JSON -- start fresh. */
      return ProgressionManager.createDefaultProfile();
    }
  }

  /**
   * Persists the current profile to localStorage.
   * Silently fails if localStorage is unavailable (private browsing).
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
   * Checks whether localStorage is available and writable.
   * Uses the try/set/remove pattern recommended by MDN.
   *
   * @returns true if localStorage works.
   */
  private static checkStorageAvailable(): boolean {
    try {
      const testKey = '__rgtd_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a fresh player profile with default values.
   * Level 1 is implicit (Arrow Tower unlocked by default).
   *
   * @returns Default player profile.
   */
  static createDefaultProfile(): PlayerProfile {
    return {
      version: SCHEMA_VERSION,
      totalXP: 0,
      unlockedItems: ['tower_arrow'],
    };
  }
}

// Export constants for testing
export { MAX_LEVEL, XP_PER_KILL, XP_PER_WAVE, XP_PER_BOSS_KILL, STORAGE_KEY, UNLOCK_TABLE };
