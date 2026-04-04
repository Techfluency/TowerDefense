/**
 * Upgrade system -- tower upgrades, repair, HP tracking, and upgrade panel UI.
 *
 * Owns the full upgrade lifecycle:
 * - Tower selection via left-click (opens the UpgradePanel)
 * - Upgrade execution (currency deduction, stat tier increment, visual update)
 * - Repair execution (currency deduction, HP restoration, visual clear)
 * - Tower health bar rendering (shared Graphics, redrawn each frame)
 * - Damage state overlay (tint blending at HP thresholds)
 * - Visual tier evolution (tint + scale per tier)
 * - Upgrade flash animation (white tint + scale pop tween)
 * - Sell button delegation to BOLT-005 sell flow
 *
 * The UpgradePanel is a Phaser.GameObjects.Container built/destroyed on open/close.
 * Panel floats above-left of the selected tower, clamped to canvas bounds.
 *
 * Priority 6 in the system update order (after ProjectileSystem at 4).
 * update() handles: tower health bar rendering, damage state flicker.
 *
 * Registers on Phaser registry at key 'upgradeSystem' for BOLT-009 integration.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, PlacedTower } from '../types/game-types';
import type {
  TileClickedPayload,
  TowerUpgradedPayload,
  TowerRepairedPayload,
  TowerRemovedPayload,
  CurrencyChangedPayload,
} from '../types/events';
import type { ConfigManager } from '../utils/config-manager';
import type { TowerRegistry } from './tower-registry';
import { resolveEffectiveStats } from '../utils/stat-resolver';
import { DEPTH_TOWER_HEALTH_BARS, DEPTH_UI } from '../config/depth-layers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum repair cost in gold. */
const MIN_REPAIR_COST = 5;

/** HP-per-gold ratio for repair cost calculation: 1 gold per 5 HP. */
const HP_PER_GOLD = 5;

/** Sell refund rate: 50% of total invested. */
const SELL_REFUND_RATE = 0.5;

/** Panel dimensions and layout. */
const PANEL_WIDTH = 220;
const PANEL_PADDING = 10;
const PANEL_BG_COLOR = 0x1A1A2E;
const PANEL_BG_ALPHA = 0.92;
const PANEL_BORDER_COLOR = 0x4A4A6A;
const PANEL_CORNER_RADIUS = 6;

/** Button dimensions. */
const BTN_FULL_WIDTH = 200;
const BTN_UPGRADE_HEIGHT = 32;
const BTN_SMALL_HEIGHT = 28;
const BTN_GAP = 4;
const BTN_BG_COLOR = 0x2A2A4A;
const BTN_HOVER_COLOR = 0x3A3A5A;
const BTN_SELL_BG_COLOR = 0x4A2A2A;

/** Colors. */
const COLOR_TEXT_PRIMARY = '#E0E0E0';
const COLOR_CURRENCY = '#FFD700';
const COLOR_TIER_3_BADGE = '#FF6B35';
const COLOR_DISABLED_ALPHA = 0.4;
const COLOR_DAMAGE_RED = 0xFF4444;

/** Tier visual properties: tints per tower type per tier. */
const TIER_TINTS: Record<string, [number, number, number]> = {
  ranged:    [0xFFFFFF, 0xCCDDFF, 0xAABBFF],
  focused:   [0xFFFFFF, 0xCCCCFF, 0xAAAAFF],
  broadcast: [0xFFFFFF, 0xCCFFEE, 0xAAFFDD],
  antiair:   [0xFFFFFF, 0xCCDDFF, 0xAABBFF],
};

/** Tier scale values. */
const TIER_SCALES: [number, number, number] = [1.0, 1.1, 1.2];

/** Upgrade flash animation durations. */
const FLASH_DURATION_MS = 200;
const POP_DURATION_MS = 300;

/** Damage flicker cycle period in ms. */
const DAMAGE_FLICKER_PERIOD_MS = 2000;

/** Health bar dimensions. */
const HEALTH_BAR_WIDTH = 40;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_Y_OFFSET = -22;
const HEALTH_BAR_BG_COLOR = 0x333333;
const HEALTH_BAR_HIGH = 0x4AFF4A;
const HEALTH_BAR_MID = 0xFFD700;
const HEALTH_BAR_LOW = 0xFF4A4A;

/** Canvas bounds for panel clamping. */
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

/** Tower display names (same as BuildMenuPanel). */
const DISPLAY_NAMES: Record<string, string> = {
  ranged: 'Arrow Tower',
  focused: 'Sniper Tower',
  broadcast: 'Shockwave Tower',
  antiair: 'AA Missile',
};

