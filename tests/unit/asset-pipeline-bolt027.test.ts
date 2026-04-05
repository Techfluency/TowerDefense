/**
 * BOLT-027: Tiny Swords asset pipeline tests.
 * Verifies all asset keys, manifest entries, file existence, frame dimensions,
 * key uniqueness, and scope boundaries (no tower sprites registered).
 */
import { describe, it, expect } from 'vitest';
import { ASSET_MANIFEST } from '../../src/config/asset-manifest';
import {
  ENEMY_SHEETS,
  TERRAIN_KEYS,
  VFX_SHEETS,
  DECO_KEYS,
  PROJECTILE_SHEETS,
  BUILDING_KEYS,
  RESOURCE_KEYS,
} from '../../src/config/asset-keys';
import * as fs from 'fs';
import * as path from 'path';

const sprites = ASSET_MANIFEST.sprites;
const spritesheets = ASSET_MANIFEST.spritesheets;
const allSpriteKeys = sprites.map((s) => s.key);
const allSheetKeys = spritesheets.map((s) => s.key);
const allKeys = [...allSpriteKeys, ...allSheetKeys];
const assetsRoot = path.resolve(__dirname, '../../public/assets');

// -- AC-01c: all keys are typed constants, not bare strings --
describe('BOLT-027: Asset key constants', () => {
  it('should export ENEMY_SHEETS with all 11 archetype keys', () => {
    const keys = Object.values(ENEMY_SHEETS);
    expect(keys).toHaveLength(11);
    expect(keys).toContain('enemy-runner-sheet');
    expect(keys).toContain('enemy-tank-sheet');
    expect(keys).toContain('enemy-fast-sheet');
    expect(keys).toContain('enemy-flyer-sheet');
    expect(keys).toContain('enemy-swarm-sheet');
    expect(keys).toContain('enemy-shielded-sheet');
    expect(keys).toContain('enemy-support-sheet');
    expect(keys).toContain('enemy-boss-sheet');
  });

  it('should export TERRAIN_KEYS with 8 terrain keys', () => {
    const keys = Object.values(TERRAIN_KEYS);
    expect(keys).toHaveLength(8);
    expect(keys).toContain('terrain-tilemap-flat');
    expect(keys).toContain('terrain-water');
    expect(keys).toContain('terrain-foam');
  });

  it('should export VFX_SHEETS with explosion and fire', () => {
    const keys = Object.values(VFX_SHEETS);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('vfx-explosion');
    expect(keys).toContain('vfx-fire');
  });

  it('should export DECO_KEYS with 17 decoration keys', () => {
    const keys = Object.values(DECO_KEYS);
    expect(keys).toHaveLength(17);
    expect(keys).toContain('deco-bush-1');
    expect(keys).toContain('deco-rock-1');
    expect(keys).toContain('deco-cloud-1');
    expect(keys).toContain('deco-spawn-campfire');
  });

  it('should export PROJECTILE_SHEETS with arrow and dynamite', () => {
    const keys = Object.values(PROJECTILE_SHEETS);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('projectile-arrow-sheet');
    expect(keys).toContain('projectile-dynamite-sheet');
  });

  it('should export BUILDING_KEYS with castle variants', () => {
    const keys = Object.values(BUILDING_KEYS);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('building-castle-blue');
    expect(keys).toContain('building-castle-destroyed');
  });

  it('should export RESOURCE_KEYS with gold', () => {
    const keys = Object.values(RESOURCE_KEYS);
    expect(keys).toHaveLength(1);
    expect(keys).toContain('resource-gold');
  });
});

// -- AC-04a: every constant value matches a manifest entry --
describe('BOLT-027: Key constants match manifest entries', () => {
  const allConstantValues = [
    ...Object.values(ENEMY_SHEETS),
    ...Object.values(TERRAIN_KEYS),
    ...Object.values(VFX_SHEETS),
    ...Object.values(DECO_KEYS),
    ...Object.values(PROJECTILE_SHEETS),
    ...Object.values(BUILDING_KEYS),
    ...Object.values(RESOURCE_KEYS),
  ];

  it.each(allConstantValues)(
    'constant value "%s" should exist in the manifest',
    (keyValue) => {
      expect(allKeys).toContain(keyValue);
    },
  );
});

