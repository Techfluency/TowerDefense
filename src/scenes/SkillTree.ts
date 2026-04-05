/**
 * Skill Tree scene -- tabbed interface for purchasing permanent upgrades.
 *
 * Players spend XP earned from runs on per-tower stat upgrades (5 tiers each),
 * capstone ability nodes (non-interactive placeholders in this bolt -- BOLT-026
 * enables purchase), and global bonuses (3 tiers each). The scene reads state
 * from SkillTreeManager on the Phaser registry and calls its purchase methods.
 *
 * Layout structure:
 * - Tab bar at top (5 tabs: 4 towers + Global)
 * - Scrollable content area in the middle
 * - Persistent footer with Available XP and Back button
 *
 * BOLT-025 implementation. BOLT-026 adds capstone interactivity.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-constants';
import { fadeIn, fadeTransition, scaleIn } from '../ui/ui-animations';
import type { SkillTreeManager } from '../utils/skill-tree-manager';
import type {
  SkillTreeConfig,
  CapstoneDefinition,
  GlobalUpgradeDefinition,
  TowerStatName,
} from '../types/game-types';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Height of the tab button bar at the top of the scene. */
const TAB_BAR_HEIGHT = 52;

/** Height of the footer bar (XP display + Back button). */
const FOOTER_HEIGHT = 60;

/** Y position where tab buttons start. */
const TAB_Y = 14;

/** Minimum touch target for tab buttons (44px per spec). */
const TAB_BTN_HEIGHT = 44;

/** Minimum touch target for tier pips (36px per spec). */
const PIP_RADIUS = 18;

/** Spacing between pip centers. */
const PIP_SPACING = 50;

/** Height of each stat row in the content area. */
const STAT_ROW_HEIGHT = 56;

/** Height of each capstone placeholder row. */
const CAPSTONE_ROW_HEIGHT = 70;

/** Content area top Y (below tab bar). */
const CONTENT_TOP = TAB_BAR_HEIGHT + 10;

/** Content area bottom Y (above footer). */
const CONTENT_BOTTOM = GAME_HEIGHT - FOOTER_HEIGHT;

/** Usable content height for scrolling. */
const CONTENT_VISIBLE_HEIGHT = CONTENT_BOTTOM - CONTENT_TOP;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

/** Dark background matching game theme. */
const BG_COLOR = '#1A1A2E';

/** Gold for available/purchasable nodes and XP display. */
const COLOR_GOLD = 0xFFD700;
const COLOR_GOLD_STR = '#FFD700';

/** Green for purchased/completed nodes. */
const COLOR_GREEN = 0x44FF44;
const COLOR_GREEN_STR = '#44FF44';

/** Gray for locked/unavailable nodes. */
const COLOR_GRAY = 0x666666;
const COLOR_GRAY_STR = '#666666';

/** Dim red for insufficient-funds flash. */
const COLOR_RED_STR = '#FF4444';

/** Panel background for confirmation modal. */
const MODAL_BG_COLOR = 0x0D0D1A;
const MODAL_BORDER_COLOR = 0x4A4A6A;

/** Button backgrounds. */
const BTN_BG = 0x2A2A4A;
const BTN_HOVER = 0x3A3A6A;
const BTN_CONFIRM_BG = 0x2A4A2A;
const BTN_CONFIRM_HOVER = 0x3A6A3A;
const BTN_CORNER_RADIUS = 6;

// ---------------------------------------------------------------------------
// Tower tab definitions (maps tower ID to display info)
// ---------------------------------------------------------------------------

/**
 * Defines the 5 tabs in the skill tree UI.
 * Order matches the PRD: Arrow, Sniper, Shockwave, AA Missile, Global.
 * Tower IDs must match the config keys used by SkillTreeManager.
 */
interface TabDefinition {
  /** Display label on the tab button. */
  label: string;
  /** Tower ID (null for the Global tab). */
  towerId: string | null;
  /** Tint color for the tab highlight. */
  color: number;
}

const TABS: TabDefinition[] = [
  { label: 'Arrow', towerId: 'ranged', color: 0x44AA44 },
  { label: 'Sniper', towerId: 'focused', color: 0xAA4444 },
  { label: 'Shockwave', towerId: 'broadcast', color: 0x4488DD },
  { label: 'AA Missile', towerId: 'antiair', color: 0xDD8844 },
  { label: 'Global', towerId: null, color: COLOR_GOLD },
];

/**
 * Display names for the four per-tower stats.
 * Keys must match TowerStatName values.
 */
const STAT_DISPLAY_NAMES: Record<TowerStatName, string> = {
  damage: 'Damage',
  fireRate: 'Fire Rate',
  range: 'Range',
  upgradeDiscount: 'Upgrade Discount',
};

/** Ordered stat names for consistent row ordering. */
const STAT_ORDER: TowerStatName[] = ['damage', 'fireRate', 'range', 'upgradeDiscount'];

/** Maximum number of tiers per stat (per-tower). */
const MAX_STAT_TIER = 5;

/** Maximum number of tiers per global upgrade. */
const MAX_GLOBAL_TIER = 3;

// ---------------------------------------------------------------------------
// SkillTree Scene
// ---------------------------------------------------------------------------

export class SkillTree extends Phaser.Scene {
  /** Reference to the SkillTreeManager on the registry. */
  private manager!: SkillTreeManager;

