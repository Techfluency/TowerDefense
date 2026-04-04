/**
 * Wave system -- manages wave progression, enemy spawning, and game pacing.
 *
 * Responsibilities:
 * - 4-state machine: IDLE -> PREP -> ACTIVE -> COMPLETE (cycle)
 * - Preparation countdown timer between waves (early start supported)
 * - Spawn queue processing: reads wave composition from waves.json,
 *   calls EnemySystem.spawnEnemy() at configured intervals
 * - Wave completion detection via event counting (ENEMY_DIED + ENEMY_REACHED_OBJECTIVE)
 * - Event emission: WAVE_STARTED, WAVE_COMPLETED, ALL_WAVES_COMPLETED
 * - Loss-condition handling: halts on GAME_OVER event
 * - Public API for HUD queries (BOLT-009): wave number, state, prep time, composition
 *
 * Downstream consumers:
 * - BOLT-008 listens for WAVE_COMPLETED (earlyStart flag for bonus)
 * - BOLT-009 listens for WAVE_STARTED, WAVE_COMPLETED, ALL_WAVES_COMPLETED
 * - BOLT-009 reads state via registry 'waveSystem' (getPrepTimeRemaining, etc.)
 */
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, WaveDefinition, WaveGroup } from '../types/game-types';
import type {
  WaveStartedPayload,
  WaveCompletedPayload,
  AllWavesCompletedPayload,
  CampaignCompletePayload,
  CompositionSummaryEntry,
  GameOverPayload,
} from '../types/events';
import type { ConfigManager } from '../utils/config-manager';
import type { EnemySystem } from './enemy-system';
import { generateEndlessWave as generateEndlessWaveDef } from './endless-wave-generator';
import type { EndlessConfig } from '../types/game-types';
import type Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Wave State Enum
// ---------------------------------------------------------------------------

/**
 * The four states of the wave state machine.
 * IDLE is both the initial state (before MAP_READY) and the terminal state
 * (after ALL_WAVES_COMPLETED or GAME_OVER).
 */
export enum WaveState {
  /** Before first wave or after game over/victory. No activity. */
  IDLE = 'IDLE',
  /** Countdown timer active between waves. Player can place towers. */
  PREP = 'PREP',
  /** Enemies spawning from the queue. Wave in progress. */
  ACTIVE = 'ACTIVE',
  /** All enemies resolved. Transitional before next PREP or victory. */
  COMPLETE = 'COMPLETE',
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/**
 * Runtime state for a single spawn group within a wave.
 * Created when a wave transitions from PREP to ACTIVE.
 */
interface ActiveGroup {
  /** Enemy archetype ID to spawn. */
  readonly enemyId: string;
  /** Total enemies in this group. */
  readonly totalCount: number;
  /** Milliseconds between spawns within this group. */
  readonly spawnIntervalMs: number;
  /** Milliseconds to wait before this group starts (relative to wave start). */
  readonly delayMs: number;
  /** Enemies remaining to spawn in this group. */
  remaining: number;
  /** Accumulator for spawn timing (milliseconds). */
  spawnAccumulator: number;
  /** Whether this group has started spawning (delayMs has elapsed). */
  activated: boolean;
}

// ---------------------------------------------------------------------------
// WaveSystem
// ---------------------------------------------------------------------------

export class WaveSystem extends BaseSystem {
  /** Config access for wave definitions. */
  private readonly configManager: ConfigManager;

  /** All wave definitions from waves.json, read once on init. */
  private waveDefinitions: WaveDefinition[] = [];

  /** Current state machine state. */
  private currentState: WaveState = WaveState.IDLE;

  /** Current wave index (0-based into waveDefinitions). */
  private waveIndex = -1;

  /** Whether this wave was triggered via early start. */
  private earlyStartFlag = false;

  /** Prep countdown remaining in milliseconds. */
  private prepTimeRemainingMs = 0;

  /** Active spawn groups for the current wave. */
  private activeGroups: ActiveGroup[] = [];

  /** Elapsed time since the current wave went ACTIVE (for group delay tracking). */
  private waveElapsedMs = 0;

  /** Total enemies expected in the current wave (sum of all group counts). */
  private totalEnemiesInWave = 0;

  /** Number of enemies successfully spawned in the current wave. */
  private totalSpawned = 0;

  /** Number of enemies resolved (died + breakthrough) in the current wave. */
  private totalResolved = 0;

  /** Reference to EnemySystem, obtained from registry after MAP_READY. */
  private enemySystem: EnemySystem | null = null;

