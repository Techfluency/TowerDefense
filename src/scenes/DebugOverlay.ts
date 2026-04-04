/**
 * Debug overlay scene -- displays FPS, entity counts, and seed.
 *
 * Runs as a separate Phaser scene launched in parallel with the Gameplay
 * scene. This avoids z-ordering conflicts with game objects and survives
 * Gameplay scene restarts.
 *
 * Only created when VITE_DEBUG=true. Boot scene conditionally launches it.
 *
 * Reads PoolManager and GameState from the Phaser registry, which the
 * Gameplay scene stores there during create().
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/game-config';
import type { PoolManager } from '../utils/pool-manager';
import type { GameState } from '../types/game-types';
import type { MapData } from '../data/map-data';
import type { WaveSystem } from '../systems/wave-system';
import { TARGET_FPS } from '../config/performance-budget';

/** Scene key for the debug overlay. */
export const DEBUG_OVERLAY_KEY = 'DebugOverlay';

/** FPS threshold below which the FPS text turns red as a warning. */
const FPS_WARNING_THRESHOLD = 50;

/** How often to update the overlay text (in ms). 1000ms = once per second. */
const UPDATE_INTERVAL_MS = 1000;

export class DebugOverlay extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private entityText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private mapText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private lastUpdateTime = 0;

  constructor() {
    super({ key: DEBUG_OVERLAY_KEY });
  }

  /**
   * Creates the debug overlay text objects in the top-right corner.
   * Semi-transparent black background for readability over game content.
   */
  create(): void {
    const padding = 10;
    const x = GAME_WIDTH - padding;
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffffff',
    };

    /* Semi-transparent background for readability. Expanded for wave info line. */
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(GAME_WIDTH - 220, 0, 220, 101);
    bg.setDepth(998);

    /* FPS counter -- updated every second, turns red below threshold. */
    this.fpsText = this.add
      .text(x, padding, `FPS: ${TARGET_FPS}`, textStyle)
      .setOrigin(1, 0)
      .setDepth(999);

    /* Active entity counts from the pool manager. */
    this.entityText = this.add
      .text(x, padding + 18, 'Enemies: 0 / Projectiles: 0', textStyle)
      .setOrigin(1, 0)
      .setDepth(999);

    /* Game seed for reproducibility debugging. */
    this.seedText = this.add
      .text(x, padding + 36, 'Seed: ---', textStyle)
      .setOrigin(1, 0)
      .setDepth(999);

    /* Map info: path length and spawn/objective coordinates. */
    this.mapText = this.add
      .text(x, padding + 54, 'Map: ---', textStyle)
      .setOrigin(1, 0)
      .setDepth(999);

    /* Wave info: current wave, state, prep remaining. */
    this.waveText = this.add
      .text(x, padding + 72, 'Wave: ---', textStyle)
      .setOrigin(1, 0)
      .setDepth(999);
  }

  /**
   * Updates debug text at a throttled interval to avoid per-frame overhead.
   * Reads FPS from the Phaser game loop and entity counts from PoolManager.
   */
  update(time: number): void {
    /* Throttle updates to once per second. */
    if (time - this.lastUpdateTime < UPDATE_INTERVAL_MS) return;
    this.lastUpdateTime = time;

    /* Read FPS from Phaser's game loop. */
    const fps = Math.round(this.game.loop.actualFps);
    this.fpsText.setText(`FPS: ${fps}`);

    /* Color FPS red if below warning threshold. */
    if (fps < FPS_WARNING_THRESHOLD) {
      this.fpsText.setColor('#ff4a4a');
    } else {
      this.fpsText.setColor('#ffffff');
    }

    /* Read entity counts from PoolManager (stored on registry by Gameplay). */
    const poolManager = this.registry.get('poolManager') as PoolManager | undefined;
    if (poolManager) {
      const enemies = poolManager.getActiveEnemyCount();
      const projectiles = poolManager.getActiveProjectileCount();
      this.entityText.setText(`Enemies: ${enemies} / Projectiles: ${projectiles}`);
    }

    /* Read game seed from GameState (stored on registry by Gameplay). */
    const gameState = this.registry.get('gameState') as GameState | undefined;
    if (gameState) {
      this.seedText.setText(`Seed: ${gameState.gameSeed}`);
    }

    /* Read map data for path length and spawn/objective info. */
    const mapData = this.registry.get('mapData') as MapData | undefined;
    if (mapData) {
      const spawn = mapData.getSpawnPoint();
      const obj = mapData.getObjectivePoint();
      this.mapText.setText(
        `Path: ${mapData.getPathLength()} | S(${spawn.col},${spawn.row}) O(${obj.col},${obj.row})`,
      );
    }

    /* Read wave system state for wave number, state, and prep remaining. */
    const waveSystem = this.registry.get('waveSystem') as WaveSystem | undefined;
    if (waveSystem) {
      const wave = waveSystem.getCurrentWave();
      const total = waveSystem.getTotalWaves();
      const state = waveSystem.getState();
      const prepMs = waveSystem.getPrepTimeRemaining();
      const prepSec = Math.ceil(prepMs / 1000);
      this.waveText.setText(`Wave: ${wave}/${total} [${state}] Prep: ${prepSec}s`);
    }
  }
}