// -- AC-02a: each enemy archetype maps to exactly one spritesheet --
describe('BOLT-027: Enemy spritesheet manifest entries', () => {
  const expectedEnemySheets = [
    { key: 'enemy-runner-sheet', path: 'sprites/enemies/gnoll-walk.png', fw: 192, fh: 192 },
    { key: 'enemy-runner-alt-sheet', path: 'sprites/enemies/thief-run.png', fw: 192, fh: 192 },
    { key: 'enemy-tank-sheet', path: 'sprites/enemies/troll-walk.png', fw: 384, fh: 384 },
    { key: 'enemy-tank-alt-sheet', path: 'sprites/enemies/bear-run.png', fw: 256, fh: 256 },
    { key: 'enemy-fast-sheet', path: 'sprites/enemies/spider-run.png', fw: 192, fh: 192 },
    { key: 'enemy-fast-alt-sheet', path: 'sprites/enemies/snake-run.png', fw: 192, fh: 192 },
    { key: 'enemy-flyer-sheet', path: 'sprites/enemies/skull-run.png', fw: 192, fh: 192 },
    { key: 'enemy-swarm-sheet', path: 'sprites/enemies/gnome-run.png', fw: 192, fh: 192 },
    { key: 'enemy-shielded-sheet', path: 'sprites/enemies/turtle-walk.png', fw: 320, fh: 320 },
    { key: 'enemy-support-sheet', path: 'sprites/enemies/shaman-run.png', fw: 192, fh: 192 },
    { key: 'enemy-boss-sheet', path: 'sprites/enemies/minotaur-walk.png', fw: 320, fh: 320 },
  ];

  it.each(expectedEnemySheets)(
    'should register $key with correct path and frame size',
    ({ key, path: expectedPath, fw, fh }) => {
      const entry = spritesheets.find((s) => s.key === key);
      expect(entry).toBeDefined();
      expect(entry!.path).toBe(expectedPath);
      expect(entry!.frameWidth).toBe(fw);
      expect(entry!.frameHeight).toBe(fh);
    },
  );
});

// -- AC-06a: frame dimensions are valid (non-zero, positive) --
describe('BOLT-027: Spritesheet frame dimensions', () => {
  const bolt027Sheets = spritesheets.filter(
    (s) =>
      (s.key.startsWith('enemy-') && s.key.endsWith('-sheet')) ||
      s.key.startsWith('terrain-') ||
      s.key.startsWith('vfx-') ||
      s.key.startsWith('deco-bush-') ||
      (s.key.startsWith('projectile-') && s.key.endsWith('-sheet')),
  );

  // 11 enemy + 7 terrain + 2 vfx + 4 bush + 2 projectile = 26
  it('should have registered 26 BOLT-027 spritesheets', () => {
    expect(bolt027Sheets).toHaveLength(26);
  });

  it.each(bolt027Sheets.map((s) => s.key))(
    '%s should have positive, non-zero frame dimensions',
    (key) => {
      const entry = spritesheets.find((s) => s.key === key);
      expect(entry!.frameWidth).toBeGreaterThan(0);
      expect(entry!.frameHeight).toBeGreaterThan(0);
    },
  );
});

// -- AC-03c: no tower sprites registered by this bolt --
describe('BOLT-027: Scope boundary -- no tower sprites', () => {
  const towerFiles = [
    'Tower_Blue.png', 'Tower_Purple.png', 'Tower_Red.png',
    'Tower_Yellow.png', 'Tower_Construction.png', 'Tower_Destroyed.png',
  ];

  it('should not register any Tower_ sprite files in BOLT-027 entries', () => {
    const bolt027Paths = [
      ...sprites.filter((s) => s.path.includes('buildings/')).map((s) => s.path),
      ...spritesheets.map((s) => s.path),
    ];
    for (const towerFile of towerFiles) {
      const match = bolt027Paths.find((p) => p.toLowerCase().includes(towerFile.toLowerCase()));
      expect(match).toBeUndefined();
    }
  });
});