  /** Whether map is ready (MAP_READY received). */
  private mapReady = false;

  /**
   * Endless mode config, loaded from registry. Null when not in endless mode
   * or before config is loaded. BOLT-020.
   */
  private endlessConfig: EndlessConfig | null = null;

  /**
   * Whether the wave system has transitioned into endless mode.
   * True after all scripted waves complete in 'endless' gameMode. BOLT-020.
   */
  private endlessActive = false;

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Shared per-run game state.
   * @param configManager - Typed config access for wave definitions.
   */
  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    configManager: ConfigManager,
  ) {
    super(scene, gameState);
    this.configManager = configManager;
  }

  /**
   * Registers event listeners and reads wave definitions from config.
   * Called after all systems are constructed.
   */
  init(): void {
    /* Read wave definitions once from ConfigManager. */
    this.waveDefinitions = this.configManager.getWaves();

    /* Listen for map generation completion to start the first wave prep. */
    this.listen(GAME_EVENTS.MAP_READY, this.onMapReady as (...args: never[]) => void);

    /* Listen for enemy death/breakthrough to track wave completion. */
    this.listen(GAME_EVENTS.ENEMY_DIED, this.onEnemyResolved as (...args: never[]) => void);
    this.listen(
      GAME_EVENTS.ENEMY_REACHED_OBJECTIVE,
      this.onEnemyResolved as (...args: never[]) => void,
    );

    /* Listen for game over to halt all wave activity. */
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);

    /* BOLT-020: Load endless config from registry (stored by Gameplay scene). */
    this.endlessConfig = (this.scene.registry.get('endlessConfig') as EndlessConfig) ?? null;

    /* Store self on registry for BOLT-009 HUD access. */
    this.scene.registry.set('waveSystem', this);

