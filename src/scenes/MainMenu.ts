/**
 * Main menu scene -- polished title screen with New Game and Settings.
 *
 * Replaces the BOLT-001 stub. Implements:
 * - Polished title and version display
 * - New Game button (styled)
 * - Settings button opening a functional settings panel
 * - Settings panel: SFX volume slider, Music volume slider,
 *   Reduce Visual Intensity toggle
 * - Settings persistence via registry (session-only)
 *
 * BOLT-009 implementation. BOLT-016 adds fade transitions and panel animation.
 * BOLT-024: Replaces level display with Available XP and Skill Tree button.
 */
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../config/game-constants';
import type { EnvConfig } from '../config/env';
import { fadeTransition, fadeIn, scaleIn } from '../ui/ui-animations';
import type { ProgressionManager } from '../utils/progression-manager';

/** Settings state stored on registry. */
interface SettingsState {
  sfxVolume: number;
  musicVolume: number;
  reduceVisualIntensity: boolean;
}

/** Panel styling constants. */
const PANEL_WIDTH = 360;
const PANEL_BG_COLOR = 0x0D0D1A;
const PANEL_BG_ALPHA = 0.92;
const PANEL_BORDER_COLOR = 0x4A4A6A;
const PANEL_CORNER_RADIUS = 8;

/** Slider constants. */
const SLIDER_TRACK_WIDTH = 200;
const SLIDER_TRACK_HEIGHT = 6;
const SLIDER_TRACK_COLOR = 0x4A4A6A;
const SLIDER_FILL_COLOR = 0x4A90D9;
const SLIDER_HANDLE_RADIUS = 7;

/** Toggle constants. */
const TOGGLE_WIDTH = 40;
const TOGGLE_HEIGHT = 20;

/** Button constants. */
const BTN_CORNER_RADIUS = 6;
const BTN_PLAY_BG = 0x2A4A2A;
const BTN_PLAY_HOVER = 0x3A6A3A;
const BTN_MENU_BG = 0x2A2A4A;
const BTN_MENU_HOVER = 0x3A3A6A;

