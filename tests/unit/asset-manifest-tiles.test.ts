/**
 * BOLT-010: Tile sprite asset manifest tests.
 * Verifies all 27 auto-tile sprite keys are registered in the asset manifest,
 * legacy keys are preserved, no key collisions exist, and paths follow the
 * subdirectory convention from product-output.md.
 */
import { describe, it, expect } from 'vitest';
import { ASSET_MANIFEST } from '../../src/config/asset-manifest';
import * as fs from 'fs';
import * as path from 'path';

const sprites = ASSET_MANIFEST.sprites;
const spriteKeys = sprites.map((s) => s.key);

// Bitmask values reachable by the single-path generator (no T-junctions/crossroads)
const REACHABLE_PATH_MASKS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12];
const DIRECTIONS = ['n', 'e', 's', 'w'];

describe('BOLT-010: Tile sprite manifest entries', () => {
  // --- AC-010-04a: exactly 11 path bitmask entries ---
  describe('path bitmask sprites', () => {
    it('should have exactly 11 tile-path-N entries', () => {
      const pathKeys = spriteKeys.filter((k) => /^tile-path-\d+$/.test(k));
      expect(pathKeys).toHaveLength(11);
    });

    it.each(REACHABLE_PATH_MASKS)(
      'should include tile-path-%i with correct subdirectory path',
      (mask) => {
        const entry = sprites.find((s) => s.key === `tile-path-${mask}`);
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(
          `sprites/tiles/path/tile-path-${mask}.png`,
        );
      },
    );

    it('should NOT include unreachable bitmask values (7, 11, 13, 14, 15)', () => {
      const excluded = [7, 11, 13, 14, 15];
      for (const mask of excluded) {
        expect(spriteKeys).not.toContain(`tile-path-${mask}`);
      }
    });
  });

  // --- AC-010-04b: exactly 5 tile-buildable-N entries ---
  describe('grass/buildable sprites', () => {
    it('should have exactly 5 tile-buildable-N entries', () => {
      const grassKeys = spriteKeys.filter((k) =>
        /^tile-buildable-\d+$/.test(k),
      );
      expect(grassKeys).toHaveLength(5);
    });

    it.each([1, 2, 3, 4, 5])(
      'should include tile-buildable-%i with correct path',
      (n) => {
        const entry = sprites.find((s) => s.key === `tile-buildable-${n}`);
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(
          `sprites/tiles/grass/tile-buildable-${n}.png`,
        );
      },
    );
  });

  // --- AC-010-04c: exactly 3 tile-blocked-N entries ---
  describe('blocked sprites', () => {
    it('should have exactly 3 tile-blocked-N entries', () => {
      const blockedKeys = spriteKeys.filter((k) =>
        /^tile-blocked-\d+$/.test(k),
      );
      expect(blockedKeys).toHaveLength(3);
    });

    it.each([1, 2, 3])(
      'should include tile-blocked-%i with correct path',
      (n) => {
        const entry = sprites.find((s) => s.key === `tile-blocked-${n}`);
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(
          `sprites/tiles/blocked/tile-blocked-${n}.png`,
        );
      },
    );
  });

  // --- AC-010-04d: exactly 4 tile-spawn-{dir} entries ---
  describe('spawn directional sprites', () => {
    it('should have exactly 4 tile-spawn-{dir} entries', () => {
      const spawnKeys = spriteKeys.filter((k) =>
        /^tile-spawn-[nesw]$/.test(k),
      );
      expect(spawnKeys).toHaveLength(4);
    });

    it.each(DIRECTIONS)(
      'should include tile-spawn-%s with correct path',
      (dir) => {
        const entry = sprites.find((s) => s.key === `tile-spawn-${dir}`);
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(
          `sprites/tiles/spawn/tile-spawn-${dir}.png`,
        );
      },
    );
  });

  // --- AC-010-04e: exactly 4 tile-objective-{dir} entries ---
  describe('objective directional sprites', () => {
    it('should have exactly 4 tile-objective-{dir} entries', () => {
      const objKeys = spriteKeys.filter((k) =>
        /^tile-objective-[nesw]$/.test(k),
      );
      expect(objKeys).toHaveLength(4);
    });

    it.each(DIRECTIONS)(
      'should include tile-objective-%s with correct path',
      (dir) => {
        const entry = sprites.find(
          (s) => s.key === `tile-objective-${dir}`,
        );
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(
          `sprites/tiles/objective/tile-objective-${dir}.png`,
        );
      },
    );
  });

  // --- AC-010-03a: legacy keys preserved ---
  describe('legacy placeholder keys', () => {
    const legacyEntries = [
      { key: 'tile-path', path: 'sprites/tile-path.png' },
      { key: 'tile-buildable', path: 'sprites/tile-buildable.png' },
      { key: 'tile-blocked', path: 'sprites/tile-blocked.png' },
      { key: 'tile-spawn', path: 'sprites/tile-spawn.png' },
      { key: 'tile-objective', path: 'sprites/tile-objective.png' },
    ];

    it.each(legacyEntries)(
      'should preserve legacy $key at original path',
      ({ key, path: expectedPath }) => {
        const entry = sprites.find((s) => s.key === key);
        expect(entry).toBeDefined();
        expect(entry!.path).toBe(expectedPath);
      },
    );
  });

  // --- Key uniqueness ---
  describe('key uniqueness', () => {
    it('should have no duplicate sprite keys in the manifest', () => {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const key of spriteKeys) {
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
      }
      expect(duplicates).toEqual([]);
    });
  });

  // --- File existence: all 27 PNGs must exist on disk ---
  describe('PNG file existence', () => {
    const assetsRoot = path.resolve(__dirname, '../../public/assets');
    const newKeys = [
      ...REACHABLE_PATH_MASKS.map((m) => `tile-path-${m}`),
      ...[1, 2, 3, 4, 5].map((n) => `tile-buildable-${n}`),
      ...[1, 2, 3].map((n) => `tile-blocked-${n}`),
      ...DIRECTIONS.map((d) => `tile-spawn-${d}`),
      ...DIRECTIONS.map((d) => `tile-objective-${d}`),
    ];

    it.each(newKeys)('should have PNG on disk for %s', (key) => {
      const entry = sprites.find((s) => s.key === key);
      expect(entry).toBeDefined();
      const filePath = path.join(assetsRoot, entry!.path);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // --- Total count: exactly 27 new entries ---
  describe('total count', () => {
    it('should have exactly 27 BOLT-010 tile variant entries', () => {
      const bolt010Keys = spriteKeys.filter(
        (k) =>
          /^tile-path-\d+$/.test(k) ||
          /^tile-buildable-\d+$/.test(k) ||
          /^tile-blocked-\d+$/.test(k) ||
          /^tile-spawn-[nesw]$/.test(k) ||
          /^tile-objective-[nesw]$/.test(k),
      );
      expect(bolt010Keys).toHaveLength(27);
    });
  });
});
