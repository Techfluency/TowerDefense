/**
 * Tower placement system -- handles the full tower purchase and sell lifecycle.
 *
 * Responsibilities:
 * - Renders the build menu panel on the right side of the screen
 * - Manages placement mode state machine (inactive/active-valid/active-invalid)
 * - Creates and updates the placement ghost sprite and range preview circle
 * - Validates placement against MapData.isBuildable() and TowerRegistry.isOccupied()
 * - Commits placement: creates tower sprite, deducts currency, emits TOWER_PLACED
 * - Handles sell interaction: right-click on placed tower, tooltip, confirm sell
 * - Deactivates on GAME_OVER event
 *
 * Extends BaseSystem for lifecycle management and auto-cleanup of event listeners.
 */
import Phaser from 'phaser';
import { BaseSystem } from './base-system';
import { GAME_EVENTS } from '../types/game-types';
import type { GameState, TowerDefinition } from '../types/game-types';
import type { TileClickedPayload, TileHoverPayload, TowerPlacedPayload, TowerRemovedPayload, TouchDoubleTapPayload } from '../types/events';
import type { ConfigManager } from '../utils/config-manager';
import type { EconomySystem } from './economy-system';
import { resolveEffectiveStats } from '../utils/stat-resolver';
import type { TowerRegistry } from './tower-registry';
import type { MapData } from '../data/map-data';
import { TILE_SIZE, MAP_OFFSET_Y } from '../config/performance-budget';
import { DEPTH_TOWERS, DEPTH_PLACEMENT_GHOST, DEPTH_RANGE_PREVIEW, DEPTH_UI } from '../config/depth-layers';

// ---------------------------------------------------------------------------
// Build Menu Visual Constants
// ---------------------------------------------------------------------------

/** Build menu panel width in pixels. */
const MENU_WIDTH = 160;
/** Padding inside the build menu panel. */
const MENU_PADDING = 8;
/** Gap between tower buttons. */
const BUTTON_GAP = 6;
/** Tower button dimensions. */
const BUTTON_WIDTH = 144;
const BUTTON_HEIGHT = 56;
/** Build menu background color. */
const MENU_BG_COLOR = 0x1A1A2E;
const MENU_BG_ALPHA = 0.85;
/** Build menu border color. */
const MENU_BORDER_COLOR = 0x4A4A6A;
/** Tower button colors. */
const BTN_BG_COLOR = 0x2A2A4A;
const BTN_HOVER_COLOR = 0x3A3A5A;
const BTN_SELECTED_COLOR = 0x4A4A7A;
const BTN_ACCENT_COLOR = 0x6A6AFF;
/** Currency display gold color. */
const CURRENCY_COLOR = '#FFD700';
/** Primary text color. */
const TEXT_PRIMARY = '#E0E0E0';
/** Disabled alpha for unaffordable towers. */
const DISABLED_ALPHA = 0.4;
/** Ghost alpha values. */
const GHOST_VALID_ALPHA = 0.7;
const GHOST_INVALID_ALPHA = 0.5;
/** Ghost tint values. */
const TINT_VALID = 0x44FF44;
const TINT_INVALID = 0xFF4444;
const TINT_REJECT_FLASH = 0xFF0000;
/** Rejection flash duration in ms. */
const REJECT_FLASH_MS = 200;
/** Range circle visual. */
const RANGE_STROKE_COLOR = 0xFFFFFF;
const RANGE_STROKE_ALPHA = 0.35;
const RANGE_LINE_WIDTH = 1.5;
/** Sell tooltip colors. */
const TOOLTIP_BG_COLOR = 0x1A1A2E;
const TOOLTIP_BG_ALPHA = 0.9;
const TOOLTIP_BORDER_COLOR = 0x4A4A6A;
/** Sell tooltip Y offset above the tower. */
const TOOLTIP_Y_OFFSET = -40;

/** Tower display names shortened for button width. */
const DISPLAY_NAMES: Record<string, string> = {
  ranged: 'Arrow Tower',
  focused: 'Sniper Tower',
  broadcast: 'Shockwave Tower',
  antiair: 'AA Missile',
};

/** Internal state for each tower button in the build menu. */
interface TowerButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  definition: TowerDefinition;
  affordable: boolean;
}

export class TowerPlacementSystem extends BaseSystem {
  private readonly configManager: ConfigManager;
  private readonly towerRegistry: TowerRegistry;

