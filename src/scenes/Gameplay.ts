/**
 * Gameplay scene -- the primary game scene where all action happens.
 *
 * This is the scene where the tower defense game plays out. It:
 * 1. Creates and initializes all game systems (registered by each bolt).
 * 2. Manages the GameState object that systems read and write.
 * 3. Calls update() on all systems each frame in priority order.
 * 4. Handles game-level events (pause, game over, win).
 * 5. Initializes the seeded RNG for reproducible runs.
 *
 * Architecture pattern (Scene + Systems):
 * - This scene instantiates System classes in create().
 * - Each System receives a reference to this scene and the GameState.
 * - This scene calls each System's update(time, delta) in its update().
 * - Systems communicate via this scene's event emitter (this.events).
 * - No global singletons. All state flows through GameState or events.
 */
import Phaser from 'phaser';
import { SCENE_KEYS } from '../config/game-config';
import type { GameState } from '../types/game-types';
import type { EnvConfig } from '../config/env';
import { ConfigManager } from '../utils/config-manager';
import { PoolManager, DEFAULT_POOL_CONFIG } from '../utils/pool-manager';
import { InputSystem } from '../systems/input-system';
import { MapGeneratorSystem } from '../systems/map-generator-system';
import { AutoTileSystem } from '../systems/auto-tile-system';
import { MapRendererSystem } from '../systems/map-renderer-system';
import { EnemySystem } from '../systems/enemy-system';
import { WaveSystem } from '../systems/wave-system';
import { TowerRegistry } from '../systems/tower-registry';
import { TowerPlacementSystem } from '../systems/tower-placement-system';
import { TowerCombatSystem } from '../systems/tower-combat-system';
import { ProjectileSystem } from '../systems/projectile-system';
import { UpgradeSystem } from '../systems/upgrade-system';
import { EconomySystem } from '../systems/economy-system';
import { GameStateManager } from '../systems/game-state-manager';
import { HudSystem } from '../systems/hud-system';
import type { BaseSystem } from '../systems/base-system';
import { VFXManager } from '../vfx/vfx-manager';

export class Gameplay extends Phaser.Scene {
  /**
   * The central game state for this run. Created fresh each time
   * the Gameplay scene starts (each "New Game").
   */
  private gameState!: GameState;

  /** Typed config access for tower, enemy, wave, and projectile definitions. */
  private configManager!: ConfigManager;

  /** Object pools for enemies and projectiles. */
  private poolManager!: PoolManager;

  /** Seeded random number generator for reproducible runs. */
  public rng!: Phaser.Math.RandomDataGenerator;

  /** All active systems in priority-ordered update sequence. */
  private systems: BaseSystem[] = [];

  constructor() {
    super({ key: SCENE_KEYS.GAMEPLAY });
  }