export class UpgradeSystem extends BaseSystem {
  private readonly configManager: ConfigManager;
  private readonly towerRegistry: TowerRegistry;

  /** Reference to TowerPlacementSystem for placement mode check, set after construction. */
  private placementSystem: { isInPlacementMode(): boolean; enterPlacementMode(id: string): void } | null = null;

  /** The tower currently displayed in the panel, or null. */
  private selectedTowerId: string | null = null;

  /** The UpgradePanel container, created on open, destroyed on close. */
  private panelContainer: Phaser.GameObjects.Container | null = null;

  /** Shared Graphics for tower health bars (cleared + redrawn every frame). */
  private healthBarGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Active upgrade tween (stopped if player upgrades rapidly). */
  private activeUpgradeTween: Phaser.Tweens.Tween | null = null;

  /** Flag to disable interactions after GAME_OVER. */
  private gameOver = false;

  /** Cached panel text elements for live updates. */
  private panelElements: {
    hpText?: Phaser.GameObjects.Text;
    statTexts?: Phaser.GameObjects.Text[];
    nextStatTexts?: Phaser.GameObjects.Text[];
    upgradeBtn?: Phaser.GameObjects.Container;
    upgradeBtnBg?: Phaser.GameObjects.Graphics;
    upgradeBtnText?: Phaser.GameObjects.Text;
    repairBtn?: Phaser.GameObjects.Container;
    repairBtnBg?: Phaser.GameObjects.Graphics;
    repairBtnText?: Phaser.GameObjects.Text;
    sellBtnText?: Phaser.GameObjects.Text;
    tierText?: Phaser.GameObjects.Text;
    nextTierLabel?: Phaser.GameObjects.Text;
  } = {};

  constructor(
    scene: Phaser.Scene,
    gameState: GameState,
    configManager: ConfigManager,
    towerRegistry: TowerRegistry,
  ) {
    super(scene, gameState);
    this.configManager = configManager;
    this.towerRegistry = towerRegistry;
  }

