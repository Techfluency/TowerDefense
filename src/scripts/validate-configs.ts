/**
 * Build-time config validation script.
 *
 * Runs under Node.js via tsx before TypeScript compilation. Reads JSON
 * config files from public/data/ and validates their shape against the
 * expected interfaces. Fails the build with descriptive errors if any
 * required field is missing or has the wrong type.
 *
 * This script must NOT import Phaser or any browser APIs -- it runs
 * in a pure Node environment.
 *
 * Usage: tsx src/scripts/validate-configs.ts
 * Called automatically as part of `pnpm run build`.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/* JSON configs live in public/data/ (served as static assets by Vite). */
const DATA_DIR = resolve(__dirname, '..', '..', 'public', 'data');

let errors: string[] = [];

/**
 * Reads and parses a JSON file from the data directory.
 *
 * @param fileName - Name of the JSON file in public/data/.
 * @returns Parsed JSON content or null if the file cannot be read.
 */
function loadJson(fileName: string): unknown[] | null {
  const filePath = resolve(DATA_DIR, fileName);
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      errors.push(`${fileName}: expected a JSON array, got ${typeof parsed}`);
      return null;
    }
    return parsed as unknown[];
  } catch (err) {
    errors.push(`${fileName}: failed to read or parse -- ${String(err)}`);
    return null;
  }
}

/**
 * Validates that an object has a required field of the expected type.
 *
 * @param obj - The object to check.
 * @param field - The field name.
 * @param expectedType - Expected typeof result (e.g., "string", "number").
 * @param file - File name for error messages.
 * @param index - Array index for error messages.
 */