    /* Defensive check: if mapData is already on registry (init order), treat as ready. */
    const existingMapData = this.scene.registry.get('mapData');
    if (existingMapData) {
      this.onMapReady();
    }
  }

  /**
   * Per-frame update: drives the state machine.
   * - PREP: decrements countdown timer, transitions to ACTIVE on expiry.
   * - ACTIVE: processes spawn queue, checks for wave completion.
   * - COMPLETE: emits events and transitions to next PREP or IDLE.
   * - IDLE: no-op.
   *
   * @param time - Total elapsed time in ms since game start.
   * @param delta - Milliseconds since last frame.
   */
  update(time: number, delta: number): void {
    switch (this.currentState) {
      case WaveState.IDLE:
        /* No activity in idle state. */
        break;

      case WaveState.PREP:
        this.updatePrep(delta);
        break;

      case WaveState.ACTIVE:
        this.updateActive(time, delta);
        break;

      case WaveState.COMPLETE:
        this.updateComplete(time);
        break;
    }
  }

  /**
   * Cleans up registry key and calls base destroy for listener removal.
   * Called on scene shutdown.
   */
  destroy(): void {
    this.scene.registry.remove('waveSystem');
    this.activeGroups = [];
    this.enemySystem = null;
    this.mapReady = false;
    this.endlessActive = false;
    this.endlessConfig = null;
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API (called by BOLT-009 HUD)
  // ---------------------------------------------------------------------------

  /**
   * Returns the current wave number (1-indexed).
   * Returns 0 if in IDLE before the first wave.
   */
  getCurrentWave(): number {
    if (this.waveIndex < 0) return 0;
    return this.waveIndex + 1;
  }

  /**
   * Returns the total number of waves in the run (from config).
   * BOLT-020: In endless mode, returns -1 to indicate infinite waves.
   */
  getTotalWaves(): number {
    if (this.endlessActive) return -1;
    return this.waveDefinitions.length;
  }

  /**
   * Returns the current state machine state.
   */
  getState(): WaveState {
    return this.currentState;
  }

  /**
   * Returns milliseconds remaining in the prep countdown.
   * Returns 0 if not in PREP state.
   */
  getPrepTimeRemaining(): number {
    if (this.currentState !== WaveState.PREP) return 0;
    return Math.max(0, this.prepTimeRemainingMs);
  }

  /**
   * Returns the aggregated composition summary for the NEXT wave.
   * Groups with the same enemyId are merged, ordered by first appearance.
   * Returns an empty array if there is no next wave (final wave or IDLE).
   */
  getUpcomingComposition(): CompositionSummaryEntry[] {
    /* During PREP, "upcoming" means the wave we are about to start. */
    /* During ACTIVE, "upcoming" means the next wave after the current one. */
    let targetIndex: number;

    if (this.currentState === WaveState.PREP) {
      targetIndex = this.waveIndex;
    } else if (this.currentState === WaveState.ACTIVE || this.currentState === WaveState.COMPLETE) {
      targetIndex = this.waveIndex + 1;
    } else {
      return [];
    }

    if (targetIndex < 0) {
      return [];
    }

    /* If the target index is within existing definitions, use it directly. */
    if (targetIndex < this.waveDefinitions.length) {
      return this.buildCompositionSummary(this.waveDefinitions[targetIndex]!);
    }

    /* BOLT-020: In endless mode, pre-generate the target wave for preview. */
    if (this.endlessActive && this.endlessConfig) {
      const previewDef = this.generateEndlessWave(targetIndex + 1); // 1-indexed
      return this.buildCompositionSummary(previewDef);
    }

    return [];
  }

  /**
   * Skips the prep countdown and immediately starts the next wave.
   * Only effective during PREP state -- no-op otherwise.
   * Called by BOLT-009's "Start Wave" button handler.
   */
  triggerEarlyStart(): void {
    if (this.currentState !== WaveState.PREP) return;
    this.earlyStartFlag = true;
    this.transitionToActive();
  }

  /**
   * Returns whether the wave system is currently in endless mode
   * (past the scripted campaign waves and generating procedural waves). BOLT-020.
   */
  isEndlessMode(): boolean {
    return this.endlessActive;
  }

  /**
   * Generates a procedural wave definition for endless mode. BOLT-020.
   * Uses the seeded RNG and endless config to produce deterministic waves.
   *
   * @param waveNumber - The wave number to generate (must be >= scaledWaveStart).
   * @returns A WaveDefinition for the requested wave.
   * @throws Error if endlessConfig is not loaded.
   */
  generateEndlessWave(waveNumber: number): WaveDefinition {
    if (!this.endlessConfig) {
      throw new Error('Endless mode config not loaded -- cannot generate endless wave');
    }
    return generateEndlessWaveDef(waveNumber, this.gameState.gameSeed, this.endlessConfig);
  }

  // ---------------------------------------------------------------------------
  // Private -- State Machine Updates
  // ---------------------------------------------------------------------------

  /**
   * PREP state update: decrements the countdown timer.
   * Transitions to ACTIVE when timer reaches zero.
   */
  private updatePrep(delta: number): void {
    this.prepTimeRemainingMs -= delta;

    if (this.prepTimeRemainingMs <= 0) {
      this.prepTimeRemainingMs = 0;
      this.transitionToActive();
    }
  }

  /**
   * ACTIVE state update: processes the spawn queue and checks completion.
   * Uses delta accumulators per group for pausable, retry-safe timing.
   */
  private updateActive(_time: number, delta: number): void {
    this.waveElapsedMs += delta;

    /* Process each group's spawn queue. */
    for (const group of this.activeGroups) {
      if (group.remaining <= 0) continue;

      /* Check if this group's delay has elapsed since wave start. */
      if (!group.activated) {
        if (this.waveElapsedMs >= group.delayMs) {
          group.activated = true;
          /* Reset accumulator to start spawning immediately after delay. */
          group.spawnAccumulator = group.spawnIntervalMs;
        } else {
          continue;
        }
      }

      /* Accumulate time for spawn interval. */
      group.spawnAccumulator += delta;

      /* Spawn enemies when interval is met. Process multiple if delta is large. */
      while (group.spawnAccumulator >= group.spawnIntervalMs && group.remaining > 0) {
        if (!this.enemySystem) break;

        const enemy = this.enemySystem.spawnEnemy(group.enemyId, this.waveIndex + 1);

        if (enemy === null) {
          /* Pool exhausted -- do NOT advance accumulator. Retry next frame. */
          break;
        }

        group.remaining--;
        this.totalSpawned++;
        group.spawnAccumulator -= group.spawnIntervalMs;
      }
    }

    /* Check wave completion: all spawned AND all resolved. */
    if (
      this.totalSpawned === this.totalEnemiesInWave &&
      this.totalResolved === this.totalSpawned
    ) {
      this.currentState = WaveState.COMPLETE;
    }
  }

  /**
   * COMPLETE state update: emits WAVE_COMPLETED, then either transitions
   * to PREP for the next wave, triggers endless continuation, or emits
   * ALL_WAVES_COMPLETED and goes IDLE.
   *
   * BOLT-020: When the final scripted wave completes and gameMode is 'endless',
   * the system emits CAMPAIGN_COMPLETE and generates procedural waves instead
   * of emitting ALL_WAVES_COMPLETED.
   */
  private updateComplete(time: number): void {
    /* Use the correct totalWaves value -- in endless mode after campaign,
     * we report the current wave number as totalWaves since there is no fixed end. */
    const reportedTotalWaves = this.endlessActive
      ? this.waveIndex + 1
      : this.waveDefinitions.length;

    /* Emit WAVE_COMPLETED event for BOLT-008 (bonus calculation). */
    const completedPayload: WaveCompletedPayload = {
      waveNumber: this.waveIndex + 1,
      totalWaves: reportedTotalWaves,
      earlyStart: this.earlyStartFlag,
      timestamp: time,
    };
    this.emit(GAME_EVENTS.WAVE_COMPLETED, completedPayload);

    /* Update GameState wave tracking. */
    this.gameState.currentWave = this.waveIndex + 1;

    /* BOLT-020: Track highest wave reached for the run. */
    if (this.gameState.currentWave > this.gameState.highestWaveReached) {
      this.gameState.highestWaveReached = this.gameState.currentWave;
    }

    /* Check if this was the final scripted wave. */
    if (this.waveIndex >= this.waveDefinitions.length - 1) {
      /* BOLT-020: In endless mode, transition to procedural wave generation
       * instead of triggering victory. */
      if (this.gameState.gameMode === 'endless' && this.endlessConfig) {
        if (!this.endlessActive) {
          /* First time reaching the end of scripted waves -- emit campaign complete. */
          this.endlessActive = true;
          this.gameState.campaignComplete = true;

          const campaignPayload: CampaignCompletePayload = {
            totalScriptedWaves: this.waveDefinitions.length,
            timestamp: time,
          };
          this.emit(GAME_EVENTS.CAMPAIGN_COMPLETE, campaignPayload);
        }

        /* Generate and append the next endless wave. */
        const nextWaveNumber = this.waveIndex + 2; // waveIndex is 0-based, waveNumber is 1-based
        const endlessWaveDef = this.generateEndlessWave(nextWaveNumber);
        this.waveDefinitions.push(endlessWaveDef);

        /* Advance to the new wave. */
        this.waveIndex++;
        this.startPrep();
      } else {
        /* Stage mode or no endless config: standard victory path. */
        const allCompletePayload: AllWavesCompletedPayload = {
          totalWaves: this.waveDefinitions.length,
          timestamp: time,
        };
        this.emit(GAME_EVENTS.ALL_WAVES_COMPLETED, allCompletePayload);
        this.currentState = WaveState.IDLE;
      }
    } else {
      /* More scripted waves remain -- transition to PREP for the next wave. */
      this.waveIndex++;
      this.startPrep();
    }
  }

  // ---------------------------------------------------------------------------
  // Private -- State Transitions
  // ---------------------------------------------------------------------------

  /**
   * Begins the PREP state for the current wave.
   * Reads prepTimeMs from the wave definition and resets the countdown.
   */
  private startPrep(): void {
    const waveDef = this.waveDefinitions[this.waveIndex]!;
    this.currentState = WaveState.PREP;
    this.prepTimeRemainingMs = waveDef.prepTimeMs;
    this.earlyStartFlag = false;
  }

  /**
   * Transitions from PREP to ACTIVE.
   * Flattens the wave's groups into the active spawn queue and emits WAVE_STARTED.
   */
  private transitionToActive(): void {
    const waveDef = this.waveDefinitions[this.waveIndex]!;

    /* Build spawn queue from wave groups. */
    this.activeGroups = waveDef.groups.map((group: WaveGroup) => ({
      enemyId: group.enemyId,
      totalCount: group.count,
      spawnIntervalMs: group.spawnIntervalMs,
      delayMs: group.delayMs,
      remaining: group.count,
      spawnAccumulator: 0,
      activated: group.delayMs === 0,
    }));

    /* Calculate total enemies for completion tracking. */
    this.totalEnemiesInWave = waveDef.groups.reduce(
      (sum: number, g: WaveGroup) => sum + g.count,
      0,
    );
    this.totalSpawned = 0;
    this.totalResolved = 0;
    this.waveElapsedMs = 0;

    /* For groups with delayMs=0, set accumulator to spawnIntervalMs so
     * the first enemy spawns immediately on the first update frame. */
    for (const group of this.activeGroups) {
      if (group.activated) {
        group.spawnAccumulator = group.spawnIntervalMs;
      }
    }

    this.currentState = WaveState.ACTIVE;

    /* Update gameState.currentWave immediately when the wave starts so
     * HUD displays the correct wave number during ACTIVE state. Previously
     * this was only set in updateComplete(), causing the HUD to show the
     * completed wave count instead of the current wave (D4 fix). */
    this.gameState.currentWave = this.waveIndex + 1;

    /* Build upcoming composition for the NEXT wave (N+1) for the event payload.
     * BOLT-020: In endless mode, the next wave may not exist yet in waveDefinitions.
     * Pre-generate it so the HUD can show the composition preview. */
    const nextWaveIndex = this.waveIndex + 1;
    let upcomingComposition: CompositionSummaryEntry[];

    if (nextWaveIndex < this.waveDefinitions.length) {
      upcomingComposition = this.buildCompositionSummary(this.waveDefinitions[nextWaveIndex]!);
    } else if (this.endlessActive && this.endlessConfig) {
      /* BOLT-020: Pre-generate the next endless wave for composition preview. */
      const previewWaveNum = nextWaveIndex + 1; // 1-indexed wave number
      const previewDef = this.generateEndlessWave(previewWaveNum);
      upcomingComposition = this.buildCompositionSummary(previewDef);
    } else {
      upcomingComposition = [];
    }

    /* BOLT-020: In endless mode, report current wave number as totalWaves
     * since there is no fixed total. */
    const reportedTotalWaves = this.endlessActive
      ? this.waveIndex + 1
      : this.waveDefinitions.length;

    /* Emit WAVE_STARTED event for BOLT-009 HUD. */
    const payload: WaveStartedPayload = {
      waveNumber: this.waveIndex + 1,
      totalWaves: reportedTotalWaves,
      isBossWave: waveDef.isBossWave,
      earlyStart: this.earlyStartFlag,
      upcomingComposition,
    };
    this.emit(GAME_EVENTS.WAVE_STARTED, payload);
  }

  // ---------------------------------------------------------------------------
  // Private -- Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles MAP_READY event: caches EnemySystem reference and starts
   * the first wave's PREP countdown.
   */
  private onMapReady(): void {
    if (this.mapReady) return;
    this.mapReady = true;

    /* Retrieve EnemySystem from registry (do NOT accept as constructor param
     * to avoid constructor-order dependency). */
    this.enemySystem = this.scene.registry.get('enemySystem') as EnemySystem | null;

    /* Start first wave PREP. */
    if (this.waveDefinitions.length > 0) {
      this.waveIndex = 0;
      this.startPrep();
    }
  }

  /**
   * Handles ENEMY_DIED and ENEMY_REACHED_OBJECTIVE events.
   * Increments the resolved counter for wave completion detection.
   * Both death and breakthrough count as "resolved" for wave completion.
   */
  private onEnemyResolved(): void {
    if (this.currentState !== WaveState.ACTIVE) return;
    this.totalResolved++;
  }

  /**
   * Handles GAME_OVER event: halts all spawning and transitions to IDLE.
   * Fires regardless of current state (PREP or ACTIVE).
   */
  private onGameOver(_payload: GameOverPayload): void {
    /* Halt all activity: stop countdown, stop spawning. */
    this.currentState = WaveState.IDLE;
    this.activeGroups = [];
    this.prepTimeRemainingMs = 0;
  }

  // ---------------------------------------------------------------------------
  // Private -- Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a composition summary for a wave definition.
   * Merges groups with the same enemyId, preserving first-appearance order.
   *
   * For groups [{enemyId:'runner', count:5}, {enemyId:'tank', count:3}, {enemyId:'runner', count:2}],
   * returns [{enemyId:'runner', count:7}, {enemyId:'tank', count:3}].
   *
   * @param waveDef - The wave definition to summarize.
   * @returns Aggregated composition entries.
   */
  private buildCompositionSummary(waveDef: WaveDefinition): CompositionSummaryEntry[] {
    const summaryMap = new Map<string, number>();
    const order: string[] = [];

    for (const group of waveDef.groups) {
      const existing = summaryMap.get(group.enemyId);
      if (existing !== undefined) {
        summaryMap.set(group.enemyId, existing + group.count);
      } else {
        summaryMap.set(group.enemyId, group.count);
        order.push(group.enemyId);
      }
    }

    return order.map((enemyId) => ({
      enemyId,
      count: summaryMap.get(enemyId)!,
    }));
  }
}