  /**
   * Phaser create lifecycle method.
   * Initializes game state, seeded RNG, config manager, pool manager,
   * and all systems for a new run.
   */
  create(): void {
    this.gameState = this.createInitialGameState();

    /* --- Seeded RNG ---
     * Initialize from env config seed or auto-generate one.
     * All randomness must flow through this.rng, never Math.random(). */
    this.rng = new Phaser.Math.RandomDataGenerator([this.gameState.gameSeed]);

    /* --- Config Manager ---
     * Reads JSON data from Phaser cache (loaded in Preload). */
    this.configManager = new ConfigManager(this);

    /* --- Pool Manager ---
     * Pre-allocates enemy and projectile sprite pools. */
    this.poolManager = new PoolManager(this, DEFAULT_POOL_CONFIG);

    /* --- VFX Manager (BOLT-014) ---
     * Central factory for all visual effects. Stored on registry so systems
     * can resolve it during init(). Quality defaults to 'high'; player can
     * change via the settings panel (BOLT-009 integration). */
    const vfxManager = new VFXManager(this, 'high');
    this.registry.set('vfxManager', vfxManager);

    /* --- Store references on registry for DebugOverlay access ---
     * The DebugOverlay scene runs in parallel and reads these. */
    this.registry.set('poolManager', this.poolManager);
    this.registry.set('gameState', this.gameState);
    this.registry.set('configManager', this.configManager);

    /* --- System Initialization ---
     * Systems are created in priority order. After all are constructed,
     * init() is called on each so event listeners can reference any system.
     *
     * Map systems run first: generator produces data, renderer draws tiles.
     * Both must complete before any gameplay system queries map data. */
    const mapGenerator = new MapGeneratorSystem(this, this.gameState, this.rng, this.configManager);
    const autoTileSystem = new AutoTileSystem(this, this.gameState);
    const mapRenderer = new MapRendererSystem(this, this.gameState);
    const inputSystem = new InputSystem(this, this.gameState);

    /* Tower registry -- data store for all placed towers. Placed after input
     * so placement events fire after input processing in the same frame.
     * Stored on registry for cross-system access (BOLT-006, BOLT-007). */
    const towerRegistry = new TowerRegistry(this, this.gameState);

    /* Tower placement system -- build menu, ghost, range preview, sell.
     * Needs ConfigManager for tower definitions, TowerRegistry for occupancy. */
    const towerPlacementSystem = new TowerPlacementSystem(
      this, this.gameState, this.configManager, towerRegistry,
    );

    /* Priority 1: Wave system -- drives wave progression and enemy spawning.
     * Must update before EnemySystem so spawned enemies exist before
     * movement processing in the same frame. */
    const waveSystem = new WaveSystem(this, this.gameState, this.configManager);

    /* Priority 2: Enemy system -- manages all active enemies on the field.
     * Must update after wave system but before tower combat so towers target
     * enemies at their current-frame positions.
     * BOLT-014: VFXManager injected for hit flash, death burst, smooth movement. */
    const enemySystem = new EnemySystem(this, this.gameState, this.poolManager, this.configManager);

    /* Store enemySystem on registry before combat systems init (they resolve it). */
    this.registry.set('enemySystem', enemySystem);

    /* Priority 3: Tower combat system -- targeting, cooldowns, fire initiation.
     * Reads tower positions from TowerRegistry, enemy positions from EnemySystem.
     * Fires after enemies move so targeting uses current-frame positions. */
    const towerCombatSystem = new TowerCombatSystem(
      this, this.gameState, this.configManager,
    );

    /* Priority 4: Projectile system -- movement, collision, pool lifecycle.
     * Runs after combat so newly fired projectiles begin moving the same frame. */
    const projectileSystem = new ProjectileSystem(
      this, this.gameState, this.poolManager,
    );

    /* Wire the projectile system reference into combat system (created after it). */
    towerCombatSystem.setProjectileSystem(projectileSystem);

    /* Priority 5: Economy system -- centralized currency and score mutations.
     * Listens to ENEMY_DIED, WAVE_COMPLETED, TOWER_REMOVED. Exposes trySpend()
     * API consumed by BOLT-005 (placement) and BOLT-007 (upgrades). */
    const economySystem = new EconomySystem(
      this, this.gameState, this.configManager,
    );

    /* Priority 6: Upgrade system -- tower upgrades, repair, HP, panel UI.
     * Needs ConfigManager, TowerRegistry. Needs TowerPlacementSystem for
     * placement mode checks (wired via setter after construction). */
    const upgradeSystem = new UpgradeSystem(
      this, this.gameState, this.configManager, towerRegistry,
    );
    upgradeSystem.setTowerPlacementSystem(towerPlacementSystem);

    /* Wire EconomySystem into BOLT-005 and BOLT-007 so they call trySpend()
     * instead of mutating GameState.currency directly. */
    towerPlacementSystem.setEconomySystem(economySystem);
    upgradeSystem.setEconomySystem(economySystem);

    /* Store placement system on registry so combat system can check placement mode. */
    this.registry.set('towerPlacementSystem', towerPlacementSystem);

    /* Store economy system on registry for BOLT-009 access (getRunStats at run end). */
    this.registry.set('economySystem', economySystem);

    /* Priority 7: Game state manager -- objective HP, game over/victory,
     * pause/resume, speed multiplier. Purely event-driven (no per-frame). */
    const gameStateManager = new GameStateManager(this, this.gameState);

    /* Priority 8: HUD system -- all visual HUD rendering, floating text,
     * overlays, tooltips, enemy badges, coach marks. */
    const hudSystem = new HudSystem(this, this.gameState);

    this.systems = [
      mapGenerator,          /* Priority 0 (map) */
      autoTileSystem,        /* Priority 0 (auto-tile) -- BOLT-011 */
      mapRenderer,           /* Priority 0 (map) */
      inputSystem,           /* Priority 0 (input) */
      towerRegistry,         /* Priority 0 (tower data) -- BOLT-005 */
      towerPlacementSystem,  /* Priority 0 (tower placement UI) -- BOLT-005 */
      waveSystem,            /* Priority 1 (wave) -- BOLT-004 */
      enemySystem,           /* Priority 2 (enemy) -- BOLT-003 */
      towerCombatSystem,     /* Priority 3 (tower combat) -- BOLT-006 */
      projectileSystem,      /* Priority 4 (projectile) -- BOLT-006 */
      economySystem,         /* Priority 5 (economy) -- BOLT-008 */
      upgradeSystem,         /* Priority 6 (upgrades) -- BOLT-007 */
      gameStateManager,      /* Priority 7 (game state) -- BOLT-009 */
      hudSystem,             /* Priority 8 (HUD) -- BOLT-009 */
    ];

    /* Call init() on each system after all are constructed.
     * Separate from constructor so all systems exist before any wires listeners. */
    for (const system of this.systems) {
      system.init();
    }

    /* --- Shutdown Handler ---
     * Phaser's scene.start() stops the current scene but does NOT destroy it.
     * We must explicitly clean up systems on the 'shutdown' event to prevent
     * ghost listeners and memory leaks across scene restarts. */
    this.events.on('shutdown', this.handleShutdown, this);
  }

