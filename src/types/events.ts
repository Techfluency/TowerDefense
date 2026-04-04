/**
 * Event payload interfaces for cross-system communication.
 *
 * Every event emitted via scene.events has a typed payload defined here.
 * Systems that emit or listen to events import these interfaces to ensure
 * type-safe contracts. Event name constants live in game-types.ts (GAME_EVENTS).
 *
 * When adding a new event:
 * 1. Define the payload interface here.
 * 2. Add the event constant to GAME_EVENTS in game-types.ts.
 * 3. Document which bolt emits and which bolts listen.
 */

// ---------------------------------------------------------------------------
// Enemy Events
// ---------------------------------------------------------------------------

/**
 * Payload for ENEMY_DIED event.
 * Emitted by BOLT-003 (Enemy System) when an enemy's HP reaches zero.
 * Listened by BOLT-004 (wave tracking), BOLT-008 (currency reward), BOLT-009 (HUD).
 */
export interface EnemyDiedPayload {
  /** Unique instance ID of the killed enemy (not the type key). */
  enemyId: string;
  /** References EnemyDefinition.id (e.g., "runner"). */
  enemyType: string;
  /** World-space pixel coordinates where the enemy died. */
  position: { x: number; y: number };
  /** Currency reward for the kill. */
  reward: number;
  /** Score reward for the kill. */
  scoreReward: number;
}

/**
 * Payload for ENEMY_REACHED_OBJECTIVE event.
 * Emitted by BOLT-003 when an enemy reaches the end of the path.
 * Listened by BOLT-009 (objective HP display).
 */
export interface EnemyReachedObjectivePayload {
  /** Instance ID of the enemy that reached the objective. */
  enemyId: string;
  /** References EnemyDefinition.id. */
  enemyType: string;
  /** Damage dealt to the objective (from EnemyDefinition.breakthroughDamage). */
  damage: number;
}

/**
 * Payload for ENEMY_SPAWNED event.
 * Emitted by BOLT-003 (Enemy System) when a new enemy is spawned on the field.
 * Listened by BOLT-004 (Wave System) for wave enemy count tracking.
 */
export interface EnemySpawnedPayload {
  /** Unique instance ID of the spawned enemy (e.g., "enemy-42"). */
  enemyId: string;
  /** References EnemyDefinition.id (e.g., "runner"). */
  enemyType: string;
  /** World-space pixel coordinates where the enemy spawned. */
  position: { x: number; y: number };
  /** The wave number this enemy belongs to. */
  waveNumber: number;
}

/**
 * Payload for ENEMY_DAMAGED event.
 * Emitted by BOLT-006 (Tower Combat) when a projectile hits an enemy.
 * Listened by BOLT-003 (HP update).
 */
export interface EnemyDamagedPayload {
  /** Instance ID of the damaged enemy. */
  enemyId: string;
  /** Damage dealt after armor reduction. */
  damage: number;
  /** HP remaining after damage. */
  remainingHp: number;
  /** ID of the tower type that dealt the damage. */
  sourceType: string;
}

/**
 * Payload for ENEMY_SHIELD_BROKEN event.
 * Emitted by BOLT-017 (Enemy System) when a shielded enemy's shield HP reaches zero.
 * Listened by VFX hooks (shield break burst), potentially BOLT-021 (scoring milestones).
 */
export interface EnemyShieldBrokenPayload {
  /** Instance ID of the enemy whose shield broke. */
  enemyId: string;
  /** References EnemyDefinition.id (always "shielded" for now). */
  enemyType: string;
  /** World-space pixel coordinates where the shield broke. */
  position: { x: number; y: number };
}

/**
 * Payload for ENEMY_SHIELD_REGENERATED event.
 * Emitted by BOLT-017 (Enemy System) when a shielded enemy's shield finishes regenerating.
 * Listened by VFX hooks (shield reappear effect).
 */
