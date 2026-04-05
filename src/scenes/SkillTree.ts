/**
 * Skill Tree scene -- tabbed interface for purchasing permanent upgrades.
 *
 * Players spend XP earned from runs on per-tower stat upgrades (5 tiers),
 * capstone ability nodes (non-interactive in this bolt), and global bonuses
 * (3 tiers). Reads state from SkillTreeManager on the Phaser registry.
 *
 * Layout: tab bar at top, scrollable content in the middle, persistent
 * footer with Available XP and Back button.
 *
 * BOLT-025 implementation. BOLT-026 adds capstone interactivity.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-constants';
import { fadeIn, fadeTransition } from '../ui/ui-animations';
import type { SkillTreeManager } from '../utils/skill-tree-manager';
import type { SkillTreeConfig, TowerStatName } from '../types/game-types';
import {
  TABS,
  TAB_Y, TAB_BTN_HEIGHT,
  FOOTER_HEIGHT, CONTENT_TOP, CONTENT_BOTTOM, CONTENT_VISIBLE_HEIGHT,
  BG_COLOR, COLOR_GOLD, COLOR_GOLD_STR,
  MODAL_BORDER_COLOR, BTN_BG, BTN_HOVER, BTN_CORNER_RADIUS,
  STAT_ORDER, STAT_ROW_HEIGHT, STAT_DISPLAY_NAMES,
  CAPSTONE_ROW_HEIGHT,
} from '../ui/skill-tree/skill-tree-layout';
import { buildStatRow, buildGlobalRow } from '../ui/skill-tree/stat-row-builder';
import { buildCapstoneRow } from '../ui/skill-tree/capstone-row-builder';
import {
  showConfirmationModal,
  closeModal,
} from '../ui/skill-tree/confirmation-modal';

export class SkillTree extends Phaser.Scene {
  /** SkillTreeManager reference from the Phaser registry. */
  private manager!: SkillTreeManager;
  /** Parsed skill tree config (costs, capstones, global upgrades). */
  private config!: SkillTreeConfig;

  /** Currently active tab index (0-4). */
  private activeTabIndex = 0;
  /** Content container (rebuilt on tab switch). */
  private contentContainer: Phaser.GameObjects.Container | null = null;
  /** Tab button backgrounds (for highlight toggling). */
  private tabBgs: Phaser.GameObjects.Graphics[] = [];
  /** Footer XP text (updated after purchases). */
  private xpText: Phaser.GameObjects.Text | null = null;
  /** Open confirmation modal (null when closed). */
  private modal: Phaser.GameObjects.Container | null = null;
  /** Scene to return to from Back button. */
  private returnScene: string = SCENE_KEYS.MAIN_MENU;
  /** Geometry mask for content scroll clipping. */
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  /** Total height of content (may exceed visible area). */
  private totalContentHeight = 0;
  /** Current scroll offset (0 = top, negative = scrolled down). */
  private scrollOffset = 0;

  constructor() {
    super({ key: 'SkillTree' });
  }

  /** Receives returnScene from the launching scene. */
  init(data?: { returnScene?: string }): void {
    this.returnScene = data?.returnScene ?? SCENE_KEYS.MAIN_MENU;
    this.activeTabIndex = 0;
    this.scrollOffset = 0;
  }

  /** Builds the full skill tree UI. */
  create(): void {
    this.resolveManager();
    this.ensureConfig();

    this.cameras.main.setBackgroundColor(BG_COLOR);
    fadeIn(this);

    this.buildTabBar();
    this.buildFooter();
    this.buildContentForTab(this.activeTabIndex);
    this.setupScrollInput();
  }

  // -------------------------------------------------------------------------
  // Manager resolution and config binding
  // -------------------------------------------------------------------------

  /** Resolves the SkillTreeManager from the registry. */
  private resolveManager(): void {
    this.manager = this.registry.get('skillTreeManager') as SkillTreeManager;
    if (!this.manager) {
      const pm = this.registry.get('progressionManager') as
        { getSkillTreeManager(): SkillTreeManager } | undefined;
      if (pm) this.manager = pm.getSkillTreeManager();
    }
  }

  /** Binds config from cache if not already bound (mirrors Gameplay pattern). */
  private ensureConfig(): void {
    try {
      this.config = this.manager.getConfig();
    } catch {
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

  /** Builds the row of tab buttons across the top. */
  private buildTabBar(): void {
    const tabWidth = Math.floor(GAME_WIDTH / TABS.length);
    this.tabBgs = [];

    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i]!;
      const x = i * tabWidth;

      const bg = this.add.graphics().setDepth(10);
      this.tabBgs.push(bg);
      this.drawTabBg(i, i === this.activeTabIndex);

      this.add.text(x + tabWidth / 2, TAB_Y + TAB_BTN_HEIGHT / 2, tab.label, {
        fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
      }).setOrigin(0.5).setDepth(11);

      const hitZone = this.add.zone(
        x + tabWidth / 2, TAB_Y + TAB_BTN_HEIGHT / 2, tabWidth - 4, TAB_BTN_HEIGHT,
      ).setInteractive({ useHandCursor: true }).setDepth(12);
      hitZone.on('pointerdown', () => this.switchTab(i));
    }
  }

  /** Draws a tab background (active = colored, inactive = dim). */
  private drawTabBg(index: number, active: boolean): void {
    const bg = this.tabBgs[index]!;
    const tab = TABS[index]!;
    const tabWidth = Math.floor(GAME_WIDTH / TABS.length);
    const x = index * tabWidth;

    bg.clear();
    if (active) {
      bg.fillStyle(tab.color, 0.35);
      bg.fillRoundedRect(x + 2, TAB_Y, tabWidth - 4, TAB_BTN_HEIGHT, 4);
      bg.fillStyle(tab.color, 1);
      bg.fillRect(x + 2, TAB_Y + TAB_BTN_HEIGHT - 3, tabWidth - 4, 3);
    } else {
      bg.fillStyle(0x222244, 0.6);
      bg.fillRoundedRect(x + 2, TAB_Y, tabWidth - 4, TAB_BTN_HEIGHT, 4);
    }
  }

  /** Switches active tab and rebuilds content. */
  private switchTab(index: number): void {
    if (index === this.activeTabIndex || this.modal) return;
    const prev = this.activeTabIndex;
    this.activeTabIndex = index;
    this.drawTabBg(prev, false);
    this.drawTabBg(index, true);
    this.scrollOffset = 0;
    this.buildContentForTab(index);
  }

  // -------------------------------------------------------------------------
  // Content Area
  // -------------------------------------------------------------------------

  /** Destroys old content and builds content for the given tab. */
  private buildContentForTab(tabIndex: number): void {
    if (this.contentContainer) this.contentContainer.destroy();
    if (this.contentMask) this.contentMask.destroy();

    this.contentContainer = this.add.container(0, CONTENT_TOP);
    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(0, CONTENT_TOP, GAME_WIDTH, CONTENT_VISIBLE_HEIGHT);
    maskShape.setVisible(false);
    this.contentMask = maskShape.createGeometryMask();
    this.contentContainer.setMask(this.contentMask);

    const tab = TABS[tabIndex]!;
    if (tab.towerId) {
      this.buildTowerTab(tab.towerId, tab.label, tab.color);
    } else {
      this.buildGlobalTab();
    }
  }

  /** Builds per-tower tab: header, 4 stat rows, 2 capstone placeholders. */
  private buildTowerTab(towerId: string, name: string, color: number): void {
    const c = this.contentContainer!;
    let y = 10;

    c.add(this.add.text(GAME_WIDTH / 2, y, `${name} Tower`, {
      fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));
    y += 40;

    for (const stat of STAT_ORDER) {
      buildStatRow(this, c, this.manager, towerId, stat, y, color,
        (tid, s, cost) => this.handleStatPurchase(tid, s, cost));
      y += STAT_ROW_HEIGHT;
    }

    y += 8;
    const sep = this.add.graphics();
    sep.lineStyle(1, MODAL_BORDER_COLOR, 0.5);
    sep.lineBetween(40, y, GAME_WIDTH - 40, y);
    c.add(sep);
    y += 16;

    c.add(this.add.text(GAME_WIDTH / 2, y, 'Capstone Abilities', {
      fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#AAAAAA',
    }).setOrigin(0.5));
    y += 28;

    const caps = this.config.capstones.filter(cap => cap.towerId === towerId);
    for (const cap of caps) {
      buildCapstoneRow(this, c, this.manager, cap, towerId, y);
      y += CAPSTONE_ROW_HEIGHT;
    }
    this.totalContentHeight = y + 10;
  }

  /** Builds global tab: header and 6 upgrade rows. */
  private buildGlobalTab(): void {
    const c = this.contentContainer!;
    let y = 10;

    c.add(this.add.text(GAME_WIDTH / 2, y, 'Global Upgrades', {
      fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: COLOR_GOLD_STR,
    }).setOrigin(0.5));
    y += 40;

    for (const def of this.config.globalUpgrades) {
      buildGlobalRow(this, c, this.manager, def, y,
        (id, nm, cost) => this.handleGlobalPurchase(id, nm, cost));
      y += STAT_ROW_HEIGHT;
    }
    this.totalContentHeight = y + 10;
  }

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------

  /** Builds persistent footer with XP display and Back button. */
  private buildFooter(): void {
    const fy = GAME_HEIGHT - FOOTER_HEIGHT;
    const bg = this.add.graphics().setDepth(20);
    bg.fillStyle(0x0D0D1A, 0.95);
    bg.fillRect(0, fy, GAME_WIDTH, FOOTER_HEIGHT);
    bg.lineStyle(1, MODAL_BORDER_COLOR, 0.8);
    bg.lineBetween(0, fy, GAME_WIDTH, fy);

    this.xpText = this.add.text(30, fy + FOOTER_HEIGHT / 2,
      `Available XP: ${this.manager.getAvailableXp()}`, {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: COLOR_GOLD_STR,
      }).setOrigin(0, 0.5).setDepth(21);

    this.createFooterButton(GAME_WIDTH - 100, fy + FOOTER_HEIGHT / 2, 'Back',
      () => fadeTransition(this, () => this.scene.start(this.returnScene)));
  }

  /** Creates a styled footer button. */
  private createFooterButton(x: number, y: number, label: string, onClick: () => void): void {
    const w = 120, h = 36;
    const bg = this.add.graphics().setDepth(21);
    bg.fillStyle(BTN_BG, 1);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, BTN_CORNER_RADIUS);

    this.add.text(x, y, label, {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(22);

    const hz = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(22);
    hz.on('pointerover', () => { bg.clear(); bg.fillStyle(BTN_HOVER, 1); bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, BTN_CORNER_RADIUS); });
    hz.on('pointerout', () => { bg.clear(); bg.fillStyle(BTN_BG, 1); bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, BTN_CORNER_RADIUS); });
    hz.on('pointerdown', onClick);
  }

  // -------------------------------------------------------------------------
  // Purchase Handlers
  // -------------------------------------------------------------------------

  /** Handles stat pip purchase -- opens confirmation modal. */
  private handleStatPurchase(towerId: string, stat: TowerStatName, cost: number): void {
    if (this.modal) return;
    const name = `${STAT_DISPLAY_NAMES[stat]} Tier ${this.manager.getStatTier(towerId, stat) + 1}`;
    const remaining = this.manager.getAvailableXp() - cost;

    this.modal = showConfirmationModal(this, name, cost, remaining,
      () => { this.closeAndClearModal(); if (this.manager.purchaseStatTier(towerId, stat)) this.onPurchaseComplete(); },
      () => this.closeAndClearModal());
  }

  /** Handles global pip purchase -- opens confirmation modal. */
  private handleGlobalPurchase(upgradeId: string, upgradeName: string, cost: number): void {
    if (this.modal) return;
    const name = `${upgradeName} Tier ${this.manager.getGlobalTier(upgradeId) + 1}`;
    const remaining = this.manager.getAvailableXp() - cost;

    this.modal = showConfirmationModal(this, name, cost, remaining,
      () => { this.closeAndClearModal(); if (this.manager.purchaseGlobalTier(upgradeId)) this.onPurchaseComplete(); },
      () => this.closeAndClearModal());
  }

  /** Closes the modal and clears the reference. */
  private closeAndClearModal(): void {
    if (this.modal) { closeModal(this, this.modal); this.modal = null; }
  }

  /** Refreshes UI after a purchase: rebuild content, update XP, play VFX. */
  private onPurchaseComplete(): void {
    this.playPurchaseVFX(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.buildContentForTab(this.activeTabIndex);
    if (this.xpText) this.xpText.setText(`Available XP: ${this.manager.getAvailableXp()}`);
  }

  /** Gold particle burst VFX on purchase. */
  private playPurchaseVFX(x: number, y: number): void {
    const particles = this.add.particles(x, y, '__WHITE', {
      speed: { min: 60, max: 160 }, scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 }, tint: COLOR_GOLD,
      lifespan: 500, quantity: 12, emitting: false,
    });
    particles.setDepth(50);
    particles.explode(12);
    this.time.delayedCall(600, () => particles.destroy());
  }

  // -------------------------------------------------------------------------
  // Scroll
  // -------------------------------------------------------------------------

  /** Sets up mouse wheel and touch drag scrolling. */
  private setupScrollInput(): void {
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (!this.modal) this.applyScroll(-dy * 0.5);
    });
    let dragStartY = 0, dragStartOff = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y >= CONTENT_TOP && p.y <= CONTENT_BOTTOM) { dragStartY = p.y; dragStartOff = this.scrollOffset; }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.modal) return;
      if (dragStartY >= CONTENT_TOP && dragStartY <= CONTENT_BOTTOM) {
        this.scrollOffset = dragStartOff + (p.y - dragStartY);
        this.clampScroll();
        if (this.contentContainer) this.contentContainer.y = CONTENT_TOP + this.scrollOffset;
      }
    });
  }

  private applyScroll(delta: number): void {
    this.scrollOffset += delta;
    this.clampScroll();
    if (this.contentContainer) this.contentContainer.y = CONTENT_TOP + this.scrollOffset;
  }

  private clampScroll(): void {
    const max = this.totalContentHeight - CONTENT_VISIBLE_HEIGHT;
    this.scrollOffset = max <= 0 ? 0 : Math.max(-max, Math.min(0, this.scrollOffset));
  }
}