  /**
   * Phaser update lifecycle method.
   * Called every frame (~60 times per second at target FPS).
   *
   * @param time - Total elapsed time in milliseconds since game start.
   * @param delta - Milliseconds since the last frame.
   */
  update(time: number, delta: number): void {
    /* Skip updates if the game is paused or over. */
    if (this.gameState.isPaused || this.gameState.isGameOver) {
      return;
    }

    /* Apply speed multiplier (1x or 2x) to delta for game systems.
     * HudSystem UI animations use Phaser tweens (real-time), not scaledDelta. */
    const speedMultiplier = (this.registry.get('speedMultiplier') as number) ?? 1;
    const scaledDelta = delta * speedMultiplier;

    /* Update all systems in priority order with scaled delta. */
    for (const system of this.systems) {
      system.update(time, scaledDelta);
    }
  }

  /**
   * Handles scene shutdown: destroys all systems in reverse order,
   * cleans up pools, and clears registry references.
   */
  private handleShutdown(): void {
    /* Destroy systems in reverse order (opposite of init order). */
    for (let i = this.systems.length - 1; i >= 0; i--) {
      this.systems[i]!.destroy();
    }
    this.systems = [];

    /* Destroy pools to free sprite memory. */
    this.poolManager.destroyAll();

    /* Clear registry references to prevent stale data in DebugOverlay.
     * Note: 'mapData' is removed by MapGeneratorSystem.destroy() above.
     * Note: 'tileVariantMap' is removed by AutoTileSystem.destroy() above.
     * Note: 'waveSystem' is removed by WaveSystem.destroy() above.
     * Note: 'towerRegistry' is removed by TowerRegistry.destroy() above.
     * Note: 'upgradeSystem' is removed by UpgradeSystem.destroy() above. */
    this.registry.remove('poolManager');
    this.registry.remove('gameState');
    this.registry.remove('configManager');
    this.registry.remove('enemySystem');
    this.registry.remove('towerPlacementSystem');
    this.registry.remove('economySystem');

    /* Destroy and remove VFXManager (BOLT-014). */
    const vfx = this.registry.get('vfxManager') as VFXManager | undefined;
    if (vfx) vfx.destroy();
    this.registry.remove('vfxManager');

    /* Note: 'gameStateManager', 'hudSystem', 'speedMultiplier' are removed
     * by GameStateManager.destroy() and HudSystem.destroy() above. */

    /* Remove shutdown listener to prevent double-firing on next create(). */
    this.events.off('shutdown', this.handleShutdown, this);
  }

  /**
   * Creates the initial game state for a new run.
   * All values are defaults -- systems will modify them during play.
   *
   * @returns A fresh GameState with starting values.
   */
  private createInitialGameState(): GameState {
    const envConfig = this.registry.get('envConfig') as EnvConfig;

    /* Use env seed if provided, otherwise generate one from timestamp. */
    const seed = envConfig.gameSeed || Date.now().toString();

    return {
      currency: 0,  /* EconomySystem sets this from economy.json in init() */
      score: 0,
      currentWave: 0,
      totalWaves: 20,
      objectiveHp: 100,
      maxObjectiveHp: 100,
      isPaused: false,
      isGameOver: false,
      gameSeed: seed,
    };
  }
}