export class MainMenu extends Phaser.Scene {
  /** Settings panel container (created on Settings click, destroyed on Close). */
  private settingsPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU });
  }

  /**
   * Builds the main menu UI: title, version, New Game, Settings.
   */
  create(): void {
    const envConfig = this.registry.get('envConfig') as EnvConfig;

    /* Initialize default game settings on registry if not already set. */
    if (!this.registry.get('gameSettings')) {
      this.registry.set('gameSettings', {
        sfxVolume: 100,
        musicVolume: 100,
        reduceVisualIntensity: false,
      } as SettingsState);
    }

    /* Auto-start: skip menu if ?autostart is in the URL (for testing). */
    if (window.location.search.includes('autostart')) {
      this.scene.start(SCENE_KEYS.GAMEPLAY);
      return;
    }

    /* --- Background --- */
    this.cameras.main.setBackgroundColor('#1A1A2E');

    /* BOLT-016: Fade in from black on scene entry. */
    fadeIn(this);

    /* --- Title --- */
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, 'Random Gen', {
      fontSize: '52px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.25 + 50, 'Tower Defense', {
      fontSize: '40px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#E0E0E0',
    }).setOrigin(0.5);

    /* --- Version --- */
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.25 + 100, `v${envConfig.gameVersion}`, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#666666',
    }).setOrigin(0.5);

    /* --- BOLT-024: Available XP Display (replaces BOLT-021 level display) --- */
    this.renderAvailableXP(GAME_HEIGHT * 0.44);

    /* --- New Game Button --- */
    this.createButton(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.55,
      240, 48,
      'New Game',
      { fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFFFFF' },
      BTN_PLAY_BG, BTN_PLAY_HOVER,
      /* BOLT-016: Fade out before scene switch for smooth transition. */
      () => fadeTransition(this, () => this.scene.start(SCENE_KEYS.GAMEPLAY)),
    );

    /* --- Skill Tree Button (BOLT-024) ---
     * Navigates to SkillTree scene (implemented in BOLT-025).
     * Disabled if scene key doesn't exist yet -- graceful degradation. */
    this.createButton(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + 64,
      200, 40,
      'Skill Tree',
      { fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#FFD700' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      () => {
        /* BOLT-025: Navigate to SkillTree scene with return-to-MainMenu data. */
        if (this.scene.manager.getScene('SkillTree')) {
          fadeTransition(this, () => this.scene.start('SkillTree', {
            returnScene: SCENE_KEYS.MAIN_MENU,
          }));
        }
      },
    );

    /* --- Settings Button --- */
    this.createButton(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + 128,
      200, 40,
      'Settings',
      { fontSize: '18px', fontFamily: 'monospace', color: '#AAAAAA' },
      BTN_MENU_BG, BTN_MENU_HOVER,
      () => this.openSettingsPanel(),
    );

    /* --- Escape key to close settings --- */
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => {
        if (this.settingsPanel) this.closeSettingsPanel();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // BOLT-024: Available XP Display
  // ---------------------------------------------------------------------------

  /**
   * Renders the "Available XP" text on the main menu.
   * Reads from the SkillTreeManager via the ProgressionManager on the registry.
   * Replaces the old BOLT-021 level/XP-bar display.
   *
   * @param y - Y position for the XP display section.
   */
  private renderAvailableXP(y: number): void {
    const pm = this.registry.get('progressionManager') as ProgressionManager | undefined;
    if (!pm) return;

    const skillTree = pm.getSkillTreeManager();
    const availableXp = skillTree.getAvailableXp();
    const totalXpEarned = skillTree.getTotalXpEarned();
    const centerX = GAME_WIDTH / 2;

    /* Available XP (the spendable balance -- primary display). */
    this.add.text(centerX, y, `Available XP: ${availableXp}`, {
      fontSize: '20px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#FFD700',
    }).setOrigin(0.5);

    /* Lifetime XP earned (secondary stat). */
    this.add.text(centerX, y + 26, `Total Earned: ${totalXpEarned}`, {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#666666',
    }).setOrigin(0.5);
  }

  // ---------------------------------------------------------------------------
  // Settings Panel
  // ---------------------------------------------------------------------------

  /** Opens the settings panel overlay. */
  private openSettingsPanel(): void {
    if (this.settingsPanel) return;

    const settings = (this.registry.get('gameSettings') as SettingsState) ?? {
      sfxVolume: 100, musicVolume: 100, reduceVisualIntensity: false,
    };

    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    container.setDepth(105);

    /* Background. */
    const panelHeight = 260;
    const bg = this.add.graphics();
    bg.fillStyle(PANEL_BG_COLOR, PANEL_BG_ALPHA);
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, PANEL_CORNER_RADIUS);
    bg.lineStyle(1, PANEL_BORDER_COLOR, 1);
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, PANEL_CORNER_RADIUS);
    container.add(bg);

    /* Header. */
    const header = this.add.text(0, -panelHeight / 2 + 20, 'Settings', {
      fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#E0E0E0',
    }).setOrigin(0.5);
    container.add(header);

    /* Separator. */
    const sep = this.add.graphics();
    sep.lineStyle(1, PANEL_BORDER_COLOR, 1);
    sep.lineBetween(-PANEL_WIDTH / 2 + 10, -panelHeight / 2 + 42, PANEL_WIDTH / 2 - 10, -panelHeight / 2 + 42);
    container.add(sep);

    /* SFX Volume slider. */
    let rowY = -panelHeight / 2 + 68;
    this.addSliderRow(container, rowY, 'SFX Volume', settings.sfxVolume, (val) => {
      const s = this.registry.get('gameSettings') as SettingsState;
      s.sfxVolume = val;
      this.registry.set('gameSettings', s);
    });

    /* Music Volume slider. */
    rowY += 50;
    this.addSliderRow(container, rowY, 'Music Volume', settings.musicVolume, (val) => {
      const s = this.registry.get('gameSettings') as SettingsState;
      s.musicVolume = val;
      this.registry.set('gameSettings', s);
    });

    /* Separator 2. */
    rowY += 40;
    const sep2 = this.add.graphics();
    sep2.lineStyle(1, PANEL_BORDER_COLOR, 1);
    sep2.lineBetween(-PANEL_WIDTH / 2 + 10, rowY, PANEL_WIDTH / 2 - 10, rowY);
    container.add(sep2);

    /* Reduce Visual Intensity toggle. */
    rowY += 28;
    this.addToggleRow(container, rowY, 'Reduce Visual Intensity', settings.reduceVisualIntensity, (val) => {
      const s = this.registry.get('gameSettings') as SettingsState;
      s.reduceVisualIntensity = val;
      this.registry.set('gameSettings', s);
    });

    /* Close button. */
    rowY += 40;
    const closeBtn = this.add.text(0, rowY, 'Close', {
      fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#4A90D9',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#6AB0FF'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#4A90D9'));
    closeBtn.on('pointerdown', () => this.closeSettingsPanel());
    container.add(closeBtn);

    this.settingsPanel = container;

    /* BOLT-016: Animate the panel in with a scale pop. */
    scaleIn(this, container);
  }

  /** Closes the settings panel with a brief scale-down animation. */
  private closeSettingsPanel(): void {
    if (this.settingsPanel) {
      const panel = this.settingsPanel;
      this.settingsPanel = null;
      /* BOLT-016: Scale-down before destroy for polished dismiss. */
      this.tweens.add({
        targets: panel,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: 150,
        ease: 'Sine.easeIn',
        onComplete: () => panel.destroy(),
      });
    }
  }

  /**
   * Adds a slider row (label + slider) to the settings panel container.
   *
   * @param container - Parent container.
   * @param y - Y position relative to container origin.
   * @param label - Setting name.
   * @param initialValue - Current value (0-100).
   * @param onChange - Callback when value changes.
   */
  private addSliderRow(
    container: Phaser.GameObjects.Container,
    y: number,
    label: string,
    initialValue: number,
    onChange: (val: number) => void,
  ): void {
    /* Label. */
    const labelText = this.add.text(-PANEL_WIDTH / 2 + 20, y, label, {
      fontSize: '14px', fontFamily: 'monospace', color: '#E0E0E0',
    }).setOrigin(0, 0.5);
    container.add(labelText);

    /* Value display. */
    const valueText = this.add.text(PANEL_WIDTH / 2 - 20, y, `${initialValue}`, {
      fontSize: '14px', fontFamily: 'monospace', color: '#E0E0E0',
    }).setOrigin(1, 0.5);
    container.add(valueText);

    /* Slider track. */
    const trackX = 20;
    const track = this.add.graphics();
    track.fillStyle(SLIDER_TRACK_COLOR, 1);
    track.fillRect(trackX, y + 10, SLIDER_TRACK_WIDTH, SLIDER_TRACK_HEIGHT);
    container.add(track);

    /* Slider fill. */
    const fill = this.add.graphics();
    const fillWidth = (initialValue / 100) * SLIDER_TRACK_WIDTH;
    fill.fillStyle(SLIDER_FILL_COLOR, 1);
    fill.fillRect(trackX, y + 10, fillWidth, SLIDER_TRACK_HEIGHT);
    container.add(fill);

    /* Slider handle. */
    const handleX = trackX + fillWidth;
    const handleY = y + 10 + SLIDER_TRACK_HEIGHT / 2;
    const handle = this.add.circle(handleX, handleY, SLIDER_HANDLE_RADIUS, 0xFFFFFF);
    handle.setInteractive({ useHandCursor: true, draggable: true });
    container.add(handle);

    /* Drag behavior. */
    handle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
      /* Clamp handle position to track bounds. */
      const clampedX = Math.max(trackX, Math.min(trackX + SLIDER_TRACK_WIDTH, dragX));
      handle.x = clampedX;

      /* Compute value from position. */
      const ratio = (clampedX - trackX) / SLIDER_TRACK_WIDTH;
      const newValue = Math.round(ratio * 100);

      /* Update fill. */
      fill.clear();
      fill.fillStyle(SLIDER_FILL_COLOR, 1);
      fill.fillRect(trackX, y + 10, (newValue / 100) * SLIDER_TRACK_WIDTH, SLIDER_TRACK_HEIGHT);

      /* Update display and callback. */
      valueText.setText(`${newValue}`);
      onChange(newValue);
    });

    /* Make the drag scene-level so it works inside the container. */
    this.input.setDraggable(handle);
  }

  /**
   * Adds a toggle row (label + toggle switch) to the settings panel.
   *
   * @param container - Parent container.
   * @param y - Y position relative to container origin.
   * @param label - Setting name.
   * @param initialValue - Current toggle state.
   * @param onChange - Callback when toggled.
   */
  private addToggleRow(
    container: Phaser.GameObjects.Container,
    y: number,
    label: string,
    initialValue: boolean,
    onChange: (val: boolean) => void,
  ): void {
    /* Label. */
    const labelText = this.add.text(-PANEL_WIDTH / 2 + 20, y, label, {
      fontSize: '14px', fontFamily: 'monospace', color: '#E0E0E0',
    }).setOrigin(0, 0.5);
    container.add(labelText);

    /* Toggle track. */
    let isOn = initialValue;
    const trackX = PANEL_WIDTH / 2 - 60;

    const trackGfx = this.add.graphics();
    const handleGfx = this.add.circle(0, y, 8, 0xFFFFFF);

    const drawToggle = () => {
      trackGfx.clear();
      trackGfx.fillStyle(isOn ? SLIDER_FILL_COLOR : SLIDER_TRACK_COLOR, 1);
      trackGfx.fillRoundedRect(trackX, y - TOGGLE_HEIGHT / 2, TOGGLE_WIDTH, TOGGLE_HEIGHT, TOGGLE_HEIGHT / 2);
      handleGfx.x = isOn ? trackX + TOGGLE_WIDTH - 10 : trackX + 10;
    };

    drawToggle();
    container.add(trackGfx);
    container.add(handleGfx);

    /* Make clickable. */
    const hitZone = this.add.zone(trackX + TOGGLE_WIDTH / 2, y, TOGGLE_WIDTH + 10, TOGGLE_HEIGHT + 10)
      .setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', () => {
      isOn = !isOn;
      drawToggle();
      onChange(isOn);
    });
    container.add(hitZone);
  }

  // ---------------------------------------------------------------------------
  // Button Helper
  // ---------------------------------------------------------------------------

  /**
   * Creates a styled interactive button.
   */
  private createButton(
    x: number, y: number,
    width: number, height: number,
    label: string,
    textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    bgColor: number,
    hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, BTN_CORNER_RADIUS);

    this.add.text(x, y, label, textStyle).setOrigin(0.5);

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
  }
}
