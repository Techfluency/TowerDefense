/**
 * Boss system -- manages boss enemy mechanics, HP bar, and boss wave intro.
 *
 * Responsibilities:
 * - Tracks active boss enemies on the field
 * - Monitors boss HP thresholds for mechanic activation:
 *   1. Minion Summon at 75% and 50% HP (spawns 3 swarm minions each)
 *   2. Speed Surge at 25% HP (doubles movement speed)
 * - Renders the prominent boss HP bar centered at top of screen
 * - Plays boss wave intro (camera shake + "BOSS WAVE!" text flash)
 * - Applies speed surge VFX (red tint pulse, speed trail particles)
 * - Emits boss-specific events for downstream systems
 * - Scales boss sprite to 1.5x for visual dominance
 *
 * Downstream consumers:
 * - BOLT-009 HudSystem reacts to boss intro overlay timing
 * - BOLT-015 AudioSystem listens for boss events (future hook)
 *
 * Priority 2.5 in update order (after EnemySystem, before TowerCombat).
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState } from '../types/game-types';
import type {
  WaveStartedPayload,
  EnemyDiedPayload,
  EnemySpawnedPayload,
  BossMinionSummonPayload,
  BossSpeedSurgePayload,
  BossDiedPayload,
} from '../types/events';
import type { EnemySystem } from './enemy-system';
import type { Enemy } from '../entities/enemy';
import type { VFXManager } from '../vfx/vfx-manager';
import { DEPTH_UI, DEPTH_OVERLAY } from '../config/depth-layers';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';
import {
  BOSS_HP_BAR_WIDTH,
  BOSS_HP_BAR_HEIGHT,
  BOSS_HP_BAR_Y,
  BOSS_HP_BAR_BG_COLOR,
  BOSS_HP_BAR_FILL_COLOR,
  BOSS_HP_BAR_BORDER_COLOR,
  BOSS_INTRO_SHAKE_INTENSITY,
  BOSS_INTRO_SHAKE_DURATION_MS,
  BOSS_INTRO_TEXT_DURATION_MS,
  BOSS_MINION_SUMMON_COUNT,
  BOSS_SPEED_SURGE_MULTIPLIER,
  BOSS_SUMMON_THRESHOLD_1,
  BOSS_SUMMON_THRESHOLD_2,
  BOSS_SPEED_SURGE_THRESHOLD,
  BOSS_SPEED_SURGE_TINT,
} from '../vfx/vfx-config';

// ---------------------------------------------------------------------------
// Boss scale constant -- boss sprites are visually larger than normal enemies
// ---------------------------------------------------------------------------

/** Scale multiplier for boss sprites (1.5x normal size). */
const BOSS_SPRITE_SCALE = 1.5;

/** Boss archetype ID in enemies.json. */
const BOSS_ARCHETYPE_ID = 'boss';

/** Minion archetype spawned by the boss summon mechanic. */
const MINION_ARCHETYPE_ID = 'swarm';

/** Interval in ms between speed trail particle emissions during surge. */
const SPEED_TRAIL_INTERVAL_MS = 80;

// ---------------------------------------------------------------------------
// Per-boss tracking state
// ---------------------------------------------------------------------------

/**
 * Tracks mechanic activation state for a single boss instance.
 * Prevents mechanics from re-triggering once their threshold is crossed.
 */
interface BossTracker {
  /** The Enemy instance being tracked. */
  enemy: Enemy;
  /** Whether the 75% HP summon has fired. */
  summon75Fired: boolean;
  /** Whether the 50% HP summon has fired. */
  summon50Fired: boolean;
  /** Whether the 25% HP speed surge has fired. */
  speedSurgeFired: boolean;
  /** Accumulator for speed trail particle emission timing. */
  trailAccumulatorMs: number;
}

// ---------------------------------------------------------------------------
// BossSystem
// ---------------------------------------------------------------------------

export class BossSystem extends BaseSystem {
  /** All currently tracked boss enemies (alive, on the field). */
  private readonly activeBosses: BossTracker[] = [];

  /** Graphics object for the boss HP bar (redrawn each frame). */
  private bossHpBarGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Text displaying boss name above the HP bar. */
  private bossNameText: Phaser.GameObjects.Text | null = null;