// -- Key uniqueness across the entire manifest --
describe('BOLT-027: Key uniqueness', () => {
  it('should have no duplicate keys across sprites and spritesheets', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const key of allKeys) {
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('should have no key collision between BOLT-027 sheets and existing placeholder sprites', () => {
    const existingPlaceholders = ['enemy-runner', 'enemy-tank', 'enemy-fast',
      'enemy-flyer', 'enemy-swarm', 'enemy-shielded', 'enemy-support', 'enemy-boss',
      'projectile-arrow', 'projectile-blast', 'projectile-missile'];
    for (const placeholder of existingPlaceholders) {
      expect(allSheetKeys).not.toContain(placeholder);
    }
  });
});

// -- File existence on disk for all BOLT-027 assets --
describe('BOLT-027: PNG file existence', () => {
  const bolt027SpriteEntries = sprites.filter(
    (s) =>
      s.key.startsWith('terrain-water') ||
      s.key.startsWith('deco-') ||
      s.key.startsWith('building-') ||
      s.key.startsWith('resource-'),
  );

  const bolt027SheetEntries = spritesheets.filter(
    (s) =>
      (s.key.startsWith('enemy-') && s.key.endsWith('-sheet')) ||
      s.key.startsWith('terrain-') ||
      s.key.startsWith('vfx-') ||
      s.key.startsWith('deco-bush-') ||
      (s.key.startsWith('projectile-') && s.key.endsWith('-sheet')),
  );

  const allBolt027Entries = [
    ...bolt027SpriteEntries.map((e) => ({ key: e.key, path: e.path })),
    ...bolt027SheetEntries.map((e) => ({ key: e.key, path: e.path })),
  ];

  it.each(allBolt027Entries.map((e) => e.key))(
    'should have PNG on disk for %s',
    (key) => {
      const entry = allBolt027Entries.find((e) => e.key === key);
      expect(entry).toBeDefined();
      const filePath = path.join(assetsRoot, entry!.path);
      expect(fs.existsSync(filePath)).toBe(true);
    },
  );
});

// -- AC-02c: Walk sheets used where Run sheets don't exist --
describe('BOLT-027: Walk sheet fallback for enemies without Run sheets', () => {
  const walkFallbacks = [
    { archetype: 'runner (Gnoll)', key: 'enemy-runner-sheet', expectedFile: 'gnoll-walk.png' },
    { archetype: 'tank (Troll)', key: 'enemy-tank-sheet', expectedFile: 'troll-walk.png' },
    { archetype: 'shielded (Turtle)', key: 'enemy-shielded-sheet', expectedFile: 'turtle-walk.png' },
    { archetype: 'boss (Minotaur)', key: 'enemy-boss-sheet', expectedFile: 'minotaur-walk.png' },
  ];

  it.each(walkFallbacks)(
    '$archetype should use walk sheet ($expectedFile)',
    ({ key, expectedFile }) => {
      const entry = spritesheets.find((s) => s.key === key);
      expect(entry).toBeDefined();
      expect(entry!.path).toContain(expectedFile);
    },
  );
});

// -- Verify terrain keys use 'terrain-' prefix, not 'tile-' to avoid BOLT-010 collision --
describe('BOLT-027: Terrain key prefix convention', () => {
  it('should use terrain- prefix for all new terrain entries', () => {
    const terrainValues = Object.values(TERRAIN_KEYS);
    for (const val of terrainValues) {
      expect(val).toMatch(/^terrain-/);
    }
  });

  it('should not collide with existing tile- prefix keys from BOLT-010', () => {
    const existingTileKeys = allSpriteKeys.filter((k) => k.startsWith('tile-'));
    const terrainValues = Object.values(TERRAIN_KEYS);
    for (const terrainKey of terrainValues) {
      expect(existingTileKeys).not.toContain(terrainKey);
    }
  });
});