function requireField(
  obj: Record<string, unknown>,
  field: string,
  expectedType: string,
  file: string,
  index: number,
): void {
  if (!(field in obj)) {
    errors.push(`${file}[${index}]: missing required field "${field}"`);
  } else if (typeof obj[field] !== expectedType) {
    errors.push(
      `${file}[${index}]: field "${field}" expected ${expectedType}, got ${typeof obj[field]}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validate towers.json
// ---------------------------------------------------------------------------
const towers = loadJson('towers.json');
if (towers) {
  const seenIds = new Set<string>();
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i] as Record<string, unknown>;
    requireField(t, 'id', 'string', 'towers.json', i);
    requireField(t, 'name', 'string', 'towers.json', i);
    requireField(t, 'towerClass', 'string', 'towers.json', i);
    requireField(t, 'cost', 'number', 'towers.json', i);
    requireField(t, 'range', 'number', 'towers.json', i);
    requireField(t, 'fireRate', 'number', 'towers.json', i);
    requireField(t, 'damage', 'number', 'towers.json', i);
    requireField(t, 'maxHp', 'number', 'towers.json', i);
    requireField(t, 'targetingMode', 'string', 'towers.json', i);
    requireField(t, 'description', 'string', 'towers.json', i);
    requireField(t, 'spriteKey', 'string', 'towers.json', i);

    const id = t.id as string;
    if (seenIds.has(id)) {
      errors.push(`towers.json[${i}]: duplicate id "${id}"`);
    }
    seenIds.add(id);
  }
}

// ---------------------------------------------------------------------------
// Validate enemies.json
// ---------------------------------------------------------------------------
const enemies = loadJson('enemies.json');
if (enemies) {
  const seenIds = new Set<string>();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i] as Record<string, unknown>;
    requireField(e, 'id', 'string', 'enemies.json', i);
    requireField(e, 'name', 'string', 'enemies.json', i);
    requireField(e, 'baseHp', 'number', 'enemies.json', i);
    requireField(e, 'baseSpeed', 'number', 'enemies.json', i);
    requireField(e, 'armor', 'number', 'enemies.json', i);
    requireField(e, 'breakthroughDamage', 'number', 'enemies.json', i);
    requireField(e, 'currencyReward', 'number', 'enemies.json', i);
    requireField(e, 'scoreReward', 'number', 'enemies.json', i);
    requireField(e, 'movementType', 'string', 'enemies.json', i);
    requireField(e, 'spriteKey', 'string', 'enemies.json', i);

    /* Optional damageTypeMultipliers: if present, must be an object with numeric values. */
    if ('damageTypeMultipliers' in e && e.damageTypeMultipliers != null) {
      if (typeof e.damageTypeMultipliers !== 'object' || Array.isArray(e.damageTypeMultipliers)) {
        errors.push(`enemies.json[${i}]: "damageTypeMultipliers" must be an object`);
      } else {
        const multipliers = e.damageTypeMultipliers as Record<string, unknown>;
        for (const [key, val] of Object.entries(multipliers)) {
          if (typeof val !== 'number') {
            errors.push(
              `enemies.json[${i}]: damageTypeMultipliers["${key}"] expected number, got ${typeof val}`,
            );
          }
        }
      }
    }

    const id = e.id as string;
    if (seenIds.has(id)) {
      errors.push(`enemies.json[${i}]: duplicate id "${id}"`);
    }
    seenIds.add(id);
  }
}

// ---------------------------------------------------------------------------
// Validate waves.json
// ---------------------------------------------------------------------------
const waves = loadJson('waves.json');
if (waves) {
  /* Minimum wave count check. */
  if (waves.length < 1) {
    errors.push('waves.json: must contain at least 1 wave definition');
  }

  /* Collect all enemy IDs from enemies.json for cross-reference validation. */
  const validEnemyIds = new Set<string>();
  if (enemies) {
    for (const e of enemies) {
      const id = (e as Record<string, unknown>).id;
      if (typeof id === 'string') validEnemyIds.add(id);
    }
  }

  const seenWaveNumbers = new Set<number>();

  for (let i = 0; i < waves.length; i++) {
    const w = waves[i] as Record<string, unknown>;
    requireField(w, 'waveNumber', 'number', 'waves.json', i);
    requireField(w, 'prepTimeMs', 'number', 'waves.json', i);
    requireField(w, 'isBossWave', 'boolean', 'waves.json', i);

    /* Wave number uniqueness check. */
    const waveNum = w.waveNumber as number;
    if (typeof waveNum === 'number') {
      if (seenWaveNumbers.has(waveNum)) {
        errors.push(`waves.json[${i}]: duplicate waveNumber ${waveNum}`);
      }
      seenWaveNumbers.add(waveNum);
    }

    /* Wave number sequential check (must equal index + 1). */
    if (typeof waveNum === 'number' && waveNum !== i + 1) {
      errors.push(
        `waves.json[${i}]: waveNumber is ${waveNum}, expected ${i + 1} (must be sequential starting from 1)`,
      );
    }

    if (!('groups' in w) || !Array.isArray(w.groups)) {
      errors.push(`waves.json[${i}]: missing or invalid "groups" array`);
    } else {
      for (let g = 0; g < (w.groups as unknown[]).length; g++) {
        const group = (w.groups as Record<string, unknown>[])[g]!;
        requireField(group, 'enemyId', 'string', `waves.json[${i}].groups`, g);
        requireField(group, 'count', 'number', `waves.json[${i}].groups`, g);
        requireField(group, 'spawnIntervalMs', 'number', `waves.json[${i}].groups`, g);
        requireField(group, 'delayMs', 'number', `waves.json[${i}].groups`, g);

        /* Cross-reference: enemyId must exist in enemies.json. */
        const enemyId = group.enemyId as string;
        if (typeof enemyId === 'string' && validEnemyIds.size > 0 && !validEnemyIds.has(enemyId)) {
          errors.push(
            `waves.json[${i}].groups[${g}]: enemyId "${enemyId}" not found in enemies.json. ` +
            `Available: ${[...validEnemyIds].join(', ')}`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Validate projectiles.json
// ---------------------------------------------------------------------------
const projectiles = loadJson('projectiles.json');
if (projectiles) {
  const seenIds = new Set<string>();
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i] as Record<string, unknown>;
    requireField(p, 'id', 'string', 'projectiles.json', i);
    requireField(p, 'speed', 'number', 'projectiles.json', i);
    requireField(p, 'splashRadius', 'number', 'projectiles.json', i);
    requireField(p, 'spriteKey', 'string', 'projectiles.json', i);

    const id = p.id as string;
    if (seenIds.has(id)) {
      errors.push(`projectiles.json[${i}]: duplicate id "${id}"`);
    }
    seenIds.add(id);
  }
}

// ---------------------------------------------------------------------------
// Validate map-config.json
// ---------------------------------------------------------------------------
const mapConfigPath = resolve(DATA_DIR, 'map-config.json');
try {
  const mapContent = readFileSync(mapConfigPath, 'utf-8');
  const mapConfig = JSON.parse(mapContent) as Record<string, unknown>;

  const requiredNumberFields = ['cols', 'rows', 'tileSize', 'minPathLength', 'maxStraightTiles', 'maxRetries'];
  for (const field of requiredNumberFields) {
    if (!(field in mapConfig)) {
      errors.push(`map-config.json: missing required field "${field}"`);
    } else if (typeof mapConfig[field] !== 'number') {
      errors.push(`map-config.json: field "${field}" expected number, got ${typeof mapConfig[field]}`);
    }
  }

  if (!('complexityRange' in mapConfig) || !Array.isArray(mapConfig.complexityRange)) {
    errors.push('map-config.json: missing or invalid "complexityRange" array');
  } else {
    const range = mapConfig.complexityRange as unknown[];
    if (range.length !== 2 || typeof range[0] !== 'number' || typeof range[1] !== 'number') {
      errors.push('map-config.json: "complexityRange" must be [number, number]');
    }
  }

  /* Validate constraints. */
  if (typeof mapConfig.minPathLength === 'number' && mapConfig.minPathLength < 20) {
    errors.push('map-config.json: "minPathLength" must be >= 20');
  }
  if (typeof mapConfig.maxRetries === 'number' && mapConfig.maxRetries < 10) {
    errors.push('map-config.json: "maxRetries" must be >= 10');
  }
} catch (err) {
  errors.push(`map-config.json: failed to read or parse -- ${String(err)}`);
}

// ---------------------------------------------------------------------------
// Check for sprite key collisions across all configs
// ---------------------------------------------------------------------------
const allSpriteKeys: Array<{ key: string; source: string }> = [];
if (towers) {
  for (const t of towers) {
    allSpriteKeys.push({ key: (t as Record<string, unknown>).spriteKey as string, source: 'towers.json' });
  }
}
if (enemies) {
  for (const e of enemies) {
    allSpriteKeys.push({ key: (e as Record<string, unknown>).spriteKey as string, source: 'enemies.json' });
  }
}
if (projectiles) {
  for (const p of projectiles) {
    allSpriteKeys.push({ key: (p as Record<string, unknown>).spriteKey as string, source: 'projectiles.json' });
  }
}

const spriteKeyMap = new Map<string, string>();
for (const entry of allSpriteKeys) {
  if (entry.key && spriteKeyMap.has(entry.key)) {
    errors.push(
      `Sprite key collision: "${entry.key}" used in both ${spriteKeyMap.get(entry.key)} and ${entry.source}`,
    );
  }
  if (entry.key) {
    spriteKeyMap.set(entry.key, entry.source);
  }
}

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error('\n=== Config Validation Failed ===\n');
  for (const err of errors) {
    console.error(`  ERROR: ${err}`);
  }
  console.error(`\n${errors.length} error(s) found. Fix the above issues and rebuild.\n`);
  process.exit(1);
} else {
  console.log('Config validation passed: all JSON configs are valid.');
}