  /** Text displaying boss HP percentage next to the HP bar. */
  private bossHpPercentText: Phaser.GameObjects.Text | null = null;

  /** Boss wave intro text ("BOSS WAVE!"). */
  private introText: Phaser.GameObjects.Text | null = null;

  /** EnemySystem reference for spawning minions. */
  private enemySystem: EnemySystem | null = null;

  /** VFX manager for boss-specific visual effects. */
  private vfxManager: VFXManager | null = null;

  /** Whether a boss wave is currently active. */
  private isBossWaveActive = false;

  /**
   * @param scene - The Gameplay scene.
   * @param gameState - Shared per-run game state.
   */
  constructor(scene: Phaser.Scene, gameState: GameState) {
    super(scene, gameState);
  }

  /**
   * Registers event listeners for boss tracking.
   * Called after all systems are constructed.
   */
  init(): void {
    /* Listen for wave start to detect boss waves. */
    this.listen(
      GAME_EVENTS.WAVE_STARTED,
      this.onWaveStarted as (...args: never[]) => void,
    );

    /* Listen for enemy spawn to detect boss enemy appearance. */
    this.listen(
      GAME_EVENTS.ENEMY_SPAWNED,
      this.onEnemySpawned as (...args: never[]) => void,
    );

    /* Listen for enemy death to handle boss death cleanup. */
    this.listen(
      GAME_EVENTS.ENEMY_DIED,
      this.onEnemyDied as (...args: never[]) => void,
    );

    /* Resolve system references from registry. */
    this.enemySystem = this.scene.registry.get('enemySystem') as EnemySystem | null;
    this.vfxManager = this.scene.registry.get('vfxManager') as VFXManager | null;

    /* Create boss HP bar elements (initially hidden). */
    this.createBossHpBarElements();

    /* Store self on registry for external access. */
    this.scene.registry.set('bossSystem', this);
  }

  /**
   * Per-frame update: checks boss HP thresholds for mechanic activation,
   * applies speed surge VFX trails, and redraws the boss HP bar.
   *
   * @param _time - Total elapsed time (unused).
   * @param delta - Milliseconds since last frame.
   */
  update(_time: number, delta: number): void {
    /* Process mechanics for each tracked boss. */
    for (let i = this.activeBosses.length - 1; i >= 0; i--) {
      const tracker = this.activeBosses[i]!;
      const enemy = tracker.enemy;

      /* Remove dead bosses from tracking. */
      if (!enemy.isAlive()) {
        this.activeBosses.splice(i, 1);
        continue;
      }

      const hpRatio = enemy.getHpRatio();

      /* Check minion summon at 75% HP threshold. */
      if (!tracker.summon75Fired && hpRatio <= BOSS_SUMMON_THRESHOLD_1) {
        tracker.summon75Fired = true;
        this.triggerMinionSummon(enemy, BOSS_SUMMON_THRESHOLD_1);
      }

      /* Check minion summon at 50% HP threshold. */
      if (!tracker.summon50Fired && hpRatio <= BOSS_SUMMON_THRESHOLD_2) {
        tracker.summon50Fired = true;
        this.triggerMinionSummon(enemy, BOSS_SUMMON_THRESHOLD_2);
      }

      /* Check speed surge at 25% HP threshold. */
      if (!tracker.speedSurgeFired && hpRatio <= BOSS_SPEED_SURGE_THRESHOLD) {
        tracker.speedSurgeFired = true;
        this.triggerSpeedSurge(enemy);
      }

      /* Emit speed trail particles while surging. */
      if (tracker.speedSurgeFired && this.vfxManager) {
        tracker.trailAccumulatorMs += delta;
        if (tracker.trailAccumulatorMs >= SPEED_TRAIL_INTERVAL_MS) {
          tracker.trailAccumulatorMs -= SPEED_TRAIL_INTERVAL_MS;
          const pos = enemy.getPosition();
          this.vfxManager.playBossSpeedTrail(pos.x, pos.y);
        }
      }
    }

    /* Redraw the boss HP bar if any bosses are alive. */
    this.drawBossHpBar();
  }