  /** Parsed skill tree config (costs, capstones, global upgrades). */
  private config!: SkillTreeConfig;

  /** Index of the currently active tab (0-4). */
  private activeTabIndex = 0;

  /** Container holding the tab content area (rebuilt on tab switch). */
  private contentContainer: Phaser.GameObjects.Container | null = null;

  /** Graphics objects for tab button backgrounds (for highlight toggling). */
  private tabBgs: Phaser.GameObjects.Graphics[] = [];

  /** Text objects for tab labels (for color toggling). */
  private tabLabels: Phaser.GameObjects.Text[] = [];

  /** Footer XP text (updated after purchases). */
  private xpText: Phaser.GameObjects.Text | null = null;

  /** Confirmation modal container (null when no modal is open). */
  private modal: Phaser.GameObjects.Container | null = null;

  /** Scene key that launched this scene (for Back button navigation). */
  private returnScene: string = SCENE_KEYS.MAIN_MENU;

  /** Mask graphics for clipping content to the scrollable region. */
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;

  /** Total content height (may exceed visible area, triggering scroll). */
  private totalContentHeight = 0;

  /** Current scroll offset (0 = top, negative = scrolled down). */
  private scrollOffset = 0;

  constructor() {
    super({ key: 'SkillTree' });
  }

  /**
   * Initializes the scene. Receives data from the launching scene
   * to determine where the Back button should navigate.
   *
   * @param data - Optional data from scene.start(). May include returnScene.
   */
  init(data?: { returnScene?: string }): void {
    this.returnScene = data?.returnScene ?? SCENE_KEYS.MAIN_MENU;
    this.activeTabIndex = 0;
    this.scrollOffset = 0;
  }

  /**
   * Builds the full skill tree UI: tab bar, content area, and footer.
   * Binds SkillTreeManager config if not already bound.
   */
  create(): void {
    /* Resolve SkillTreeManager from the Phaser registry. */
    this.manager = this.registry.get('skillTreeManager') as SkillTreeManager;
    if (!this.manager) {
      /* Fallback: try via ProgressionManager wrapper. */
      const pm = this.registry.get('progressionManager') as
        { getSkillTreeManager(): SkillTreeManager } | undefined;
      if (pm) {
        this.manager = pm.getSkillTreeManager();
      }
    }

    /* Ensure skill tree config is bound (loaded from Phaser cache in Preload). */
    this.ensureConfig();

    /* --- Background --- */
    this.cameras.main.setBackgroundColor(BG_COLOR);
    fadeIn(this);

    /* --- Tab Bar --- */
    this.buildTabBar();

    /* --- Footer (persistent across tab switches) --- */
    this.buildFooter();

    /* --- Initial content for the first tab --- */
    this.buildContentForTab(this.activeTabIndex);

    /* --- Scroll input (mouse wheel + touch drag on content area) --- */
    this.setupScrollInput();
  }

  // -------------------------------------------------------------------------
  // Config binding
  // -------------------------------------------------------------------------