  /** EconomySystem reference for centralized currency spending. Set after construction. */
  private economySystem: EconomySystem | null = null;

  /** MapData reference, resolved after MAP_READY fires. */
  private mapData: MapData | null = null;

  // --- Build Menu ---
  private menuContainer!: Phaser.GameObjects.Container;
  private currencyText!: Phaser.GameObjects.Text;
  private towerButtons: TowerButton[] = [];
  /** X position of the build menu left edge (used for ghost hide check). */
  private menuLeftX = 0;

  // --- Placement Mode ---
  private placementActive = false;
  private selectedTowerDef: TowerDefinition | null = null;
  private ghostSprite: Phaser.GameObjects.Sprite | null = null;
  private rangeGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Whether current ghost position is valid for placement. */
  private ghostValid = false;
  /** Whether the ghost is currently flashing from a rejected placement click. */
  private isRejectFlashing = false;
  /** Timer handle for rejection flash reset. */
  private rejectFlashTimer: Phaser.Time.TimerEvent | null = null;

  // --- Sell State ---
  /** The tower currently showing a sell tooltip, null if none. */
  private sellTargetId: string | null = null;
  /** Grid column of the tower with the active sell tooltip (for hover dismiss). */
  private sellTargetCol = -1;
  /** Grid row of the tower with the active sell tooltip (for hover dismiss). */
  private sellTargetRow = -1;
  private sellTooltip: Phaser.GameObjects.Container | null = null;

  /** Flag to disable all interactions after GAME_OVER. */
  private gameOver = false;

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
   * Injects the EconomySystem reference for centralized currency spending.
   * Called by Gameplay.create() after both systems are constructed.
   *
   * @param economy - The EconomySystem instance that owns all currency mutations.
   */
  setEconomySystem(economy: EconomySystem): void {
    this.economySystem = economy;
  }

  /**
   * Wires event listeners and creates the build menu panel.
   * Uses listen() for auto-cleanup via BaseSystem.destroy().
   */
  init(): void {
    /* Resolve MapData -- check registry first (may already exist), else wait for event. */
    const existingMapData = this.scene.registry.get('mapData') as MapData | undefined;
    if (existingMapData) {
      this.mapData = existingMapData;
    }
    this.listen(GAME_EVENTS.MAP_READY, this.handleMapReady as (...args: never[]) => void);

    /* Core placement events. */
    this.listen(GAME_EVENTS.TILE_HOVER_CHANGED, this.handleTileHover as (...args: never[]) => void);
    this.listen(GAME_EVENTS.TILE_CLICKED, this.handleTileClicked as (...args: never[]) => void);
    this.listen(GAME_EVENTS.INPUT_CANCEL, this.handleInputCancel as (...args: never[]) => void);

    /* Game lifecycle. */
    this.listen(GAME_EVENTS.GAME_OVER, this.handleGameOver as (...args: never[]) => void);

    /* Right-click handler for sell interaction (separate from INPUT_CANCEL).
     * InputSystem emits INPUT_CANCEL on right-click, but we also need
     * the raw pointer to know which tile was right-clicked for sell. */
    this.scene.input.on('pointerdown', this.handlePointerDown, this);

    /* BOLT-022: Double-tap on a tower triggers sell flow on mobile.
     * This replaces the right-click sell interaction for touch devices. */
    this.listen(GAME_EVENTS.TOUCH_DOUBLE_TAP, this.handleDoubleTap as (...args: never[]) => void);

    this.createBuildMenu();
  }

  /**
   * Refreshes build menu affordability each frame.
   * Placement ghost updates are event-driven (TILE_HOVER_CHANGED), not per-frame.
   */
  update(_time: number, _delta: number): void {
    if (this.gameOver) return;
    this.refreshAffordability();
  }

  // ---------------------------------------------------------------------------
  // Build Menu
  // ---------------------------------------------------------------------------