  /**
   * Cleans up boss tracking state and UI elements.
   */
  destroy(): void {
    this.activeBosses.length = 0;
    this.isBossWaveActive = false;

    if (this.bossHpBarGraphics) {
      this.bossHpBarGraphics.destroy();
      this.bossHpBarGraphics = null;
    }
    if (this.bossNameText) {
      this.bossNameText.destroy();
      this.bossNameText = null;
    }
    if (this.bossHpPercentText) {
      this.bossHpPercentText.destroy();
      this.bossHpPercentText = null;
    }
    if (this.introText) {
      this.introText.destroy();
      this.introText = null;
    }

    this.scene.registry.remove('bossSystem');
    this.enemySystem = null;
    this.vfxManager = null;

    super.destroy();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns all actively tracked boss enemies.
   * Used by tests and potentially by other systems.
   */
  getActiveBosses(): BossTracker[] {
    return [...this.activeBosses];
  }

  /**
   * Returns whether a boss wave is currently in progress.
   */
  isBossWave(): boolean {
    return this.isBossWaveActive;
  }

  // -------------------------------------------------------------------------
  // Private -- Event Handlers
  // -------------------------------------------------------------------------

  /**
   * Handles WAVE_STARTED event. If the wave is a boss wave, plays
   * the boss intro: camera shake + "BOSS WAVE!" text flash.
   */
  private onWaveStarted(payload: WaveStartedPayload): void {
    this.isBossWaveActive = payload.isBossWave;

    if (payload.isBossWave) {
      this.playBossIntro();
    }
  }

  /**
   * Handles ENEMY_SPAWNED event. If the enemy is a boss archetype,
   * starts tracking it for mechanic thresholds and scales its sprite.
   */
  private onEnemySpawned(payload: EnemySpawnedPayload): void {
    if (payload.enemyType !== BOSS_ARCHETYPE_ID) return;

    /* Resolve the Enemy instance from EnemySystem. */
    if (!this.enemySystem) {
      this.enemySystem = this.scene.registry.get('enemySystem') as EnemySystem | null;
    }
    if (!this.enemySystem) return;

    const enemy = this.enemySystem.getEnemyById(payload.enemyId);
    if (!enemy) return;

    /* Scale up the boss sprite for visual dominance. */
    enemy.sprite.setScale(BOSS_SPRITE_SCALE);

    /* Play spawn burst VFX. */
    if (this.vfxManager) {
      this.vfxManager.playBossSpawnBurst(payload.position.x, payload.position.y);
    }

    /* Start tracking this boss for mechanics. */
    this.activeBosses.push({
      enemy,
      summon75Fired: false,
      summon50Fired: false,
      speedSurgeFired: false,
      trailAccumulatorMs: 0,
    });
  }

  /**
   * Handles ENEMY_DIED event. If the dead enemy is a tracked boss,
   * plays boss death effects and emits BOSS_DIED.
   */
  private onEnemyDied(payload: EnemyDiedPayload): void {
    if (payload.enemyType !== BOSS_ARCHETYPE_ID) return;

    /* Play boss death screen shake. */
    if (this.vfxManager) {
      this.vfxManager.playBossDeathShake();
    }

    /* Emit boss-specific death event. */
    const bossDiedPayload: BossDiedPayload = {
      bossId: payload.enemyId,
      position: payload.position,
    };
    this.emit(GAME_EVENTS.BOSS_DIED, bossDiedPayload);

    /* Remove from active tracking (also handled in update for safety). */
    const idx = this.activeBosses.findIndex(
      (t) => t.enemy.instanceId === payload.enemyId,
    );
    if (idx >= 0) {
      this.activeBosses.splice(idx, 1);
    }

    /* If no bosses remain, clear boss wave flag. */
    if (this.activeBosses.length === 0) {
      this.isBossWaveActive = false;
    }
  }

  // -------------------------------------------------------------------------
  // Private -- Boss Mechanics
  // -------------------------------------------------------------------------

  /**
   * Triggers the minion summon mechanic. Spawns BOSS_MINION_SUMMON_COUNT
   * swarm-type minions at the boss's current position.
   *
   * The minions are spawned through EnemySystem.spawnEnemy() so they
   * are properly tracked by WaveSystem's enemy resolution counter --
   * this is critical. We emit an event for each minion via EnemySystem.
   *
   * @param boss - The boss enemy triggering the summon.
   * @param threshold - The HP threshold that triggered (for payload).
   */
  private triggerMinionSummon(boss: Enemy, threshold: number): void {
    if (!this.enemySystem) return;

    const pos = boss.getPosition();

    /* Play spawn burst VFX at boss position. */
    if (this.vfxManager) {
      this.vfxManager.playBossSpawnBurst(pos.x, pos.y);
    }

    /* Spawn minions. They appear at the boss's current position
     * and start following waypoints from the nearest waypoint. */
    for (let i = 0; i < BOSS_MINION_SUMMON_COUNT; i++) {
      const minion = this.enemySystem.spawnEnemy(
        MINION_ARCHETYPE_ID,
        boss.waveNumber,
      );
      if (minion) {
        /* Reposition minion to boss location with slight offset
         * so they don't stack perfectly. */
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        minion.sprite.x = pos.x + offsetX;
        minion.sprite.y = pos.y + offsetY;

        /* Set the minion's waypoint to match the boss's current waypoint
         * so they start from the boss's position on the path. */
        minion.waypointIndex = boss.waypointIndex;
      }
    }

    /* Emit minion summon event for audio/VFX hooks. */
    const payload: BossMinionSummonPayload = {
      bossId: boss.instanceId,
      position: pos,
      minionCount: BOSS_MINION_SUMMON_COUNT,
      hpThreshold: threshold,
    };
    this.emit(GAME_EVENTS.BOSS_MINION_SUMMON, payload);
  }

  /**
   * Triggers the speed surge mechanic. Doubles the boss's movement speed
   * and applies a red tint to the sprite for visual feedback.
   *
   * @param boss - The boss enemy activating speed surge.
   */
  private triggerSpeedSurge(boss: Enemy): void {
    /* Double the current speed (2x multiplier on current speed). */
    boss.currentSpeed = boss.currentSpeed * BOSS_SPEED_SURGE_MULTIPLIER;

    /* Apply red tint for visual feedback. */
    boss.sprite.setTint(BOSS_SPEED_SURGE_TINT);

    /* Play screen shake to emphasize the surge. */
    if (this.vfxManager) {
      this.vfxManager.playScreenShake();
    }

    /* Emit speed surge event for audio/VFX hooks. */
    const pos = boss.getPosition();
    const payload: BossSpeedSurgePayload = {
      bossId: boss.instanceId,
      position: pos,
      speedMultiplier: BOSS_SPEED_SURGE_MULTIPLIER,
    };
    this.emit(GAME_EVENTS.BOSS_SPEED_SURGE, payload);
  }

  // -------------------------------------------------------------------------
  // Private -- Boss Intro
  // -------------------------------------------------------------------------

  /**
   * Plays the boss wave intro sequence:
   * 1. Camera shake for dramatic impact
   * 2. "BOSS WAVE!" text flash centered on screen, auto-fades after duration
   */
  private playBossIntro(): void {
    /* Camera shake for dramatic impact -- always fires on boss wave
     * regardless of VFX quality since it is a core mechanic cue. */
    this.scene.cameras.main.shake(
      BOSS_INTRO_SHAKE_DURATION_MS,
      BOSS_INTRO_SHAKE_INTENSITY / 1000,
    );

    /* Create "BOSS WAVE!" flash text. */
    if (this.introText) {
      this.introText.destroy();
    }

    this.introText = this.scene.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 40,
      'BOSS WAVE!',
      {
        fontSize: '48px',
        fontFamily: 'monospace',
        color: '#FF2222',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      },
    );
    this.introText.setOrigin(0.5, 0.5);
    this.introText.setDepth(DEPTH_OVERLAY);
    this.introText.setAlpha(0);

    /* Slam-in animation: scale from 2x to 1x with alpha fade-in. */
    this.introText.setScale(2);
    this.scene.tweens.add({
      targets: this.introText,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        /* Hold for the configured duration, then fade out. */
        this.scene.time.delayedCall(BOSS_INTRO_TEXT_DURATION_MS, () => {
          if (this.introText) {
            this.scene.tweens.add({
              targets: this.introText,
              alpha: 0,
              duration: 400,
              ease: 'Quad.easeIn',
              onComplete: () => {
                if (this.introText) {
                  this.introText.destroy();
                  this.introText = null;
                }
              },
            });
          }
        });
      },
    });
  }

  // -------------------------------------------------------------------------
  // Private -- Boss HP Bar
  // -------------------------------------------------------------------------

  /**
   * Creates the boss HP bar UI elements. They start hidden and become
   * visible when a boss is active on the field.
   */
  private createBossHpBarElements(): void {
    this.bossHpBarGraphics = this.scene.add.graphics();
    this.bossHpBarGraphics.setDepth(DEPTH_UI);
    /* Use scrollFactor 0 so the HP bar stays fixed on screen. */
    this.bossHpBarGraphics.setScrollFactor(0);
    this.bossHpBarGraphics.setVisible(false);

    this.bossNameText = this.scene.add.text(
      GAME_WIDTH / 2,
      BOSS_HP_BAR_Y - 14,
      'BOSS',
      {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#FF4444',
        fontStyle: 'bold',
      },
    );
    this.bossNameText.setOrigin(0.5, 0.5);
    this.bossNameText.setDepth(DEPTH_UI);
    this.bossNameText.setScrollFactor(0);
    this.bossNameText.setVisible(false);

    this.bossHpPercentText = this.scene.add.text(
      GAME_WIDTH / 2 + BOSS_HP_BAR_WIDTH / 2 + 10,
      BOSS_HP_BAR_Y,
      '100%',
      {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#FF4444',
      },
    );
    this.bossHpPercentText.setOrigin(0, 0.5);
    this.bossHpPercentText.setDepth(DEPTH_UI);
    this.bossHpPercentText.setScrollFactor(0);
    this.bossHpPercentText.setVisible(false);
  }

  /**
   * Redraws the boss HP bar each frame. Shows the bar if any boss is
   * alive, hides it when no bosses are on the field.
   */
  private drawBossHpBar(): void {
    if (!this.bossHpBarGraphics) return;

    /* No active bosses: hide the bar. */
    if (this.activeBosses.length === 0) {
      this.bossHpBarGraphics.setVisible(false);
      if (this.bossNameText) this.bossNameText.setVisible(false);
      if (this.bossHpPercentText) this.bossHpPercentText.setVisible(false);
      return;
    }

    /* Use the first active boss (only one boss per wave in current design). */
    const tracker = this.activeBosses[0]!;
    const enemy = tracker.enemy;
    const hpRatio = enemy.getHpRatio();

    /* Show bar elements. */
    this.bossHpBarGraphics.setVisible(true);
    if (this.bossNameText) this.bossNameText.setVisible(true);
    if (this.bossHpPercentText) this.bossHpPercentText.setVisible(true);

    const barX = (GAME_WIDTH - BOSS_HP_BAR_WIDTH) / 2;
    const barY = BOSS_HP_BAR_Y;

    this.bossHpBarGraphics.clear();

    /* Border rectangle. */
    this.bossHpBarGraphics.lineStyle(2, BOSS_HP_BAR_BORDER_COLOR, 1);
    this.bossHpBarGraphics.strokeRect(
      barX - 1, barY - 1,
      BOSS_HP_BAR_WIDTH + 2, BOSS_HP_BAR_HEIGHT + 2,
    );

    /* Background fill. */
    this.bossHpBarGraphics.fillStyle(BOSS_HP_BAR_BG_COLOR, 1);
    this.bossHpBarGraphics.fillRect(barX, barY, BOSS_HP_BAR_WIDTH, BOSS_HP_BAR_HEIGHT);

    /* HP fill. */
    this.bossHpBarGraphics.fillStyle(BOSS_HP_BAR_FILL_COLOR, 1);
    this.bossHpBarGraphics.fillRect(
      barX, barY,
      BOSS_HP_BAR_WIDTH * Math.max(0, hpRatio),
      BOSS_HP_BAR_HEIGHT,
    );

    /* Update percentage text. */
    if (this.bossHpPercentText) {
      const percent = Math.max(0, Math.floor(hpRatio * 100));
      this.bossHpPercentText.setText(`${percent}%`);
    }
  }
}
