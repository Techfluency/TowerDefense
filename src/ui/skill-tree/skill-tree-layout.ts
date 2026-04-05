/**
 * Shared layout constants, colors, and tab definitions for the SkillTree scene.
 *
 * Centralizes all visual configuration so individual component files
 * reference one source of truth for spacing, sizing, and color values.
 * Touch target sizes meet BOLT-022 mobile accessibility requirements
 * (44px tabs, 36px pips).
 *
 * BOLT-025.
 */
import type { TowerStatName } from '../../types/game-types';
import { GAME_WIDTH, GAME_HEIGHT } from '../../config/game-constants';

// ---------------------------------------------------------------------------
// Layout geometry
// ---------------------------------------------------------------------------

/** Height of the tab button bar at the top of the scene. */
export const TAB_BAR_HEIGHT = 52;

/** Height of the footer bar (XP display + Back button). */
export const FOOTER_HEIGHT = 60;

/** Y position where tab buttons start. */
export const TAB_Y = 14;

/** Minimum touch target for tab buttons (44px per PRD mobile spec). */
export const TAB_BTN_HEIGHT = 44;

/** Radius for tier pips (36px diameter meets 36px min from spec). */
export const PIP_RADIUS = 18;

/** Spacing between pip centers. */
export const PIP_SPACING = 50;

/** Height of each stat row in the content area. */
export const STAT_ROW_HEIGHT = 56;

/** Height of each capstone placeholder row. */
export const CAPSTONE_ROW_HEIGHT = 70;

/** Content area top Y (below tab bar). */
export const CONTENT_TOP = TAB_BAR_HEIGHT + 10;

/** Content area bottom Y (above footer). */
export const CONTENT_BOTTOM = GAME_HEIGHT - FOOTER_HEIGHT;

/** Usable content height for the scrollable region. */
export const CONTENT_VISIBLE_HEIGHT = CONTENT_BOTTOM - CONTENT_TOP;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

/** Dark background matching the game theme. */
export const BG_COLOR = '#1A1A2E';

/** Gold for available/purchasable nodes and XP display. */
export const COLOR_GOLD = 0xFFD700;
export const COLOR_GOLD_STR = '#FFD700';

/** Green for purchased/completed nodes. */
export const COLOR_GREEN = 0x44FF44;
export const COLOR_GREEN_STR = '#44FF44';

/** Gray for locked/unavailable nodes. */
export const COLOR_GRAY = 0x666666;
export const COLOR_GRAY_STR = '#666666';

/** Red for insufficient-funds flash text. */
export const COLOR_RED_STR = '#FF4444';

/** Panel and modal backgrounds. */
export const MODAL_BG_COLOR = 0x0D0D1A;
export const MODAL_BORDER_COLOR = 0x4A4A6A;

/** Button styling. */
export const BTN_BG = 0x2A2A4A;
export const BTN_HOVER = 0x3A3A6A;
export const BTN_CONFIRM_BG = 0x2A4A2A;
export const BTN_CONFIRM_HOVER = 0x3A6A3A;
export const BTN_CORNER_RADIUS = 6;

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

/** Metadata for a single tab in the skill tree interface. */
export interface TabDefinition {
  /** Display label on the tab button. */
  label: string;
  /** Tower ID (null for the Global tab). */
  towerId: string | null;
  /** Accent color for tab highlight and available pips. */
  color: number;
}

/**
 * The 5 tabs: 4 tower-specific + 1 global.
 * Order matches the PRD: Arrow, Sniper, Shockwave, AA Missile, Global.
 */
export const TABS: TabDefinition[] = [
  { label: 'Arrow', towerId: 'ranged', color: 0x44AA44 },
  { label: 'Sniper', towerId: 'focused', color: 0xAA4444 },
  { label: 'Shockwave', towerId: 'broadcast', color: 0x4488DD },
  { label: 'AA Missile', towerId: 'antiair', color: 0xDD8844 },
  { label: 'Global', towerId: null, color: COLOR_GOLD },
];

// ---------------------------------------------------------------------------
// Stat display helpers
// ---------------------------------------------------------------------------

/** Human-readable names for the four per-tower stats. */
export const STAT_DISPLAY_NAMES: Record<TowerStatName, string> = {
  damage: 'Damage',
  fireRate: 'Fire Rate',
  range: 'Range',
  upgradeDiscount: 'Upgrade Discount',
};

/** Ordered stat names for consistent row rendering. */
export const STAT_ORDER: TowerStatName[] = [
  'damage', 'fireRate', 'range', 'upgradeDiscount',
];

/** Maximum tiers per per-tower stat. */
export const MAX_STAT_TIER = 5;

/** Maximum tiers per global upgrade. */
export const MAX_GLOBAL_TIER = 3;

/* Re-export game dimensions for convenience. */
export { GAME_WIDTH, GAME_HEIGHT };