  /**
   * Creates the build menu panel with currency display and 4 tower buttons.
   * Positioned on the right side of the canvas per D5 design decision.
   */
  private createBuildMenu(): void {
    const allTowers = this.configManager.getAllTowers();

    /* BOLT-021: Filter towers by progression unlock state.
     * Only show towers the player has unlocked. ProgressionManager is on registry.
     * Falls back to showing all non-utility towers if progression is unavailable. */
    const pm = this.scene.registry.get('progressionManager') as
      { isTowerUnlocked(id: string): boolean } | undefined;
    const towers = allTowers.filter(t => {
      if (t.towerClass === 'utility') return false;
      return pm ? pm.isTowerUnlocked(t.id) : true;
    });

    /* Calculate panel position. Game width is 1280 per game-config. */
    const gameWidth = Number(this.scene.game.config.width);
    const panelX = gameWidth - MENU_WIDTH - 4;
    const panelY = 40;
    this.menuLeftX = panelX;

    this.menuContainer = this.scene.add.container(panelX, panelY).setDepth(DEPTH_UI);

    /* Panel background with border. */
    const panelHeight = MENU_PADDING + 24 + 4 + (BUTTON_HEIGHT + BUTTON_GAP) * towers.length + MENU_PADDING;
    const bg = this.scene.add.graphics();
    bg.fillStyle(MENU_BG_COLOR, MENU_BG_ALPHA);
    bg.fillRoundedRect(0, 0, MENU_WIDTH, panelHeight, 4);
    bg.lineStyle(1, MENU_BORDER_COLOR, 1);
    bg.strokeRoundedRect(0, 0, MENU_WIDTH, panelHeight, 4);
    this.menuContainer.add(bg);

    /* Currency display at top of panel. */
    this.currencyText = this.scene.add.text(
      MENU_PADDING,
      MENU_PADDING,
      `${this.gameState.currency}`,
      { fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: CURRENCY_COLOR },
    );
    this.menuContainer.add(this.currencyText);

    /* Separator line below currency. */
    const sep = this.scene.add.graphics();
    sep.lineStyle(1, MENU_BORDER_COLOR, 0.6);
    sep.lineBetween(MENU_PADDING, 28, MENU_WIDTH - MENU_PADDING, 28);
    this.menuContainer.add(sep);

    /* Tower buttons. */
    let buttonY = 34;
    for (const def of towers) {
      const btn = this.createTowerButton(def, MENU_PADDING, buttonY);
      this.towerButtons.push(btn);
      this.menuContainer.add(btn.container);
      buttonY += BUTTON_HEIGHT + BUTTON_GAP;
    }

    /* Set interactive on the entire menu container background to block click-through. */
    bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, MENU_WIDTH, panelHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    this.refreshAffordability();
  }

  /**
   * Creates a single tower button as a Container with background, icon, name, and cost.
   */
  private createTowerButton(def: TowerDefinition, x: number, y: number): TowerButton {
    const container = this.scene.add.container(x, y);

    /* Button background. */
    const bg = this.scene.add.graphics();
    bg.fillStyle(BTN_BG_COLOR, 1);
    bg.fillRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
    container.add(bg);

    /* Tower icon sprite (24x24, left side). */
    const icon = this.scene.add.sprite(16, BUTTON_HEIGHT / 2, def.spriteKey);
    icon.setDisplaySize(24, 24);
    container.add(icon);

    /* Tower name text. */
    const displayName = DISPLAY_NAMES[def.id] ?? def.name;
    const nameText = this.scene.add.text(32, 8, displayName, {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: TEXT_PRIMARY,
    });
    container.add(nameText);

    /* Tower cost text. */
    const costText = this.scene.add.text(32, 28, `${def.cost}`, {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: CURRENCY_COLOR,
    });
    container.add(costText);

    /* Make button interactive. */
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    );

    container.on('pointerover', () => {
      if (this.gameOver) return;
      const btn = this.towerButtons.find(b => b.definition.id === def.id);
      if (!btn?.affordable) return;
      /* Only show hover if not already selected. */
      if (this.selectedTowerDef?.id !== def.id) {
        btn.bg.clear();
        btn.bg.fillStyle(BTN_HOVER_COLOR, 1);
        btn.bg.fillRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
      }
    });

    container.on('pointerout', () => {
      if (this.gameOver) return;
      const btn = this.towerButtons.find(b => b.definition.id === def.id);
      if (!btn?.affordable) return;
      if (this.selectedTowerDef?.id !== def.id) {
        btn.bg.clear();
        btn.bg.fillStyle(BTN_BG_COLOR, 1);
        btn.bg.fillRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
      }
    });

    container.on('pointerdown', () => {
      if (this.gameOver) return;
      const btn = this.towerButtons.find(b => b.definition.id === def.id);
      if (!btn?.affordable) return;

      /* Toggle: clicking the already-selected button cancels placement. */
      if (this.placementActive && this.selectedTowerDef?.id === def.id) {
        this.exitPlacementMode();
        return;
      }

      /* Switch to this tower type (or enter placement mode). */
      this.enterPlacementMode(def.id);
    });