  /**
   * Wires the TowerPlacementSystem reference after both systems are constructed.
   * Same bridge pattern as TowerCombatSystem.setProjectileSystem().
   */
  setTowerPlacementSystem(ps: { isInPlacementMode(): boolean; enterPlacementMode(id: string): void }): void {
    this.placementSystem = ps;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  init(): void {
    this.scene.registry.set('upgradeSystem', this);

    /* Resolve cross-system references from registry. */
    if (!this.placementSystem) {
      this.placementSystem = this.scene.registry.get('towerPlacementSystem') as
        { isInPlacementMode(): boolean; enterPlacementMode(id: string): void } | undefined
        ?? null;
    }

    /* Listen for tile clicks to open/close the panel. */
    this.listen(GAME_EVENTS.TILE_CLICKED, this.onTileClicked as (...args: never[]) => void);

    /* Listen for escape to close panel. */
    this.listen(GAME_EVENTS.INPUT_CANCEL, this.onInputCancel as (...args: never[]) => void);

    /* Listen for tower removal to auto-close panel. */
    this.listen(GAME_EVENTS.TOWER_REMOVED, this.onTowerRemoved as (...args: never[]) => void);

    /* Listen for currency changes to update button affordability. */
    this.listen(GAME_EVENTS.CURRENCY_CHANGED, this.onCurrencyChanged as (...args: never[]) => void);

    /* Listen for game over to disable interactions. */
    this.listen(GAME_EVENTS.GAME_OVER, this.onGameOver as (...args: never[]) => void);

    /* Create shared Graphics for tower health bars. */
    this.healthBarGraphics = this.scene.add.graphics();
    this.healthBarGraphics.setDepth(DEPTH_TOWER_HEALTH_BARS);
  }

  /**
   * Per-frame: redraws tower health bars and applies damage flicker.
   */
  update(time: number, _delta: number): void {
    this.renderHealthBars();
    this.applyDamageOverlays(time);
  }

  destroy(): void {
    this.close();

    if (this.healthBarGraphics) {
      this.healthBarGraphics.destroy();
      this.healthBarGraphics = null;
    }

    if (this.activeUpgradeTween) {
      this.activeUpgradeTween.stop();
      this.activeUpgradeTween = null;
    }

    this.scene.registry.remove('upgradeSystem');
    super.destroy();
  }

  // ---------------------------------------------------------------------------
  // Public API (for BOLT-009 integration)
  // ---------------------------------------------------------------------------

  /** Opens the UpgradePanel for the specified tower. */
  openForTower(towerId: string): void {
    const tower = this.towerRegistry.getTowerById(towerId);
    if (!tower) return;

    /* If already showing this tower, skip rebuild. */
    if (this.selectedTowerId === towerId && this.panelContainer) {
      this.refreshPanel();
      return;
    }

    this.close();
    this.selectedTowerId = towerId;
    this.buildPanel(tower);
  }

  /** Closes the UpgradePanel if open. */
  close(): void {
    if (this.panelContainer) {
      this.panelContainer.destroy();
      this.panelContainer = null;
    }
    this.selectedTowerId = null;
    this.panelElements = {};
  }

  /** Returns whether the UpgradePanel is currently visible. */
  isOpen(): boolean {
    return this.panelContainer !== null;
  }

  /** Returns the instanceId of the tower currently shown in the panel. */
  getSelectedTowerId(): string | null {
    return this.selectedTowerId;
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /**
   * On left-click: if not in placement mode and a tower exists at the tile,
   * open the panel for that tower. If no tower, close the panel.
   * If clicking build menu tower (entering placement mode), close panel.
   */
  private onTileClicked(payload: TileClickedPayload): void {
    if (this.gameOver) return;

    /* If placement mode is active, close upgrade panel (AC-007-04b). */
    if (this.placementSystem?.isInPlacementMode()) {
      this.close();
      return;
    }

    /* Check if a tower exists at the clicked tile. */
    const tower = this.towerRegistry.getTowerAt(payload.col, payload.row);
    if (tower) {
      this.openForTower(tower.instanceId);
    } else {
      /* Clicked empty tile -- close panel (AC-007-04a). */
      this.close();
    }
  }

  /** Escape closes the panel (AC-007-04c). */
  private onInputCancel(): void {
    if (this.isOpen()) {
      this.close();
    }
  }

  /** Tower sold -- auto-close panel if showing that tower. */
  private onTowerRemoved(payload: TowerRemovedPayload): void {
    if (this.selectedTowerId === payload.towerId) {
      this.close();
    }
  }

  /** Currency changed -- refresh button affordability live (AC-007-09b). */
  private onCurrencyChanged(_payload: CurrencyChangedPayload): void {
    if (this.isOpen()) {
      this.refreshPanel();
    }
  }

  /** Game over -- close panel and disable. */
  private onGameOver(): void {
    this.gameOver = true;
    this.close();
  }

  // ---------------------------------------------------------------------------
  // Panel construction
  // ---------------------------------------------------------------------------

  /**
   * Builds the UpgradePanel Container for a given tower.
   * Layout per spec: header, tier badge, HP bar, separator, stats, next tier,
   * separator, upgrade button, repair button, sell button.
   */
  private buildPanel(tower: PlacedTower): void {
    const stats = resolveEffectiveStats(tower, this.configManager);
    const upgrades = this.configManager.getUpgrades(tower.towerType);
    const nextTier = upgrades.find(u => u.tier === tower.upgradeLevel + 1);
    const isMaxTier = tower.upgradeLevel >= 3;
    const def = this.configManager.getTower(tower.towerType);

    /* Calculate panel position: above-left of tower, clamped to canvas. */
    let panelX = tower.worldX - 120;
    let panelY = tower.worldY - 20; /* Will be adjusted after measuring height. */

    /* Elements array to track all children. */
    const elements: Phaser.GameObjects.GameObject[] = [];
    let yPos = PANEL_PADDING;

    /* --- Header: tower name + tier badge --- */
    const displayName = DISPLAY_NAMES[tower.towerType] ?? def.name;
    const tierLabel = isMaxTier ? 'MAX LEVEL' : `Tier ${tower.upgradeLevel}`;
    const tierColor = isMaxTier ? COLOR_TIER_3_BADGE
      : tower.upgradeLevel >= 2 ? COLOR_CURRENCY : COLOR_TEXT_PRIMARY;

    const nameText = this.scene.add.text(PANEL_PADDING, yPos, displayName, {
      fontSize: '14px', fontFamily: 'monospace', color: COLOR_TEXT_PRIMARY,
    });
    elements.push(nameText);

    const tierText = this.scene.add.text(
      PANEL_WIDTH - PANEL_PADDING, yPos + 2, tierLabel,
      { fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: tierColor },
    ).setOrigin(1, 0);
    elements.push(tierText);
    this.panelElements.tierText = tierText;

    yPos += 22;

    /* --- HP bar --- */
    const hpRatio = stats.maxHp > 0 ? tower.currentHp / stats.maxHp : 1;
    const hpBarBg = this.scene.add.graphics();
    hpBarBg.fillStyle(HEALTH_BAR_BG_COLOR, 1);
    hpBarBg.fillRect(PANEL_PADDING, yPos, BTN_FULL_WIDTH, 6);
    elements.push(hpBarBg);

    const hpBarFill = this.scene.add.graphics();
    const hpColor = hpRatio > 0.5 ? HEALTH_BAR_HIGH : hpRatio > 0.25 ? HEALTH_BAR_MID : HEALTH_BAR_LOW;
    hpBarFill.fillStyle(hpColor, 1);
    hpBarFill.fillRect(PANEL_PADDING, yPos, BTN_FULL_WIDTH * hpRatio, 6);
    elements.push(hpBarFill);

    yPos += 10;

    const hpText = this.scene.add.text(
      PANEL_PADDING, yPos, `${tower.currentHp} / ${stats.maxHp} HP`,
      { fontSize: '11px', fontFamily: 'monospace', color: COLOR_TEXT_PRIMARY },
    );
    elements.push(hpText);
    this.panelElements.hpText = hpText;

    yPos += 18;

    /* --- Separator --- */
    const sep1 = this.scene.add.graphics();
    sep1.lineStyle(1, PANEL_BORDER_COLOR, 0.6);
    sep1.lineBetween(PANEL_PADDING, yPos, PANEL_WIDTH - PANEL_PADDING, yPos);
    elements.push(sep1);
    yPos += 6;

    /* --- Current stats --- */
    const statLabels = [
      `DMG: ${stats.damage}`,
      `SPD: ${stats.fireRate}/s`,
      `RNG: ${stats.range}px`,
    ];
    const statTexts: Phaser.GameObjects.Text[] = [];
    for (const label of statLabels) {
      const t = this.scene.add.text(PANEL_PADDING, yPos, label, {
        fontSize: '12px', fontFamily: 'monospace', color: COLOR_TEXT_PRIMARY,
      });
      elements.push(t);
      statTexts.push(t);
      yPos += 16;
    }
    this.panelElements.statTexts = statTexts;

    /* --- Next tier preview (only below tier 3) --- */
    const nextStatTexts: Phaser.GameObjects.Text[] = [];
    if (!isMaxTier && nextTier) {
      yPos += 2;
      const nextLabel = this.scene.add.text(PANEL_PADDING, yPos, 'Next Tier:', {
        fontSize: '11px', fontFamily: 'monospace', color: COLOR_TEXT_PRIMARY,
      });
      elements.push(nextLabel);
      this.panelElements.nextTierLabel = nextLabel;
      yPos += 16;

      const comparisons = [
        { label: 'DMG', current: stats.damage, next: nextTier.damage },
        { label: 'SPD', current: stats.fireRate, next: nextTier.fireRate },
        { label: 'RNG', current: stats.range, next: nextTier.range },
      ];

      for (const c of comparisons) {
        const improved = c.next > c.current;
        const nextColor = improved ? COLOR_CURRENCY : COLOR_TEXT_PRIMARY;
        const t = this.scene.add.text(
          PANEL_PADDING, yPos,
          `${c.label}: ${c.current} -> ${c.next}`,
          { fontSize: '12px', fontFamily: 'monospace', color: nextColor },
        );
        elements.push(t);
        nextStatTexts.push(t);
        yPos += 16;
      }
    }
    this.panelElements.nextStatTexts = nextStatTexts;

    yPos += 4;

    /* --- Separator --- */
    const sep2 = this.scene.add.graphics();
    sep2.lineStyle(1, PANEL_BORDER_COLOR, 0.6);
    sep2.lineBetween(PANEL_PADDING, yPos, PANEL_WIDTH - PANEL_PADDING, yPos);
    elements.push(sep2);
    yPos += 6;

    /* --- Upgrade button (only below tier 3) --- */
    if (!isMaxTier && nextTier) {
      const canAffordUpgrade = this.gameState.currency >= nextTier.cost;
      const { container: upgradeBtn, bg: upgradeBg, label: upgradeLabel } = this.createButton(
        PANEL_PADDING, yPos, BTN_FULL_WIDTH, BTN_UPGRADE_HEIGHT,
        `Upgrade: ${nextTier.cost}g`, '13px', BTN_BG_COLOR,
        canAffordUpgrade,
        () => this.executeUpgrade(),
      );
      elements.push(upgradeBtn);
      this.panelElements.upgradeBtn = upgradeBtn;
      this.panelElements.upgradeBtnBg = upgradeBg;
      this.panelElements.upgradeBtnText = upgradeLabel;
      yPos += BTN_UPGRADE_HEIGHT + BTN_GAP;
    }

    /* --- Repair button --- */
    const repairCost = this.calcRepairCost(tower, stats.maxHp);
    const canRepair = tower.currentHp < stats.maxHp && this.gameState.currency >= repairCost && repairCost > 0;
    const repairLabel = tower.currentHp >= stats.maxHp ? 'Repair: 0g' : `Repair: ${repairCost}g`;
    const { container: repairBtn, bg: repairBg, label: repairText } = this.createButton(
      PANEL_PADDING, yPos, BTN_FULL_WIDTH, BTN_SMALL_HEIGHT,
      repairLabel, '12px', BTN_BG_COLOR,
      canRepair,
      () => this.executeRepair(),
    );
    elements.push(repairBtn);
    this.panelElements.repairBtn = repairBtn;
    this.panelElements.repairBtnBg = repairBg;
    this.panelElements.repairBtnText = repairText;
    yPos += BTN_SMALL_HEIGHT + BTN_GAP;

    /* --- Sell button --- */
    const refund = Math.floor(tower.totalInvested * SELL_REFUND_RATE);
    const { container: sellBtn, label: sellText } = this.createButton(
      PANEL_PADDING, yPos, BTN_FULL_WIDTH, BTN_SMALL_HEIGHT,
      `Sell: +${refund}g`, '12px', BTN_SELL_BG_COLOR,
      true,
      () => this.executeSell(),
    );
    elements.push(sellBtn);
    this.panelElements.sellBtnText = sellText;
    yPos += BTN_SMALL_HEIGHT + PANEL_PADDING;

    /* --- Panel background --- */
    const panelHeight = yPos;
    const bg = this.scene.add.graphics();
    bg.fillStyle(PANEL_BG_COLOR, PANEL_BG_ALPHA);
    bg.fillRoundedRect(0, 0, PANEL_WIDTH, panelHeight, PANEL_CORNER_RADIUS);
    bg.lineStyle(1, PANEL_BORDER_COLOR, 1);
    bg.strokeRoundedRect(0, 0, PANEL_WIDTH, panelHeight, PANEL_CORNER_RADIUS);

    /* Block click-through on the panel background. */
    bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, PANEL_WIDTH, panelHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    /* Clamp panel position to canvas bounds. */
    panelY = tower.worldY - panelHeight - 20;
    panelX = Math.max(0, Math.min(panelX, CANVAS_WIDTH - PANEL_WIDTH));
    panelY = Math.max(0, Math.min(panelY, CANVAS_HEIGHT - panelHeight));

    /* Build container. Background first, then elements on top. */
    this.panelContainer = this.scene.add.container(panelX, panelY);
    this.panelContainer.setDepth(DEPTH_UI);
    this.panelContainer.add(bg);
    for (const el of elements) {
      this.panelContainer.add(el);
    }
  }

  /**
   * Creates a styled button as a Container with background, text, and click handling.
   *
   * @returns Container, background Graphics, and label Text references.
   */
  private createButton(
    x: number, y: number, width: number, height: number,
    text: string, fontSize: string, bgColor: number,
    enabled: boolean,
    onClick: () => void,
  ): { container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(0, 0, width, height, 4);
    container.add(bg);

    const label = this.scene.add.text(width / 2, height / 2, text, {
      fontSize, fontFamily: 'monospace', color: COLOR_CURRENCY,
    }).setOrigin(0.5);
    container.add(label);

    container.setAlpha(enabled ? 1 : COLOR_DISABLED_ALPHA);

    if (enabled) {
      container.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, width, height),
        Phaser.Geom.Rectangle.Contains,
      );

      container.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(BTN_HOVER_COLOR, 1);
        bg.fillRoundedRect(0, 0, width, height, 4);
      });