  /**
   * Ensures the SkillTreeManager has its config bound. If not, loads it
   * from the Phaser JSON cache (asset key: 'config-skill-tree').
   * This mirrors the pattern in Gameplay.computeAndStoreRunBonuses().
   */
  private ensureConfig(): void {
    try {
      this.config = this.manager.getConfig();
    } catch {
      /* Config not yet set -- bind it from the Phaser cache. */
      const cached = this.cache.json.get('config-skill-tree') as SkillTreeConfig | undefined;
      if (cached) {
        this.manager.setConfig(cached);
        this.config = cached;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Tab Bar
  // -------------------------------------------------------------------------

  /**
   * Builds the row of tab buttons across the top of the scene.
   * Each tab button is a rounded rectangle with a text label.
   * The active tab gets a highlighted background.
   */
  private buildTabBar(): void {
    const totalTabs = TABS.length;
    const tabWidth = Math.floor(GAME_WIDTH / totalTabs);
    this.tabBgs = [];
    this.tabLabels = [];

    for (let i = 0; i < totalTabs; i++) {
      const tab = TABS[i]!;
      const x = i * tabWidth;

      /* Tab background. */
      const bg = this.add.graphics();
      bg.setDepth(10);
      this.tabBgs.push(bg);

      /* Tab label. */
      const label = this.add.text(
        x + tabWidth / 2,
        TAB_Y + TAB_BTN_HEIGHT / 2,
        tab.label,
        {
          fontSize: '15px',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          color: '#FFFFFF',
        },
      ).setOrigin(0.5).setDepth(11);
      this.tabLabels.push(label);

      /* Draw initial state. */
      this.drawTabBg(i, i === this.activeTabIndex);

      /* Interactive hit zone (44px minimum height for touch). */
      const hitZone = this.add.zone(
        x + tabWidth / 2,
        TAB_Y + TAB_BTN_HEIGHT / 2,
        tabWidth - 4,
        TAB_BTN_HEIGHT,
      ).setInteractive({ useHandCursor: true }).setDepth(12);

      hitZone.on('pointerdown', () => this.switchTab(i));
    }
  }

  /**
   * Draws or redraws a tab button background.
   * Active tab gets the tower's color; inactive tabs get a dim background.
   *
   * @param index - Tab index (0-4).
   * @param active - Whether this tab is currently selected.
   */
  private drawTabBg(index: number, active: boolean): void {
    const bg = this.tabBgs[index]!;
    const tab = TABS[index]!;
    const tabWidth = Math.floor(GAME_WIDTH / TABS.length);
    const x = index * tabWidth;

    bg.clear();
    if (active) {
      bg.fillStyle(tab.color, 0.35);
      bg.fillRoundedRect(x + 2, TAB_Y, tabWidth - 4, TAB_BTN_HEIGHT, 4);
      /* Active indicator line at bottom of tab. */
      bg.fillStyle(tab.color, 1);
      bg.fillRect(x + 2, TAB_Y + TAB_BTN_HEIGHT - 3, tabWidth - 4, 3);
    } else {
      bg.fillStyle(0x222244, 0.6);
      bg.fillRoundedRect(x + 2, TAB_Y, tabWidth - 4, TAB_BTN_HEIGHT, 4);
    }
  }

  /**
   * Switches the active tab and rebuilds the content area.
   *
   * @param index - New tab index to activate.
   */
  private switchTab(index: number): void {
    if (index === this.activeTabIndex) return;
    if (this.modal) return; /* Don't switch tabs while modal is open. */

    /* Update tab highlights. */
    const prevIndex = this.activeTabIndex;
    this.activeTabIndex = index;
    this.drawTabBg(prevIndex, false);
    this.drawTabBg(index, true);

    /* Reset scroll and rebuild content. */
    this.scrollOffset = 0;
    this.buildContentForTab(index);
  }

  // -------------------------------------------------------------------------
  // Content Area
  // -------------------------------------------------------------------------

  /**
   * Builds the content area for the selected tab. Destroys previous content
   * and creates new stat rows, pip visualizations, and capstone placeholders.
   *
   * @param tabIndex - Which tab to render content for.
   */
  private buildContentForTab(tabIndex: number): void {
    /* Destroy previous content. */
    if (this.contentContainer) {
      this.contentContainer.destroy();
      this.contentContainer = null;
    }
    if (this.contentMask) {
      this.contentMask.destroy();
      this.contentMask = null;
    }

    /* Create new content container at the top of the content area. */
    this.contentContainer = this.add.container(0, CONTENT_TOP);

    /* Create geometry mask to clip content to the visible scroll region.
     * The mask shape is added to the scene but kept invisible -- Phaser
     * needs it in the display list for geometry masking to work. */
    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(0, CONTENT_TOP, GAME_WIDTH, CONTENT_VISIBLE_HEIGHT);
    maskShape.setVisible(false);
    this.contentMask = maskShape.createGeometryMask();
    this.contentContainer.setMask(this.contentMask);

    const tab = TABS[tabIndex]!;
    if (tab.towerId) {
      this.buildTowerTabContent(tab.towerId, tab.label, tab.color);
    } else {
      this.buildGlobalTabContent();
    }
  }

  /**
   * Builds the content for a per-tower tab: tower name, 4 stat rows
   * with 5 tier pips each, and 2 capstone placeholder nodes.
   *
   * @param towerId - Tower ID (e.g., "ranged").
   * @param towerName - Display name for the header.
   * @param towerColor - Tower's accent color for highlights.
   */
  private buildTowerTabContent(
    towerId: string,
    towerName: string,
    towerColor: number,
  ): void {
    const container = this.contentContainer!;
    let y = 10;

    /* Tower name header. */
    const header = this.add.text(GAME_WIDTH / 2, y, `${towerName} Tower`, {
      fontSize: '22px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    container.add(header);
    y += 40;

    /* 4 stat rows. */
    for (const stat of STAT_ORDER) {
      this.buildStatRow(container, towerId, stat, y, MAX_STAT_TIER, towerColor);
      y += STAT_ROW_HEIGHT;
    }

    /* Separator before capstones. */
    y += 8;
    const sep = this.add.graphics();
    sep.lineStyle(1, MODAL_BORDER_COLOR, 0.5);
    sep.lineBetween(40, y, GAME_WIDTH - 40, y);
    container.add(sep);
    y += 16;

    /* Capstone header. */
    const capLabel = this.add.text(GAME_WIDTH / 2, y, 'Capstone Abilities', {
      fontSize: '16px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#AAAAAA',
    }).setOrigin(0.5);
    container.add(capLabel);
    y += 28;

    /* Capstone placeholders (mid-tier and mastery). */
    const capstones = this.config.capstones.filter(c => c.towerId === towerId);
    const midCapstone = capstones.find(c => c.tier === 'mid');
    const masteryCapstone = capstones.find(c => c.tier === 'mastery');

    if (midCapstone) {
      this.buildCapstoneRow(container, midCapstone, towerId, y);
      y += CAPSTONE_ROW_HEIGHT;
    }
    if (masteryCapstone) {
      this.buildCapstoneRow(container, masteryCapstone, towerId, y);
      y += CAPSTONE_ROW_HEIGHT;
    }

    this.totalContentHeight = y + 10;
  }

  /**
   * Builds the content for the Global tab: 6 upgrade rows with 3 pips each.
   */
  private buildGlobalTabContent(): void {
    const container = this.contentContainer!;
    let y = 10;

    /* Global header. */
    const header = this.add.text(GAME_WIDTH / 2, y, 'Global Upgrades', {
      fontSize: '22px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: COLOR_GOLD_STR,
    }).setOrigin(0.5);
    container.add(header);
    y += 40;

    /* 6 global upgrade rows. */
    for (const upgradeDef of this.config.globalUpgrades) {
      this.buildGlobalRow(container, upgradeDef, y);
      y += STAT_ROW_HEIGHT;
    }

    this.totalContentHeight = y + 10;
  }

  // -------------------------------------------------------------------------
  // Stat Row (per-tower)
  // -------------------------------------------------------------------------

  /**
   * Builds a single stat row: stat name, tier pips, current bonus text,
   * and next-tier cost. Pips are interactive for available tiers.
   *
   * @param container - Parent container to add elements to.
   * @param towerId - Tower ID for SkillTreeManager lookups.
   * @param stat - Which stat this row represents.
   * @param y - Y position within the content container.
   * @param maxTier - Maximum tier count (5 for per-tower stats).
   * @param accentColor - Tower accent color for available pips.
   */
  private buildStatRow(
    container: Phaser.GameObjects.Container,
    towerId: string,
    stat: TowerStatName,
    y: number,
    maxTier: number,
    accentColor: number,
  ): void {
    const currentTier = this.manager.getStatTier(towerId, stat);
    const nextCost = this.manager.getStatTierCost(towerId, stat);
    const availableXp = this.manager.getAvailableXp();

    /* Stat name label (left side). */
    const nameLabel = this.add.text(30, y + 12, STAT_DISPLAY_NAMES[stat], {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#CCCCCC',
    }).setOrigin(0, 0.5);
    container.add(nameLabel);

    /* Tier pips (center area). */
    const pipStartX = 280;
    for (let tier = 1; tier <= maxTier; tier++) {
      const pipX = pipStartX + (tier - 1) * PIP_SPACING;
      const purchased = tier <= currentTier;
      const isNext = tier === currentTier + 1;
      const canAfford = isNext && nextCost !== null && availableXp >= nextCost;

      this.buildPip(
        container,
        pipX,
        y + 12,
        purchased,
        isNext,
        canAfford,
        accentColor,
        /* Purchase callback for available pips. */
        isNext
          ? () => this.handleStatPurchase(towerId, stat, nextCost!)
          : undefined,
      );
    }

    /* Current bonus text (right of pips). */
    const bonusText = this.formatStatBonus(towerId, stat);
    const bonusLabel = this.add.text(pipStartX + maxTier * PIP_SPACING + 10, y + 4, bonusText, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: currentTier > 0 ? COLOR_GREEN_STR : COLOR_GRAY_STR,
    }).setOrigin(0, 0.5);
    container.add(bonusLabel);

    /* Next tier cost (below bonus). */
    const costStr = nextCost !== null ? `${nextCost} XP` : 'MAX';
    const costColor = nextCost !== null && availableXp >= nextCost
      ? COLOR_GOLD_STR : COLOR_GRAY_STR;
    const costLabel = this.add.text(pipStartX + maxTier * PIP_SPACING + 10, y + 20, costStr, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: costColor,
    }).setOrigin(0, 0.5);
    container.add(costLabel);
  }

  /**
   * Builds a single global upgrade row: name, 3 tier pips, bonus, cost.
   *
   * @param container - Parent container.
   * @param upgradeDef - Global upgrade definition from config.
   * @param y - Y position within content container.
   */
  private buildGlobalRow(
    container: Phaser.GameObjects.Container,
    upgradeDef: GlobalUpgradeDefinition,
    y: number,
  ): void {
    const currentTier = this.manager.getGlobalTier(upgradeDef.id);
    const nextCost = this.manager.getGlobalTierCost(upgradeDef.id);
    const availableXp = this.manager.getAvailableXp();

    /* Upgrade name label (left side). */
    const nameLabel = this.add.text(30, y + 12, upgradeDef.name, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#CCCCCC',
    }).setOrigin(0, 0.5);
    container.add(nameLabel);

    /* Description below name. */
    const descLabel = this.add.text(30, y + 28, upgradeDef.description, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#888888',
    }).setOrigin(0, 0.5);
    container.add(descLabel);

    /* 3 tier pips (center). */
    const pipStartX = 400;
    for (let tier = 1; tier <= MAX_GLOBAL_TIER; tier++) {
      const pipX = pipStartX + (tier - 1) * PIP_SPACING;
      const purchased = tier <= currentTier;
      const isNext = tier === currentTier + 1;
      const canAfford = isNext && nextCost !== null && availableXp >= nextCost;

      this.buildPip(
        container,
        pipX,
        y + 12,
        purchased,
        isNext,
        canAfford,
        COLOR_GOLD,
        isNext
          ? () => this.handleGlobalPurchase(upgradeDef.id, upgradeDef.name, nextCost!)
          : undefined,
      );
    }

    /* Current bonus text. */
    const bonusText = this.formatGlobalBonus(upgradeDef, currentTier);
    const bonusLabel = this.add.text(
      pipStartX + MAX_GLOBAL_TIER * PIP_SPACING + 10, y + 4,
      bonusText,
      {
        fontSize: '13px',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: currentTier > 0 ? COLOR_GREEN_STR : COLOR_GRAY_STR,
      },
    ).setOrigin(0, 0.5);
    container.add(bonusLabel);

    /* Next tier cost. */
    const costStr = nextCost !== null ? `${nextCost} XP` : 'MAX';
    const costColor = nextCost !== null && availableXp >= nextCost
      ? COLOR_GOLD_STR : COLOR_GRAY_STR;
    const costLabel = this.add.text(
      pipStartX + MAX_GLOBAL_TIER * PIP_SPACING + 10, y + 20,
      costStr,
      {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: costColor,
      },
    ).setOrigin(0, 0.5);
    container.add(costLabel);
  }

  // -------------------------------------------------------------------------
  // Tier Pip
  // -------------------------------------------------------------------------

  /**
   * Builds a single tier pip (circle) with visual state and optional
   * click handler for purchasing.
   *
   * Pip states:
   * - Purchased (filled green)
   * - Available + can afford (outlined gold, interactive)
   * - Available + cannot afford (outlined gold, dimmed)
   * - Locked (dim gray, no interaction)
   *
   * @param container - Parent container.
   * @param x - Center X position.
   * @param y - Center Y position.
   * @param purchased - Whether this tier has been bought.
   * @param isNext - Whether this is the next purchasable tier.
   * @param canAfford - Whether the player has enough XP.
   * @param accentColor - Color to use for available state.
   * @param onPurchase - Callback when pip is tapped (only for purchasable pips).
   */
  private buildPip(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    purchased: boolean,
    isNext: boolean,
    canAfford: boolean,
    accentColor: number,
    onPurchase?: () => void,
  ): void {
    const gfx = this.add.graphics();

    if (purchased) {
      /* Filled green circle -- already purchased. */
      gfx.fillStyle(COLOR_GREEN, 1);
      gfx.fillCircle(x, y, PIP_RADIUS);
      /* Small checkmark-like inner dot for visual clarity. */
      gfx.fillStyle(0xFFFFFF, 0.4);
      gfx.fillCircle(x, y, PIP_RADIUS * 0.35);
    } else if (isNext && canAfford) {
      /* Outlined gold circle -- purchasable. */
      gfx.lineStyle(3, accentColor, 1);
      gfx.strokeCircle(x, y, PIP_RADIUS);
      /* Subtle inner fill to indicate interactivity. */
      gfx.fillStyle(accentColor, 0.15);
      gfx.fillCircle(x, y, PIP_RADIUS);
    } else if (isNext) {
      /* Outlined gold but dimmed -- next tier but can't afford. */
      gfx.lineStyle(2, accentColor, 0.5);
      gfx.strokeCircle(x, y, PIP_RADIUS);
    } else {
      /* Dim gray circle -- locked (not the next tier). */
      gfx.lineStyle(2, COLOR_GRAY, 0.4);
      gfx.strokeCircle(x, y, PIP_RADIUS);
    }

    container.add(gfx);

    /* Interactive hit zone for purchasable pips. */
    if (isNext && onPurchase) {
      const hitZone = this.add.zone(x, y, PIP_RADIUS * 2, PIP_RADIUS * 2)
        .setInteractive({ useHandCursor: canAfford });
      hitZone.on('pointerdown', () => {
        if (canAfford) {
          onPurchase();
        } else {
          /* Insufficient XP -- flash feedback. */
          this.showInsufficientFeedback(x, y);
        }
      });
      container.add(hitZone);
    }
  }

  // -------------------------------------------------------------------------
  // Capstone Row
  // -------------------------------------------------------------------------

  /**
   * Builds a capstone placeholder row. Shows capstone name, cost,
   * prerequisite requirement text, and purchased/locked visual state.
   * Purchase interactivity is deferred to BOLT-026.
   *
   * @param container - Parent container.
   * @param capstoneDef - Capstone definition from config.
   * @param towerId - Tower ID for state lookups.
   * @param y - Y position within content container.
   */
  private buildCapstoneRow(
    container: Phaser.GameObjects.Container,
    capstoneDef: CapstoneDefinition,
    towerId: string,
    y: number,
  ): void {
    const towerState = this.manager.getTowerState(towerId);
    const capstoneKey = capstoneDef.tier === 'mid' ? 'midCapstone' : 'masteryCapstone';
    const isPurchased = towerState?.[capstoneKey] === true;
    const prereqsMet = towerState
      ? this.manager.checkCapstonePrerequisites(capstoneDef, towerState)
      : false;

    /* Capstone node circle (larger than stat pips). */
    const nodeRadius = 22;
    const nodeX = 60;
    const nodeY = y + nodeRadius + 4;
    const gfx = this.add.graphics();

    if (isPurchased) {
      gfx.fillStyle(COLOR_GREEN, 1);
      gfx.fillCircle(nodeX, nodeY, nodeRadius);
      gfx.fillStyle(0xFFFFFF, 0.3);
      gfx.fillCircle(nodeX, nodeY, nodeRadius * 0.4);
    } else if (prereqsMet) {
      /* Prerequisites met but not yet purchasable (BOLT-026 enables purchase). */
      gfx.lineStyle(3, COLOR_GOLD, 0.7);
      gfx.strokeCircle(nodeX, nodeY, nodeRadius);
      gfx.fillStyle(COLOR_GOLD, 0.1);
      gfx.fillCircle(nodeX, nodeY, nodeRadius);
    } else {
      /* Prerequisites not met -- grayed out. */
      gfx.lineStyle(2, COLOR_GRAY, 0.4);
      gfx.strokeCircle(nodeX, nodeY, nodeRadius);
    }
    container.add(gfx);

    /* Capstone name. */
    const nameColor = isPurchased ? COLOR_GREEN_STR : (prereqsMet ? '#FFFFFF' : COLOR_GRAY_STR);
    const nameText = this.add.text(100, y + 6, capstoneDef.name, {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: nameColor,
    }).setOrigin(0, 0);
    container.add(nameText);

    /* Capstone description. */
    const descText = this.add.text(100, y + 24, capstoneDef.description, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#888888',
      wordWrap: { width: GAME_WIDTH - 260 },
    }).setOrigin(0, 0);
    container.add(descText);

    /* Prerequisite requirement text. */
    const prereqText = this.formatCapstonePrereq(capstoneDef);
    const prereqLabel = this.add.text(100, y + 44, prereqText, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: prereqsMet ? COLOR_GREEN_STR : COLOR_GRAY_STR,
    }).setOrigin(0, 0);
    container.add(prereqLabel);