    return { container, bg, definition: def, affordable: true };
  }

  /**
   * Refreshes the affordability state of all tower buttons based on current currency.
   * Called every frame in update() and synchronously after placement/sell.
   */
  private refreshAffordability(): void {
    const currency = this.gameState.currency;
    this.currencyText.setText(`${currency}`);

    for (const btn of this.towerButtons) {
      const canAfford = currency >= btn.definition.cost;
      btn.affordable = canAfford;
      btn.container.setAlpha(canAfford ? 1 : DISABLED_ALPHA);

      /* Update selected button visual if it is the active one. */
      if (this.selectedTowerDef?.id === btn.definition.id && canAfford) {
        btn.bg.clear();
        btn.bg.fillStyle(BTN_SELECTED_COLOR, 1);
        btn.bg.fillRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
        btn.bg.lineStyle(2, BTN_ACCENT_COLOR, 1);
        btn.bg.strokeRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
      } else if (canAfford) {
        btn.bg.clear();
        btn.bg.fillStyle(BTN_BG_COLOR, 1);
        btn.bg.fillRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Placement Mode
  // ---------------------------------------------------------------------------

  /**
   * Activates placement mode for the given tower type.
   * Creates the ghost sprite and range circle. If already in placement mode
   * for a different type, switches to the new type.
   *
   * @param towerTypeId - TowerDefinition.id to place (e.g., "ranged").
   */
  enterPlacementMode(towerTypeId: string): void {
    if (this.gameOver) return;

    const def = this.configManager.getTower(towerTypeId);

    /* If switching tower types, clean up old ghost first. */
    if (this.placementActive) {
      this.destroyGhost();
    }

    this.selectedTowerDef = def;
    this.placementActive = true;

    /* Dismiss any sell tooltip when entering placement mode. */
    this.dismissSellTooltip();

    /* Create ghost sprite at an off-screen position until the first hover event. */
    this.ghostSprite = this.scene.add.sprite(-100, -100, def.spriteKey);
    this.ghostSprite.setDepth(DEPTH_PLACEMENT_GHOST);
    this.ghostSprite.setAlpha(GHOST_VALID_ALPHA);
    this.ghostSprite.setTint(TINT_VALID);
    this.ghostSprite.setVisible(false);

    /* Create range circle graphics. */
    this.rangeGraphics = this.scene.add.graphics();
    this.rangeGraphics.setDepth(DEPTH_RANGE_PREVIEW);

    /* Update button visuals to show selection. */
    this.refreshAffordability();
  }

  /**
   * Deactivates placement mode. Destroys the ghost sprite and range circle.
   * Called by cancel (Escape/right-click), successful placement, or GAME_OVER.
   */
  exitPlacementMode(): void {
    this.destroyGhost();
    this.placementActive = false;
    this.selectedTowerDef = null;
    this.ghostValid = false;
    this.isRejectFlashing = false;

    if (this.rejectFlashTimer) {
      this.rejectFlashTimer.destroy();
      this.rejectFlashTimer = null;
    }

    this.refreshAffordability();
  }

  /**
   * Returns whether placement mode is currently active.
   */
  isInPlacementMode(): boolean {
    return this.placementActive;
  }

  /**
   * Returns the currently selected tower type ID, or null if not in placement mode.
   */
  getSelectedTowerType(): string | null {
    return this.selectedTowerDef?.id ?? null;
  }

  /**
   * Destroys the ghost sprite and range graphics objects.
   */
  private destroyGhost(): void {
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
    if (this.rangeGraphics) {
      this.rangeGraphics.destroy();
      this.rangeGraphics = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles MAP_READY: resolves MapData reference from the Phaser registry.
   */
  private handleMapReady(): void {
    this.mapData = this.scene.registry.get('mapData') as MapData;
  }

  /**
   * Handles TILE_HOVER_CHANGED: updates ghost position and tint, and dismisses
   * the sell tooltip if the cursor moves away from the tower tile that triggered it.
   */
  private handleTileHover(payload: TileHoverPayload): void {
    /* Dismiss sell tooltip when cursor moves to a different tile (D1 fix). */
    if (this.sellTargetId !== null) {
      if (payload.col !== this.sellTargetCol || payload.row !== this.sellTargetRow) {
        this.dismissSellTooltip();
      }
    }

    if (!this.placementActive || !this.ghostSprite || !this.selectedTowerDef) return;

    const { col, row } = payload;

    /* Check if cursor is over the build menu area -- hide ghost if so. */
    const worldX = col * TILE_SIZE + TILE_SIZE / 2;
    const worldY = row * TILE_SIZE + TILE_SIZE / 2 + MAP_OFFSET_Y;

    if (this.isCursorOverMenu(worldX)) {
      this.ghostSprite.setVisible(false);
      if (this.rangeGraphics) this.rangeGraphics.setVisible(false);
      return;
    }

    /* Check grid bounds from MapData. */
    if (this.mapData) {
      const dims = this.mapData.getGridDimensions();
      if (col < 0 || col >= dims.cols || row < 0 || row >= dims.rows) {
        this.ghostSprite.setVisible(false);
        if (this.rangeGraphics) this.rangeGraphics.setVisible(false);
        return;
      }
    }

    /* Position ghost at tile center. */
    this.ghostSprite.setPosition(worldX, worldY);
    this.ghostSprite.setVisible(true);

    /* Determine validity: buildable AND not occupied. */
    const buildable = this.mapData?.isBuildable(col, row) ?? false;
    const occupied = this.towerRegistry.isOccupied(col, row);
    this.ghostValid = buildable && !occupied;

    /* Update tint and alpha based on validity. */
    if (!this.isRejectFlashing) {
      if (this.ghostValid) {
        this.ghostSprite.setTint(TINT_VALID);
        this.ghostSprite.setAlpha(GHOST_VALID_ALPHA);
      } else {
        this.ghostSprite.setTint(TINT_INVALID);
        this.ghostSprite.setAlpha(GHOST_INVALID_ALPHA);
      }
    }

    /* Redraw range circle at new position. */
    this.drawRangeCircle(worldX, worldY);
  }

  /**
   * Handles TILE_CLICKED (left-click): commits placement if valid, rejects if
   * invalid. Also dismisses the sell tooltip on any left-click (D1 fix).
   */
  private handleTileClicked(payload: TileClickedPayload): void {
    if (this.gameOver) return;

    /* Dismiss sell tooltip on any left-click regardless of placement state (D1 fix). */
    if (this.sellTargetId !== null) {
      this.dismissSellTooltip();
    }

    /* Ignore clicks over the build menu area. */
    if (this.isCursorOverMenu(payload.worldX)) return;

    if (!this.placementActive || !this.selectedTowerDef) return;

    const { col, row } = payload;

    /* Validate placement at commit time (re-check -- currency could have changed). */
    const buildable = this.mapData?.isBuildable(col, row) ?? false;
    const occupied = this.towerRegistry.isOccupied(col, row);
    const canAfford = this.gameState.currency >= this.selectedTowerDef.cost;

    if (buildable && !occupied && canAfford) {
      this.commitPlacement(col, row);
    } else {
      this.rejectPlacement();
    }
  }

  /**
   * Handles INPUT_CANCEL (Escape/right-click): cancels placement mode.
   * Only acts when in placement mode -- when not in placement mode,
   * right-click is handled by handlePointerDown for sell interaction.
   */
  private handleInputCancel(): void {
    if (this.placementActive) {
      this.exitPlacementMode();
    }
  }

  /**
   * Raw pointer handler for right-click sell interaction.
   * InputSystem fires INPUT_CANCEL on right-click, which cancels placement.
   * This handler runs for right-clicks when NOT in placement mode, to trigger
   * the sell tooltip/confirm flow.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.rightButtonDown()) return;
    if (this.gameOver) return;

    /* When in placement mode, INPUT_CANCEL handles the right-click. */
    if (this.placementActive) return;

    /* Convert pointer to grid coordinates. */
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / TILE_SIZE);
    const row = Math.floor((worldPoint.y - MAP_OFFSET_Y) / TILE_SIZE);

    /* Check if there is a tower at this position. */
    const tower = this.towerRegistry.getTowerAt(col, row);
    if (!tower) {
      /* Right-click on empty tile -- dismiss any sell tooltip. */
      this.dismissSellTooltip();
      return;
    }

    /* If sell tooltip is showing for this tower, confirm the sell. */
    if (this.sellTargetId === tower.instanceId) {
      this.confirmSell(tower.instanceId);
      return;
    }

    /* Show sell tooltip for this tower. */
    this.showSellTooltip(tower);
  }

  /**
   * Handles GAME_OVER: disables all placement interactions, cleans up visuals.
   */
  private handleGameOver(): void {
    this.gameOver = true;
    this.exitPlacementMode();
    this.dismissSellTooltip();

    /* Disable all build menu buttons. */
    for (const btn of this.towerButtons) {
      btn.container.setAlpha(DISABLED_ALPHA);
      btn.affordable = false;
    }
  }

  /**
   * BOLT-022: Handles double-tap on a tile (mobile sell gesture).
   * If a tower exists at the tapped tile, triggers the sell confirmation
   * flow (same as the desktop right-click sell interaction).
   *
   * @param payload - Grid coordinates and world position of the double-tap.
   */
  private handleDoubleTap(payload: TouchDoubleTapPayload): void {
    if (this.gameOver) return;
    if (this.placementActive) return;

    const tower = this.towerRegistry.getTowerAt(payload.col, payload.row);
    if (!tower) return;

    /* If tooltip is already showing for this tower, confirm the sell. */
    if (this.sellTargetId === tower.instanceId) {
      this.confirmSell(tower.instanceId);
      return;
    }

    /* Show the sell tooltip (first double-tap shows, second confirms). */
    this.showSellTooltip(tower);
  }

  // ---------------------------------------------------------------------------
  // Placement Logic
  // ---------------------------------------------------------------------------

  /**
   * Commits a tower placement: creates the tower sprite, deducts currency,
   * registers in TowerRegistry, emits TOWER_PLACED, and exits placement mode.
   */
  private commitPlacement(col: number, row: number): void {
    if (!this.selectedTowerDef) return;

    const def = this.selectedTowerDef;
    const worldX = col * TILE_SIZE + TILE_SIZE / 2;
    const worldY = row * TILE_SIZE + TILE_SIZE / 2 + MAP_OFFSET_Y;

    /* Create the permanent tower sprite. */
    const towerSprite = this.scene.add.sprite(worldX, worldY, def.spriteKey);
    towerSprite.setDepth(DEPTH_TOWERS);
    towerSprite.setOrigin(0.5, 0.5);

    /* Resolve effective maxHp at tier 1 for initial currentHp (BOLT-007). */
    const effectiveStats = resolveEffectiveStats(
      { towerType: def.id, upgradeLevel: 1 },
      this.configManager,
    );

    /* Register in TowerRegistry (also tracks occupancy). */
    const placed = this.towerRegistry.registerTower(
      def.id, col, row, worldX, worldY, def.cost, towerSprite, effectiveStats.maxHp,
    );

    /* Deduct currency via EconomySystem (BOLT-008 owns all currency mutations). */
    if (this.economySystem) {
      const success = this.economySystem.trySpend(def.cost, 'tower_placed');
      if (!success) return;
    }

    /* Emit TOWER_PLACED event for downstream bolts. */
    const eventPayload: TowerPlacedPayload = {
      towerId: placed.instanceId,
      towerType: def.id,
      col,
      row,
    };
    this.emit(GAME_EVENTS.TOWER_PLACED, eventPayload);

    /* Exit placement mode and refresh affordability. */
    this.exitPlacementMode();
  }

  /**
   * Rejects an invalid placement click: flashes the ghost red briefly.
   * Player remains in placement mode after rejection.
   */
  private rejectPlacement(): void {
    if (!this.ghostSprite || this.isRejectFlashing) return;

    this.isRejectFlashing = true;
    this.ghostSprite.setTint(TINT_REJECT_FLASH);

    /* Reset tint after 200ms. */
    this.rejectFlashTimer = this.scene.time.delayedCall(REJECT_FLASH_MS, () => {
      this.isRejectFlashing = false;
      if (this.ghostSprite) {
        if (this.ghostValid) {
          this.ghostSprite.setTint(TINT_VALID);
          this.ghostSprite.setAlpha(GHOST_VALID_ALPHA);
        } else {
          this.ghostSprite.setTint(TINT_INVALID);
          this.ghostSprite.setAlpha(GHOST_INVALID_ALPHA);
        }
      }
      this.rejectFlashTimer = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Range Circle
  // ---------------------------------------------------------------------------

  /**
   * Draws the range preview circle at the given world position.
   * Clears and redraws on every tile change for zero-lag visual update.
   */
  private drawRangeCircle(worldX: number, worldY: number): void {
    if (!this.rangeGraphics || !this.selectedTowerDef) return;

    this.rangeGraphics.clear();
    this.rangeGraphics.setVisible(true);
    this.rangeGraphics.lineStyle(RANGE_LINE_WIDTH, RANGE_STROKE_COLOR, RANGE_STROKE_ALPHA);
    this.rangeGraphics.strokeCircle(worldX, worldY, this.selectedTowerDef.range);
  }

  // ---------------------------------------------------------------------------
  // Sell Interaction
  // ---------------------------------------------------------------------------

  /**
   * Shows the sell tooltip above a placed tower.
   * Displays "Sell: +{refundAmount}". Second right-click confirms.
   * Stores the tower's grid position for hover-based dismissal.
   */
  private showSellTooltip(tower: { instanceId: string; col: number; row: number; worldX: number; worldY: number }): void {
    this.dismissSellTooltip();
    this.sellTargetId = tower.instanceId;
    this.sellTargetCol = tower.col;
    this.sellTargetRow = tower.row;

    const refund = this.towerRegistry.getRefundAmount(tower.instanceId);
    const text = `Sell: +${refund}`;

    /* Create tooltip container above the tower. */
    const tooltipText = this.scene.add.text(0, 0, text, {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: CURRENCY_COLOR,
    });
    const textWidth = tooltipText.width;
    const textHeight = tooltipText.height;
    const padX = 12;
    const padY = 8;
    const bgWidth = textWidth + padX;
    const bgHeight = textHeight + padY;

    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA);
    bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 4);
    bg.lineStyle(1, TOOLTIP_BORDER_COLOR, 1);
    bg.strokeRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 4);

    tooltipText.setOrigin(0.5, 0.5);

    /* Clamp Y so tooltip does not go off the top of the screen. */
    const tooltipY = Math.max(bgHeight / 2 + 4, tower.worldY + TOOLTIP_Y_OFFSET);

    this.sellTooltip = this.scene.add.container(tower.worldX, tooltipY);
    this.sellTooltip.setDepth(DEPTH_UI);
    this.sellTooltip.add([bg, tooltipText]);
  }

  /**
   * Confirms the sell of a tower: removes from registry, destroys sprite,
   * credits currency, emits TOWER_REMOVED.
   */
  private confirmSell(towerId: string): void {
    const refund = this.towerRegistry.getRefundAmount(towerId);
    const tower = this.towerRegistry.removeTower(towerId);
    if (!tower) return;

    /* Destroy the tower sprite. */
    tower.sprite.destroy();

    /* Refund is handled by EconomySystem via TOWER_REMOVED event listener.
     * No direct currency mutation here -- EconomySystem owns all credits. */

    /* Emit TOWER_REMOVED event for downstream bolts. */
    const payload: TowerRemovedPayload = {
      towerId: tower.instanceId,
      towerType: tower.towerType,
      col: tower.col,
      row: tower.row,
      refundAmount: refund,
    };
    this.emit(GAME_EVENTS.TOWER_REMOVED, payload);

    this.dismissSellTooltip();
    this.refreshAffordability();
  }

  /**
   * Dismisses the sell tooltip if one is visible.
   * Resets all sell target tracking state.
   * Public so BOLT-009 HudSystem can dismiss on non-tower-tile clicks.
   */
  dismissSellTooltip(): void {
    if (this.sellTooltip) {
      this.sellTooltip.destroy();
      this.sellTooltip = null;
    }
    this.sellTargetId = null;
    this.sellTargetCol = -1;
    this.sellTargetRow = -1;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks if a world X position overlaps the build menu panel area.
   * Used to hide the ghost and block placement clicks over the menu.
   */
  private isCursorOverMenu(worldX: number): boolean {
    return worldX >= this.menuLeftX;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Destroys all visuals and removes input listeners not tracked by BaseSystem.
   */
  destroy(): void {
    this.destroyGhost();
    this.dismissSellTooltip();

    if (this.rejectFlashTimer) {
      this.rejectFlashTimer.destroy();
      this.rejectFlashTimer = null;
    }

    if (this.menuContainer) {
      this.menuContainer.destroy();
    }

    /* Remove the raw pointerdown listener (not tracked by BaseSystem.listen). */
    this.scene.input.off('pointerdown', this.handlePointerDown, this);

    super.destroy();
  }
}