      container.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(bgColor, 1);
        bg.fillRoundedRect(0, 0, width, height, 4);
      });

      container.on('pointerdown', onClick);
    }

    return { container, bg, label };
  }

  /**
   * Refreshes the panel contents without rebuild (e.g., after currency change).
   * Re-evaluates button affordability and updates text values.
   */
  private refreshPanel(): void {
    if (!this.selectedTowerId || !this.panelContainer) return;

    const tower = this.towerRegistry.getTowerById(this.selectedTowerId);
    if (!tower) {
      this.close();
      return;
    }

    /* Full rebuild is simpler and handles all state transitions cleanly.
     * Panel construction is cheap (max 30 towers, panel open for one). */
    const towerId = this.selectedTowerId;
    this.close();
    this.openForTower(towerId);
  }

  // ---------------------------------------------------------------------------
  // Upgrade execution
  // ---------------------------------------------------------------------------

  /**
   * Executes an upgrade on the currently selected tower.
   * Validates currency, increments tier, updates stats, plays animation.
   */
  private executeUpgrade(): void {
    if (!this.selectedTowerId) return;

    const tower = this.towerRegistry.getTowerById(this.selectedTowerId);
    if (!tower || tower.upgradeLevel >= 3) return;

    const upgrades = this.configManager.getUpgrades(tower.towerType);
    const nextTier = upgrades.find(u => u.tier === tower.upgradeLevel + 1);
    if (!nextTier) return;

    /* Validate currency. */
    if (this.gameState.currency < nextTier.cost) return;

    /* Deduct currency (provisional -- BOLT-008 will formalize). */
    this.gameState.currency -= nextTier.cost;
    this.emitCurrencyChanged(-nextTier.cost, 'tower_upgrade');

    /* Update tower state. */
    tower.upgradeLevel = nextTier.tier;
    tower.totalInvested += nextTier.cost;

    /* Adjust currentHp: if maxHp increased, increase currentHp proportionally.
     * If tower was at full HP, set to new maxHp. */
    const oldMaxHp = resolveEffectiveStats(
      { towerType: tower.towerType, upgradeLevel: nextTier.tier - 1 },
      this.configManager,
    ).maxHp;
    const newMaxHp = nextTier.maxHp;
    if (tower.currentHp >= oldMaxHp) {
      /* Was at full HP: grant full new maxHp. */
      tower.currentHp = newMaxHp;
    } else {
      /* Partial HP: keep the same HP ratio. */
      const ratio = tower.currentHp / oldMaxHp;
      tower.currentHp = Math.round(ratio * newMaxHp);
    }

    /* Update registry. */
    this.towerRegistry.upgradeTower(tower.instanceId, nextTier.tier);

    /* Apply visual tier evolution (tint + scale). */
    this.applyTierVisuals(tower);

    /* Play upgrade flash animation. */
    this.playUpgradeAnimation(tower);

    /* Emit TOWER_UPGRADED event. */
    const payload: TowerUpgradedPayload = {
      towerId: tower.instanceId,
      towerType: tower.towerType,
      newTier: nextTier.tier,
      cost: nextTier.cost,
    };
    this.emit(GAME_EVENTS.TOWER_UPGRADED, payload);

    /* Refresh the panel to show new tier. */
    this.refreshPanel();
  }

  // ---------------------------------------------------------------------------
  // Repair execution
  // ---------------------------------------------------------------------------

  /**
   * Executes a repair on the currently selected tower.
   * Restores to max HP, deducts currency, clears damage visual.
   */
  private executeRepair(): void {
    if (!this.selectedTowerId) return;

    const tower = this.towerRegistry.getTowerById(this.selectedTowerId);
    if (!tower) return;

    const stats = resolveEffectiveStats(tower, this.configManager);
    if (tower.currentHp >= stats.maxHp) return;

    const repairCost = this.calcRepairCost(tower, stats.maxHp);
    if (this.gameState.currency < repairCost) return;

    /* Deduct currency. */
    this.gameState.currency -= repairCost;
    this.emitCurrencyChanged(-repairCost, 'tower_repair');

    const hpRestored = stats.maxHp - tower.currentHp;
    tower.currentHp = stats.maxHp;

    /* Clear damage overlay by reapplying tier visuals. */
    this.applyTierVisuals(tower);

    /* Emit TOWER_REPAIRED event. */
    const payload: TowerRepairedPayload = {
      towerId: tower.instanceId,
      towerType: tower.towerType,
      hpRestored,
      cost: repairCost,
      newHp: stats.maxHp,
    };
    this.emit(GAME_EVENTS.TOWER_REPAIRED, payload);

    /* Refresh panel. */
    this.refreshPanel();
  }

  // ---------------------------------------------------------------------------
  // Sell delegation
  // ---------------------------------------------------------------------------

  /**
   * Delegates sell to the existing BOLT-005 flow by emitting TOWER_REMOVED
   * and handling sprite destruction + currency credit directly.
   */
  private executeSell(): void {
    if (!this.selectedTowerId) return;

    const tower = this.towerRegistry.getTowerById(this.selectedTowerId);
    if (!tower) return;

    const refund = Math.floor(tower.totalInvested * SELL_REFUND_RATE);

    /* Remove from registry. */
    this.towerRegistry.removeTower(tower.instanceId);

    /* Destroy sprite. */
    tower.sprite.destroy();

    /* Credit currency. */
    this.gameState.currency += refund;
    this.emitCurrencyChanged(refund, 'tower_sell');

    /* Emit TOWER_REMOVED event (same as BOLT-005 sell). */
    const payload: TowerRemovedPayload = {
      towerId: tower.instanceId,
      towerType: tower.towerType,
      col: tower.col,
      row: tower.row,
      refundAmount: refund,
    };
    this.emit(GAME_EVENTS.TOWER_REMOVED, payload);

    /* Panel auto-closes via onTowerRemoved listener. */
  }

  // ---------------------------------------------------------------------------
  // Visual tier effects
  // ---------------------------------------------------------------------------

  /**
   * Applies the visual tier tint and scale to a tower sprite.
   * Called after upgrade and after repair (to restore tier visuals).
   */
  private applyTierVisuals(tower: PlacedTower): void {
    const tierIndex = tower.upgradeLevel - 1;
    const tints = TIER_TINTS[tower.towerType] ?? [0xFFFFFF, 0xFFFFFF, 0xFFFFFF];
    const tint = tints[tierIndex] ?? 0xFFFFFF;
    const scale = TIER_SCALES[tierIndex] ?? 1.0;

    tower.sprite.setTint(tint);
    tower.sprite.setScale(scale);
  }

  /**
   * Plays the upgrade flash: white tint for 200ms, then scale pop to 1.15x
   * and settle to the new tier scale over 300ms total.
   */
  private playUpgradeAnimation(tower: PlacedTower): void {
    /* Stop any in-flight tween (rapid upgrade clicks). */
    if (this.activeUpgradeTween) {
      this.activeUpgradeTween.stop();
      this.activeUpgradeTween = null;
    }

    const tierIndex = tower.upgradeLevel - 1;
    const targetScale = TIER_SCALES[tierIndex] ?? 1.0;
    const tints = TIER_TINTS[tower.towerType] ?? [0xFFFFFF, 0xFFFFFF, 0xFFFFFF];
    const targetTint = tints[tierIndex] ?? 0xFFFFFF;

    /* Phase 1: white flash. */
    tower.sprite.setTint(0xFFFFFF);

    this.scene.time.delayedCall(FLASH_DURATION_MS, () => {
      /* Restore tier tint after flash. */
      if (tower.sprite && tower.sprite.active) {
        tower.sprite.setTint(targetTint);
      }
    });

    /* Phase 2: scale pop (overlaps with flash start). */
    this.activeUpgradeTween = this.scene.tweens.add({
      targets: tower.sprite,
      scaleX: { from: tower.sprite.scaleX, to: 1.15 },
      scaleY: { from: tower.sprite.scaleY, to: 1.15 },
      duration: POP_DURATION_MS * 0.4,
      ease: 'Quad.easeOut',
      yoyo: false,
      onComplete: () => {
        /* Settle to target tier scale. */
        this.activeUpgradeTween = this.scene.tweens.add({
          targets: tower.sprite,
          scaleX: targetScale,
          scaleY: targetScale,
          duration: POP_DURATION_MS * 0.6,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.activeUpgradeTween = null;
          },
        });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Tower health bars (shared Graphics, redrawn per frame)
  // ---------------------------------------------------------------------------

  /**
   * Clears and redraws health bars for all damaged towers.
   * Only draws for towers with currentHp < maxHp.
   */
  private renderHealthBars(): void {
    if (!this.healthBarGraphics) return;

    this.healthBarGraphics.clear();

    const towers = this.towerRegistry.getPlacedTowers();
    for (const tower of towers) {
      const stats = resolveEffectiveStats(tower, this.configManager);
      if (stats.maxHp <= 0 || tower.currentHp >= stats.maxHp) continue;

      const hpRatio = tower.currentHp / stats.maxHp;
      const barX = tower.worldX - HEALTH_BAR_WIDTH / 2;
      const barY = tower.worldY + HEALTH_BAR_Y_OFFSET;

      /* Background. */
      this.healthBarGraphics.fillStyle(HEALTH_BAR_BG_COLOR, 1);
      this.healthBarGraphics.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

      /* Fill. */
      const color = hpRatio > 0.5 ? HEALTH_BAR_HIGH : hpRatio > 0.25 ? HEALTH_BAR_MID : HEALTH_BAR_LOW;
      this.healthBarGraphics.fillStyle(color, 1);
      this.healthBarGraphics.fillRect(barX, barY, HEALTH_BAR_WIDTH * hpRatio, HEALTH_BAR_HEIGHT);
    }
  }

  // ---------------------------------------------------------------------------
  // Damage state overlay (tint blending at HP thresholds)
  // ---------------------------------------------------------------------------

  /**
   * Applies damage tint overlay on tower sprites based on HP ratio.
   * - 0-30% HP lost: no damage indicator
   * - 31-60% HP lost: light red tint at 0.2 strength
   * - >60% HP lost: heavy red tint at 0.4 strength + flicker
   */
  private applyDamageOverlays(time: number): void {
    const towers = this.towerRegistry.getPlacedTowers();

    for (const tower of towers) {
      const stats = resolveEffectiveStats(tower, this.configManager);
      if (stats.maxHp <= 0) continue;

      const hpLostRatio = 1 - (tower.currentHp / stats.maxHp);

      if (hpLostRatio <= 0.3) {
        /* No damage -- ensure tier visuals are correct (may have been repaired). */
        continue;
      }

      const tierIndex = tower.upgradeLevel - 1;
      const tints = TIER_TINTS[tower.towerType] ?? [0xFFFFFF, 0xFFFFFF, 0xFFFFFF];
      const baseTint = tints[tierIndex] ?? 0xFFFFFF;

      if (hpLostRatio > 0.6) {
        /* Heavy damage: red tint at 0.4 strength + flicker. */
        const blended = this.blendTint(baseTint, COLOR_DAMAGE_RED, 0.4);
        tower.sprite.setTint(blended);

        /* Flicker alpha between 0.85 and 1.0 on a 2-second sine wave. */
        const flickerPhase = Math.sin((time % DAMAGE_FLICKER_PERIOD_MS) / DAMAGE_FLICKER_PERIOD_MS * Math.PI * 2);
        const alpha = 0.925 + 0.075 * flickerPhase; /* oscillates 0.85 to 1.0 */
        tower.sprite.setAlpha(alpha);
      } else {
        /* Light damage: red tint at 0.2 strength, no flicker. */
        const blended = this.blendTint(baseTint, COLOR_DAMAGE_RED, 0.2);
        tower.sprite.setTint(blended);
        tower.sprite.setAlpha(1.0);
      }
    }
  }

  /**
   * Blends two hex colors by a ratio. ratio=0 returns base, ratio=1 returns overlay.
   */
  private blendTint(base: number, overlay: number, ratio: number): number {
    const bR = (base >> 16) & 0xFF;
    const bG = (base >> 8) & 0xFF;
    const bB = base & 0xFF;
    const oR = (overlay >> 16) & 0xFF;
    const oG = (overlay >> 8) & 0xFF;
    const oB = overlay & 0xFF;

    const r = Math.round(bR + (oR - bR) * ratio);
    const g = Math.round(bG + (oG - bG) * ratio);
    const b = Math.round(bB + (oB - bB) * ratio);

    return (r << 16) | (g << 8) | b;
  }

  // ---------------------------------------------------------------------------
  // Cost calculations
  // ---------------------------------------------------------------------------

  /**
   * Calculates repair cost: 1 gold per 5 HP missing, minimum 5 gold.
   * Returns 0 if tower is at full HP.
   */
  private calcRepairCost(tower: PlacedTower, maxHp: number): number {
    const missing = maxHp - tower.currentHp;
    if (missing <= 0) return 0;
    return Math.max(MIN_REPAIR_COST, Math.ceil(missing / HP_PER_GOLD));
  }

  // ---------------------------------------------------------------------------
  // Currency event helper
  // ---------------------------------------------------------------------------

  /**
   * Emits CURRENCY_CHANGED event after a currency mutation.
   * Provisional -- BOLT-008 may formalize this into a central API.
   */
  private emitCurrencyChanged(delta: number, reason: string): void {
    const payload: CurrencyChangedPayload = {
      newAmount: this.gameState.currency,
      delta,
      reason,
    };
    this.emit(GAME_EVENTS.CURRENCY_CHANGED, payload);
  }
}