export interface EnemyShieldRegeneratedPayload {
  /** Instance ID of the enemy whose shield regenerated. */
  enemyId: string;
  /** References EnemyDefinition.id. */
  enemyType: string;
  /** World-space pixel coordinates where the shield regenerated. */
  position: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Wave Events
// ---------------------------------------------------------------------------

/**
 * Payload for WAVE_STARTED event.
 * Emitted by BOLT-004 (Wave System) when PREP->ACTIVE transition occurs.
 * Listened by BOLT-009 (HUD wave counter, composition preview, boss indicator).
 */
export interface WaveStartedPayload {
  /** The wave number starting (1-indexed). */
  waveNumber: number;
  /** Total waves in the run (20 for stage mode). */
  totalWaves: number;
  /** Whether this is flagged as a boss/elite wave. */
  isBossWave: boolean;
  /** Whether the player triggered early start to skip the prep countdown. */
  earlyStart: boolean;
  /** Composition summary for the NEXT wave (N+1), or empty array if final wave. */
  upcomingComposition: CompositionSummaryEntry[];
}

/**
 * Payload for WAVE_COMPLETED event.
 * Emitted by BOLT-004 when all enemies in a wave have died or broken through.
 * Listened by BOLT-008 (wave bonus currency based on earlyStart flag), BOLT-009 (HUD).
 */
export interface WaveCompletedPayload {
  /** The wave number that just completed (1-indexed). */
  waveNumber: number;
  /** Total waves in the run (20 for stage mode). */
  totalWaves: number;
  /** Whether this wave was started early by the player. */
  earlyStart: boolean;
  /** Game time in milliseconds when the wave completed. */
  timestamp: number;
}

/**
 * Payload for ALL_WAVES_COMPLETED event.
 * Emitted by BOLT-004 when all waves (including the final wave) are completed.
 * Listened by BOLT-009 (victory screen trigger).
 */
export interface AllWavesCompletedPayload {
  /** Total waves completed (20 for stage mode). */
  totalWaves: number;
  /** Game time in milliseconds when all waves completed. */
  timestamp: number;
}

/**
 * Composition summary entry for wave preview data.
 * Used in WAVE_STARTED payload and WaveSystem.getUpcomingComposition().
 * Groups with the same enemyId are merged, ordered by first appearance.
 */
export interface CompositionSummaryEntry {
  /** References EnemyDefinition.id (e.g., "runner", "tank"). */
  enemyId: string;
  /** Total count of this enemy type in the wave. */
  count: number;
}

// ---------------------------------------------------------------------------
// Tower Events
// ---------------------------------------------------------------------------

/**
 * Payload for TOWER_PLACED event.
 * Emitted by BOLT-005 (Tower Placement) when a tower is placed on the grid.
 * Listened by BOLT-002 (path recalc), BOLT-008 (currency deduction).
 */
export interface TowerPlacedPayload {
  /** Unique instance ID of the placed tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** Grid column of placement. */
  col: number;
  /** Grid row of placement. */
  row: number;
}

/**
 * Payload for TOWER_REMOVED event.
 * Emitted by BOLT-005 when a tower is sold/removed.
 * Listened by BOLT-002 (path recalc), BOLT-008 (refund).
 */
export interface TowerRemovedPayload {
  /** Instance ID of the removed tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** Grid column. */
  col: number;
  /** Grid row. */
  row: number;
  /** Currency refunded to the player. */
  refundAmount: number;
}

/**
 * Payload for TOWER_UPGRADED event.
 * Emitted by BOLT-007 (Upgrade System) when a tower tier increases.
 * Listened by BOLT-009 (HUD notification).
 */
export interface TowerUpgradedPayload {
  /** Instance ID of the upgraded tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** The tier the tower was upgraded to. */
  newTier: number;
  /** Currency spent on the upgrade. */
  cost: number;
  /** Branch selected for Tier 4 upgrades. Undefined for Tiers 1-3. BOLT-019. */
  branch?: import('../types/game-types').TowerBranch;
}

/**
 * Payload for TOWER_BRANCH_SELECTED event.
 * Emitted by BOLT-019 (Upgrade System) when a Tier 4 specialization branch is chosen.
 * Listened by BOLT-009 (HUD notification).
 */
export interface TowerBranchSelectedPayload {
  /** Instance ID of the tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** The branch selected ('A' or 'B'). */
  branch: import('../types/game-types').TowerBranch;
  /** Display name of the branch (e.g., "Rapid Fire"). */
  branchName: string;
  /** Currency spent on the branch upgrade. */
  cost: number;
}

/**
 * Payload for TOWER_REPAIRED event.
 * Emitted by BOLT-007 (Upgrade System) when a tower's HP is restored.
 * Listened by BOLT-009 (HUD notification).
 */
export interface TowerRepairedPayload {
  /** Instance ID of the repaired tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** HP restored by the repair action. */
  hpRestored: number;
  /** Currency spent on the repair. */
  cost: number;
  /** Tower's HP after repair (should be maxHp). */
  newHp: number;
}

/**
 * Payload for TOWER_FIRED event.
 * Emitted by BOLT-006 (Tower Combat) when a tower fires a projectile.
 * Listened by VFX hooks (muzzle flash).
 */
export interface TowerFiredPayload {
  /** Instance ID of the firing tower. */
  towerId: string;
  /** References TowerDefinition.id. */
  towerType: string;
  /** Instance ID of the targeted enemy. */
  targetEnemyId: string;
  /** References ProjectileDefinition.id. */
  projectileType: string;
}

/**
 * Payload for ENEMY_HIT event.
 * Emitted by BOLT-006 when a projectile hits an enemy.
 * Listened by VFX hooks (impact effect), BOLT-003 (damage application).
 */
export interface EnemyHitPayload {
  /** Instance ID of the hit enemy. */
  enemyId: string;
  /** References ProjectileDefinition.id. */
  projectileType: string;
  /** Raw damage before armor reduction. */
  damage: number;
  /** World-space impact position. */
  position: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Economy Events
// ---------------------------------------------------------------------------

/**
 * Payload for CURRENCY_CHANGED event.
 * Emitted by BOLT-008 (Economy System) whenever currency changes.
 * Listened by BOLT-009 (HUD currency display).
 */
export interface CurrencyChangedPayload {
  /** New currency total. */
  newAmount: number;
  /** Change amount (positive = earned, negative = spent). */
  delta: number;
  /** Human-readable reason (e.g., "enemy_kill", "tower_placed", "wave_bonus"). */
  reason: string;
}

/**
 * Payload for SCORE_CHANGED event.
 * Emitted by BOLT-008 whenever score changes.
 * Listened by BOLT-009 (HUD score display).
 */
export interface ScoreChangedPayload {
  /** New score total. */
  newScore: number;
  /** Points added. */
  delta: number;
  /** Human-readable reason. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Game State Events
// ---------------------------------------------------------------------------

/**
 * Payload for GAME_PAUSED event.
 * Emitted by BOLT-009 (HUD) when the player pauses or resumes.
 * Listened by all systems (skip update when paused).
 */
export interface GamePausedPayload {
  /** True if paused, false if resumed. */
  paused: boolean;
}

/**
 * Payload for GAME_OVER event.
 * Emitted by BOLT-009 when the game ends (victory or defeat).
 * Listened by Gameplay scene (trigger scene transition).
 */
export interface GameOverPayload {
  /** True if all waves completed, false if objective destroyed. */
  victory: boolean;
  /** Final score. */
  finalScore: number;
  /** Number of waves survived. */
  wavesCompleted: number;
}

// ---------------------------------------------------------------------------
// Map Events
// ---------------------------------------------------------------------------

/**
 * Payload for MAP_READY event.
 * Emitted by BOLT-002 MapGeneratorSystem after map generation completes.
 * Listened by MapRendererSystem (tile rendering), and future
 * BOLT-003 (enemy pathing), BOLT-004 (wave spawning), BOLT-005 (placement).
 */
export interface MapReadyPayload {
  /** Number of tile columns in the generated grid. */
  cols: number;
  /** Number of tile rows in the generated grid. */
  rows: number;
  /** Number of tiles in the generated path (waypoint count). */
  pathLength: number;
  /** The seed used for this map generation. */
  seed: string;
}

// ---------------------------------------------------------------------------
// Input Events
// ---------------------------------------------------------------------------

/**
 * Payload for TILE_CLICKED event.
 * Emitted by BOLT-001 InputSystem when the player clicks a tile.
 * Listened by BOLT-005 (tower placement).
 */
export interface TileClickedPayload {
  /** Grid column clicked. */
  col: number;
  /** Grid row clicked. */
  row: number;
  /** Pixel X coordinate in world space. */
  worldX: number;
  /** Pixel Y coordinate in world space. */
  worldY: number;
}

/**
 * Payload for TILE_HOVER_CHANGED event.
 * Emitted by BOLT-001 InputSystem when the pointer crosses a tile boundary.
 * Listened by BOLT-005 (placement ghost preview).
 */
export interface TileHoverPayload {
  /** Grid column hovered. */
  col: number;
  /** Grid row hovered. */
  row: number;
  /** Pixel X coordinate. */
  worldX: number;
  /** Pixel Y coordinate. */
  worldY: number;
}

// ---------------------------------------------------------------------------
// Auto-Tile Events
// ---------------------------------------------------------------------------

/**
 * Payload for AUTO_TILE_READY event.
 * Emitted by BOLT-011 (AutoTileSystem) after the TileVariantMap is stored on
 * the Phaser registry. Listened by BOLT-012 (spawn/objective variants) and
 * BOLT-013 (MapRendererSystem variant rendering).
 */
export interface AutoTileReadyPayload {
  /** Total entries in the TileVariantMap (path + buildable + blocked tiles). */
  tileCount: number;
  /** The map seed used for variant selection (pass-through from MapData.seed). */
  seed: string;
}

// ---------------------------------------------------------------------------
// Boss Events (BOLT-018)
// ---------------------------------------------------------------------------

/**
 * Payload for BOSS_MINION_SUMMON event.
 * Emitted by BOLT-018 (BossSystem) when a boss spawns minions at an HP threshold.
 * Listened by HUD (VFX feedback), audio system (summon cue).
 */
export interface BossMinionSummonPayload {
  /** Instance ID of the boss that summoned minions. */
  bossId: string;
  /** World-space position where minions spawn. */
  position: { x: number; y: number };
  /** Number of minions summoned. */
  minionCount: number;
  /** HP threshold that triggered the summon (e.g., 0.75 or 0.50). */
  hpThreshold: number;
}

/**
 * Payload for BOSS_SPEED_SURGE event.
 * Emitted by BOLT-018 (BossSystem) when a boss activates speed surge at 25% HP.
 * Listened by HUD (VFX feedback), audio system (surge cue).
 */
export interface BossSpeedSurgePayload {
  /** Instance ID of the boss that surged. */
  bossId: string;
  /** World-space position at surge activation. */
  position: { x: number; y: number };
  /** The new speed multiplier (e.g., 2.0). */
  speedMultiplier: number;
}

/**
 * Payload for BOSS_DIED event.
 * Emitted by BOLT-018 (BossSystem) when a boss enemy dies.
 * Listened by HUD (boss HP bar removal, screen shake).
 */
export interface BossDiedPayload {
  /** Instance ID of the boss that died. */
  bossId: string;
  /** World-space position where the boss died. */
  position: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Endless Mode Events (BOLT-020)
// ---------------------------------------------------------------------------

/**
 * Payload for CAMPAIGN_COMPLETE event.
 * Emitted by BOLT-020 (WaveSystem) when all 20 scripted waves are completed
 * in endless mode. The game continues with procedural waves instead of
 * triggering victory. Listened by HUD (campaign complete banner), GameStateManager.
 */
export interface CampaignCompletePayload {
  /** Total scripted waves completed (20). */
  totalScriptedWaves: number;
  /** Game time in milliseconds when the campaign completed. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Touch Gesture Events (BOLT-022)
// ---------------------------------------------------------------------------

/**
 * Payload for TOUCH_LONG_PRESS event.
 * Emitted by BOLT-022 (TouchInputSystem) after a 500ms hold on a tile.
 * Listened by UpgradeSystem (opens upgrade panel if tower at position),
 * HudSystem (shows enemy tooltip if enemy at position).
 */
export interface TouchLongPressPayload {
  /** Grid column of the long-pressed tile. */
  col: number;
  /** Grid row of the long-pressed tile. */
  row: number;
  /** World-space pixel X of the press. */
  worldX: number;
  /** World-space pixel Y of the press. */
  worldY: number;
}

/**
 * Payload for TOUCH_DOUBLE_TAP event.
 * Emitted by BOLT-022 (TouchInputSystem) on two rapid taps at the same tile.
 * Listened by TowerPlacementSystem (triggers sell on placed tower).
 */
export interface TouchDoubleTapPayload {
  /** Grid column of the double-tapped tile. */
  col: number;
  /** Grid row of the double-tapped tile. */
  row: number;
  /** World-space pixel X of the tap. */
  worldX: number;
  /** World-space pixel Y of the tap. */
  worldY: number;
}