    /* Cost display (right side). */
    const costStr = isPurchased ? 'OWNED' : `${capstoneDef.cost} XP`;
    const costColor = isPurchased ? COLOR_GREEN_STR : COLOR_GRAY_STR;
    const costLabel = this.add.text(GAME_WIDTH - 40, y + 16, costStr, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: costColor,
    }).setOrigin(1, 0);
    container.add(costLabel);
  }

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------

  /**
   * Builds the persistent footer bar with Available XP display and Back button.
   * The footer stays visible across all tab switches.
   */
  private buildFooter(): void {
    const footerY = GAME_HEIGHT - FOOTER_HEIGHT;

    /* Footer background. */
    const footerBg = this.add.graphics().setDepth(20);
    footerBg.fillStyle(0x0D0D1A, 0.95);
    footerBg.fillRect(0, footerY, GAME_WIDTH, FOOTER_HEIGHT);
    /* Top border line. */
    footerBg.lineStyle(1, MODAL_BORDER_COLOR, 0.8);
    footerBg.lineBetween(0, footerY, GAME_WIDTH, footerY);

    /* Available XP text (left side of footer). */
    const xp = this.manager.getAvailableXp();
    this.xpText = this.add.text(
      30,
      footerY + FOOTER_HEIGHT / 2,
      `Available XP: ${xp}`,
      {
        fontSize: '18px',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: COLOR_GOLD_STR,
      },
    ).setOrigin(0, 0.5).setDepth(21);

    /* Back button (right side of footer). */
    this.createFooterButton(
      GAME_WIDTH - 100,
      footerY + FOOTER_HEIGHT / 2,
      'Back',
      () => fadeTransition(this, () => this.scene.start(this.returnScene)),
    );
  }

  /**
   * Creates a styled button in the footer area.
   *
   * @param x - Center X.
   * @param y - Center Y.
   * @param label - Button text.
   * @param onClick - Click callback.
   */
  private createFooterButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const width = 120;
    const height = 36;

    const bg = this.add.graphics().setDepth(21);
    bg.fillStyle(BTN_BG, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);

    this.add.text(x, y, label, {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(22);

    const hitZone = this.add.zone(x, y, width, height)
      .setInteractive({ useHandCursor: true })
      .setDepth(22);

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(BTN_HOVER, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(BTN_BG, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerdown', onClick);
  }

  // -------------------------------------------------------------------------
  // Purchase Handlers
  // -------------------------------------------------------------------------

  /**
   * Handles a per-tower stat pip purchase attempt. Opens the confirmation
   * modal if the player can afford it.
   *
   * @param towerId - Tower ID.
   * @param stat - Stat name being purchased.
   * @param cost - XP cost for the next tier.
   */
  private handleStatPurchase(
    towerId: string,
    stat: TowerStatName,
    cost: number,
  ): void {
    if (this.modal) return; /* Prevent stacking modals. */

    const statName = STAT_DISPLAY_NAMES[stat];
    const currentTier = this.manager.getStatTier(towerId, stat);
    const nextTier = currentTier + 1;
    const remainingAfter = this.manager.getAvailableXp() - cost;

    this.showConfirmationModal(
      `${statName} Tier ${nextTier}`,
      cost,
      remainingAfter,
      () => {
        const success = this.manager.purchaseStatTier(towerId, stat);
        if (success) {
          this.onPurchaseComplete();
        }
      },
    );
  }

  /**
   * Handles a global upgrade pip purchase attempt. Opens the confirmation
   * modal if the player can afford it.
   *
   * @param upgradeId - Global upgrade ID.
   * @param upgradeName - Display name for the modal.
   * @param cost - XP cost for the next tier.
   */
  private handleGlobalPurchase(
    upgradeId: string,
    upgradeName: string,
    cost: number,
  ): void {
    if (this.modal) return;

    const currentTier = this.manager.getGlobalTier(upgradeId);
    const nextTier = currentTier + 1;
    const remainingAfter = this.manager.getAvailableXp() - cost;

    this.showConfirmationModal(
      `${upgradeName} Tier ${nextTier}`,
      cost,
      remainingAfter,
      () => {
        const success = this.manager.purchaseGlobalTier(upgradeId);
        if (success) {
          this.onPurchaseComplete();
        }
      },
    );
  }

  /**
   * Called after a successful purchase. Refreshes the display:
   * rebuilds content area and updates footer XP text.
   * Also plays a gold particle burst VFX.
   */
  private onPurchaseComplete(): void {
    /* Play gold particle burst at center of screen for purchase feedback. */
    this.playPurchaseVFX(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    /* Refresh content area to reflect new state. */
    this.buildContentForTab(this.activeTabIndex);

    /* Update footer XP display. */
    this.updateXpDisplay();
  }

  // -------------------------------------------------------------------------
  // Confirmation Modal
  // -------------------------------------------------------------------------

  /**
   * Shows a purchase confirmation modal overlay. Displays the upgrade name,
   * XP cost, remaining XP after purchase, and Confirm/Cancel buttons.
   *
   * @param upgradeName - Display name of the upgrade being purchased.
   * @param cost - XP cost.
   * @param remainingAfter - XP balance after purchase.
   * @param onConfirm - Callback when Confirm is clicked.
   */
  private showConfirmationModal(
    upgradeName: string,
    cost: number,
    remainingAfter: number,
    onConfirm: () => void,
  ): void {
    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    container.setDepth(100);

    /* Semi-transparent backdrop to block interaction with content behind. */
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.6);
    backdrop.fillRect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    );
    container.add(backdrop);

    /* Modal panel. */
    const panelW = 340;
    const panelH = 200;
    const panel = this.add.graphics();
    panel.fillStyle(MODAL_BG_COLOR, 0.95);
    panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    panel.lineStyle(1, MODAL_BORDER_COLOR, 1);
    panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    container.add(panel);

    /* Title. */
    const title = this.add.text(0, -panelH / 2 + 24, 'Confirm Purchase', {
      fontSize: '18px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#E0E0E0',
    }).setOrigin(0.5);
    container.add(title);

    /* Upgrade name. */
    const nameText = this.add.text(0, -panelH / 2 + 54, upgradeName, {
      fontSize: '16px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: COLOR_GOLD_STR,
    }).setOrigin(0.5);
    container.add(nameText);

    /* Cost line. */
    const costText = this.add.text(0, -panelH / 2 + 82, `Cost: ${cost} XP`, {
      fontSize: '15px',
      fontFamily: 'monospace',
      color: '#CCCCCC',
    }).setOrigin(0.5);
    container.add(costText);

    /* Remaining XP line. */
    const remainText = this.add.text(
      0,
      -panelH / 2 + 106,
      `Remaining: ${remainingAfter} XP`,
      {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: remainingAfter >= 0 ? COLOR_GOLD_STR : COLOR_RED_STR,
      },
    ).setOrigin(0.5);
    container.add(remainText);

    /* Confirm button. */
    this.createModalButton(
      container,
      -70,
      panelH / 2 - 36,
      'Confirm',
      BTN_CONFIRM_BG,
      BTN_CONFIRM_HOVER,
      () => {
        this.closeModal();
        onConfirm();
      },
    );

    /* Cancel button. */
    this.createModalButton(
      container,
      70,
      panelH / 2 - 36,
      'Cancel',
      BTN_BG,
      BTN_HOVER,
      () => this.closeModal(),
    );

    this.modal = container;
    scaleIn(this, container);
  }

  /**
   * Creates a button within the confirmation modal.
   *
   * @param container - Modal container to add the button to.
   * @param x - Button center X relative to modal center.
   * @param y - Button center Y relative to modal center.
   * @param label - Button text.
   * @param bgColor - Normal background color.
   * @param hoverColor - Hover background color.
   * @param onClick - Click callback.
   */
  private createModalButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    bgColor: number,
    hoverColor: number,
    onClick: () => void,
  ): void {
    const width = 110;
    const height = 36;

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    container.add(bg);

    const text = this.add.text(x, y, label, {
      fontSize: '14px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    container.add(text);

    const hitZone = this.add.zone(x, y, width, height)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);
    });
    hitZone.on('pointerdown', onClick);
    container.add(hitZone);
  }

  /**
   * Closes and destroys the confirmation modal with a brief scale-down
   * animation (mirrors MainMenu settings panel dismiss pattern).
   */
  private closeModal(): void {
    if (!this.modal) return;
    const modal = this.modal;
    this.modal = null;

    this.tweens.add({
      targets: modal,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => modal.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Scroll Input
  // -------------------------------------------------------------------------

  /**
   * Sets up mouse wheel and touch drag scrolling for the content area.
   * Content scrolls vertically when it exceeds the visible region.
   */
  private setupScrollInput(): void {
    /* Mouse wheel scroll. */
    this.input.on('wheel', (
      _pointer: Phaser.Input.Pointer,
      _gameObjects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      if (this.modal) return; /* No scrolling while modal is open. */
      this.applyScroll(-deltaY * 0.5);
    });

    /* Touch drag scroll on the content area. */
    let dragStartY = 0;
    let dragStartOffset = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      /* Only start drag in the content area. */
      if (pointer.y >= CONTENT_TOP && pointer.y <= CONTENT_BOTTOM) {
        dragStartY = pointer.y;
        dragStartOffset = this.scrollOffset;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.modal) return;
      if (dragStartY >= CONTENT_TOP && dragStartY <= CONTENT_BOTTOM) {
        const deltaY = pointer.y - dragStartY;
        this.scrollOffset = dragStartOffset + deltaY;
        this.clampScroll();
        this.applyScrollPosition();
      }
    });
  }

  /**
   * Applies a scroll delta and updates the content container position.
   *
   * @param delta - Scroll amount (positive = scroll up, negative = scroll down).
   */
  private applyScroll(delta: number): void {
    this.scrollOffset += delta;
    this.clampScroll();
    this.applyScrollPosition();
  }

  /**
   * Clamps the scroll offset to valid bounds (0 at top, negative for overflow).
   */
  private clampScroll(): void {
    const maxScroll = this.totalContentHeight - CONTENT_VISIBLE_HEIGHT;
    if (maxScroll <= 0) {
      /* Content fits in visible area -- no scrolling needed. */
      this.scrollOffset = 0;
    } else {
      this.scrollOffset = Math.max(-maxScroll, Math.min(0, this.scrollOffset));
    }
  }

  /**
   * Applies the current scroll offset to the content container's Y position.
   */
  private applyScrollPosition(): void {
    if (this.contentContainer) {
      this.contentContainer.y = CONTENT_TOP + this.scrollOffset;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Updates the footer Available XP text to reflect the current balance.
   */
  private updateXpDisplay(): void {
    if (this.xpText) {
      this.xpText.setText(`Available XP: ${this.manager.getAvailableXp()}`);
    }
  }

  /**
   * Formats the current cumulative bonus for a per-tower stat.
   * Example: "+30% Damage" or "+0%" if no tiers purchased.
   *
   * @param towerId - Tower ID.
   * @param stat - Stat name.
   * @returns Formatted bonus string.
   */
  private formatStatBonus(towerId: string, stat: TowerStatName): string {
    const multipliers = this.manager.getTowerStatMultipliers(towerId);
    const value = multipliers[stat];

    if (stat === 'upgradeDiscount') {
      /* Discount is subtracted: multiplier 0.85 = -15%. */
      const pct = Math.round((1 - value) * 100);
      return pct > 0 ? `-${pct}% Cost` : '+0%';
    }
    /* Other stats are additive: multiplier 1.30 = +30%. */
    const pct = Math.round((value - 1) * 100);
    return pct > 0 ? `+${pct}%` : '+0%';
  }

  /**
   * Formats the current cumulative bonus for a global upgrade.
   * Handles both percentage and flat bonus types.
   *
   * @param upgradeDef - Global upgrade definition.
   * @param currentTier - Current purchased tier (0-3).
   * @returns Formatted bonus string.
   */
  private formatGlobalBonus(
    upgradeDef: GlobalUpgradeDefinition,
    currentTier: number,
  ): string {
    if (currentTier === 0) return '+0';

    /* Sum bonuses from tier 1 through current tier. */
    let total = 0;
    for (let i = 0; i < currentTier; i++) {
      total += upgradeDef.bonusPerTier[i] ?? 0;
    }

    if (upgradeDef.bonusType === 'percentage') {
      return `+${Math.round(total * 100)}%`;
    }
    /* Flat bonus: display as-is (integer for whole numbers, 1 decimal otherwise). */
    return `+${Number.isInteger(total) ? total : total.toFixed(1)}`;
  }

  /**
   * Formats the prerequisite requirement text for a capstone node.
   * Example: "Requires: 2 stats at Tier 2"
   *
   * @param capstoneDef - Capstone definition.
   * @returns Human-readable prerequisite string.
   */
  private formatCapstonePrereq(capstoneDef: CapstoneDefinition): string {
    /* All prerequisites have the same minTier for a given capstone. */
    const minTier = capstoneDef.prerequisites[0]?.minTier ?? 0;
    return `Requires: ${capstoneDef.requiredCount} stats at Tier ${minTier}`;
  }

  /**
   * Shows a brief red flash near a pip when the player taps it without
   * enough XP. Non-blocking visual-only feedback.
   *
   * @param x - Center X of the pip (in content-container space).
   * @param y - Center Y of the pip (in content-container space).
   */
  private showInsufficientFeedback(x: number, y: number): void {
    if (!this.contentContainer) return;

    const text = this.add.text(x, y - PIP_RADIUS - 8, 'Not enough XP', {
      fontSize: '11px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: COLOR_RED_STR,
    }).setOrigin(0.5);
    this.contentContainer.add(text);

    /* Fade out and destroy after 1 second. */
    this.tweens.add({
      targets: text,
      alpha: 0,
      y: y - PIP_RADIUS - 24,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Plays a gold particle burst VFX at the given screen position.
   * Uses Phaser's built-in particle system for a simple burst effect.
   *
   * @param x - World X position for the burst center.
   * @param y - World Y position for the burst center.
   */
  private playPurchaseVFX(x: number, y: number): void {
    /* Create a temporary particle emitter for the gold burst.
     * Uses the '__WHITE' texture built into Phaser as a 4x4 white square. */
    const particles = this.add.particles(x, y, '__WHITE', {
      speed: { min: 60, max: 160 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: COLOR_GOLD,
      lifespan: 500,
      quantity: 12,
      emitting: false,
    });
    particles.setDepth(50);

    /* Single burst, then clean up. */
    particles.explode(12);
    this.time.delayedCall(600, () => particles.destroy());
  }
}
