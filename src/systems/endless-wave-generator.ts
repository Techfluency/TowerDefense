/**
 * Endless wave generator -- procedurally creates wave definitions beyond
 * the 20 scripted campaign waves for Endless Mode (BOLT-020).
 *
 * Responsibilities:
 * - Generate WaveDefinition for any wave number >= scaledWaveStart
 * - Scale difficulty via HP multiplier, enemy count, speed, armor
 * - Select enemy composition from weighted archetype tables
 * - Insert boss waves at configurable intervals (every 5th wave)
 * - Use seeded RNG for deterministic wave generation
 *
 * Design decisions:
 * - Pure function approach: no internal state, receives RNG and config
 *   as arguments. This makes it trivially testable without mocking Phaser.
 * - All scaling parameters read from EndlessConfig (loaded from JSON)
 *   so balance tuning requires no code changes.
 * - The same getWaveScaling() formula from EnemySystem continues
 *   for HP/speed, but without the campaign-era clamp on maxHpMultiplier.
 */
import type { WaveDefinition, WaveGroup, EndlessConfig } from '../types/game-types';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

/**
 * Mulberry32 seeded PRNG. Returns a function that produces deterministic
 * floats in [0, 1). Same family as Phaser's internal Alea PRNG.
 * Used instead of Phaser.Math.RandomDataGenerator so the generator
 * can be tested without Phaser loaded.
 *
 * @param seed - Integer seed value.
 * @returns A function that returns the next pseudo-random float.
 */
export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts a string seed to an integer seed via FNV-style hash.
 * Combines the game seed with the wave number so each wave gets a
 * unique but deterministic sub-seed.
 *
 * @param gameSeed - The run's master seed string.
 * @param waveNumber - The wave number being generated.
 * @returns Integer seed for mulberry32.
 */
export function deriveWaveSeed(gameSeed: string, waveNumber: number): number {
  const combined = `${gameSeed}-endless-${waveNumber}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Weighted random selection
// ---------------------------------------------------------------------------

/**
 * Selects a random key from a weight map using the provided RNG.
 * Weights are relative (they do not need to sum to 100).
 *
 * @param weights - Map of key to relative weight.
 * @param rng - Seeded RNG function returning float in [0,1).
 * @returns The selected key.
 */
function weightedSelect(weights: Record<string, number>, rng: () => number): string {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * totalWeight;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }

  /* Fallback to last entry (floating point edge case). */
  return entries[entries.length - 1]![0];
}

// ---------------------------------------------------------------------------
// Archetype weight interpolation
// ---------------------------------------------------------------------------

/**
 * Linearly interpolates between two weight tables based on a factor [0, 1].
 * Used to smoothly transition enemy composition as waves progress.
 *
 * @param a - Starting weight table.
 * @param b - Ending weight table.
 * @param factor - Interpolation factor (0 = fully A, 1 = fully B).
 * @returns Interpolated weight table.
 */
function lerpWeights(
  a: Record<string, number>,
  b: Record<string, number>,
  factor: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    result[key] = va + (vb - va) * factor;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a procedural WaveDefinition for the given wave number.
 * Deterministic: same gameSeed + waveNumber always produces the same wave.
 *
 * @param waveNumber - The wave to generate (must be >= config.scaledWaveStart).
 * @param gameSeed - The run's master seed string for deterministic RNG.
 * @param config - Endless mode configuration from endless-config.json.
 * @returns A fully-formed WaveDefinition ready for WaveSystem to consume.
 * @throws Error if waveNumber is below the endless start threshold.
 */
export function generateEndlessWave(
  waveNumber: number,
  gameSeed: string,
  config: EndlessConfig,
): WaveDefinition {
  /* Derive a unique per-wave RNG from the game seed. */
  const waveSeed = deriveWaveSeed(gameSeed, waveNumber);
  const rng = createSeededRng(waveSeed);

  /* Determine if this is a boss wave (every bossWaveInterval waves). */
  const isBossWave = waveNumber % config.bossWaveInterval === 0;

  /* Calculate the number of waves beyond the campaign for scaling.
   * Clamped to 0 in case the generator is called for waves below scaledWaveStart. */
  const wavesIntEndless = Math.max(0, waveNumber - config.scaledWaveStart);

  /* --- Enemy count scaling ---
   * Starts at baseEnemyCount, grows by enemyCountGrowthRate per wave,
   * capped at maxEnemyCount to prevent performance degradation. */
  const rawCount = config.baseEnemyCount * Math.pow(
    1 + config.enemyCountGrowthRate,
    wavesIntEndless,
  );
  const enemyCount = Math.min(Math.round(rawCount), config.maxEnemyCount);

  /* --- Spawn interval scaling ---
   * Gets faster (lower interval) as waves progress, capped at min. */
  const spawnInterval = Math.max(
    config.baseSpawnIntervalMs - wavesIntEndless * config.spawnIntervalDecayPerWave,
    config.minSpawnIntervalMs,
  );

  /* --- Archetype weight selection ---
   * Interpolates between early/mid/late weight tables based on wave number. */
  const weights = getInterpolatedWeights(waveNumber, config);

  /* --- Build wave groups ---
   * Select archetypes for this wave using weighted random selection.
   * Each archetype gets its own group with count distributed proportionally. */
  const groups = buildWaveGroups(
    enemyCount,
    spawnInterval,
    weights,
    isBossWave,
    waveNumber,
    config,
    rng,
  );

  return {
    waveNumber,
    groups,
    prepTimeMs: isBossWave ? config.bossPrepTimeMs : config.basePrepTimeMs,
    isBossWave,
  };
}

/**
 * Returns the interpolated archetype weights for the given wave number.
 * Transitions smoothly between early -> mid -> late weight tables.
 *
 * @param waveNumber - Current wave number.
 * @param config - Endless config with weight tables and transition thresholds.
 * @returns Interpolated weight record for weighted selection.
 */
export function getInterpolatedWeights(
  waveNumber: number,
  config: EndlessConfig,
): Record<string, number> {
  const { earlyToMidWave, midToLateWave } = config.weightTransitions;

  if (waveNumber < earlyToMidWave) {
    /* Interpolate from early to mid. */
    const factor = Math.max(0, (waveNumber - config.scaledWaveStart) /
      (earlyToMidWave - config.scaledWaveStart));
    return lerpWeights(config.archetypeWeights.early, config.archetypeWeights.mid, factor);
  } else if (waveNumber < midToLateWave) {
    /* Interpolate from mid to late. */
    const factor = (waveNumber - earlyToMidWave) / (midToLateWave - earlyToMidWave);
    return lerpWeights(config.archetypeWeights.mid, config.archetypeWeights.late, factor);
  } else {
    /* Past midToLate threshold: use full late weights. */
    return { ...config.archetypeWeights.late };
  }
}

/**
 * Calculates the endless-mode scaling multipliers for a given wave.
 * Continues the same formula as EnemySystem.getWaveScaling() but with
 * extended caps for endless mode.
 *
 * @param waveNumber - The wave number (1-indexed).
 * @param config - Endless config with scaling parameters.
 * @returns HP and speed multipliers.
 */
export function getEndlessScaling(
  waveNumber: number,
  config: EndlessConfig,
): { hpMultiplier: number; speedMultiplier: number } {
  const waveFactor = Math.max(0, waveNumber - 1);

  const hpMultiplier = Math.min(
    1 + waveFactor * config.hpMultiplierPerWave,
    config.maxHpMultiplier,
  );

  const speedMultiplier = Math.min(
    1 + waveFactor * config.speedMultiplierPerWave,
    config.maxSpeedMultiplier,
  );

  return { hpMultiplier, speedMultiplier };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Builds the WaveGroup array for a procedural wave. Distributes the total
 * enemy count across randomly selected archetypes, with boss waves
 * getting a dedicated boss group plus minion escorts.
 *
 * @param totalCount - Total enemies in the wave.
 * @param baseInterval - Base spawn interval in ms.
 * @param weights - Archetype weight table for random selection.
 * @param isBossWave - Whether this wave includes a boss.
 * @param waveNumber - Current wave number (for boss minion scaling).
 * @param config - Endless config.
 * @param rng - Seeded RNG.
 * @returns Array of WaveGroup definitions.
 */
function buildWaveGroups(
  totalCount: number,
  baseInterval: number,
  weights: Record<string, number>,
  isBossWave: boolean,
  waveNumber: number,
  config: EndlessConfig,
  rng: () => number,
): WaveGroup[] {
  const groups: WaveGroup[] = [];

  if (isBossWave) {
    /* Boss wave: lead with the boss, followed by escort groups. */
    groups.push({
      enemyId: 'boss',
      count: 1,
      spawnIntervalMs: 1000,
      delayMs: 0,
    });

    /* Boss escort minions scale with wave number. */
    const wavesIntoEndless = waveNumber - config.scaledWaveStart;
    const minionCount = Math.min(
      config.bossGroupMinions.minCount +
        Math.floor(wavesIntoEndless * config.bossGroupMinions.countGrowthPerWave),
      config.bossGroupMinions.maxCount,
    );

    /* Remaining enemies after boss + minions. */
    const remainingCount = Math.max(0, totalCount - 1 - minionCount);

    /* Escort minions (mixed archetypes, delayed to arrive after boss). */
    if (minionCount > 0) {
      const escortType = weightedSelect(weights, rng);
      groups.push({
        enemyId: escortType,
        count: minionCount,
        spawnIntervalMs: Math.max(baseInterval - 100, config.minSpawnIntervalMs),
        delayMs: 2000,
      });
    }

    /* Fill remaining count with random groups. */
    if (remainingCount > 0) {
      const fillerGroups = distributeEnemies(remainingCount, weights, baseInterval, 4000, rng);
      groups.push(...fillerGroups);
    }
  } else {
    /* Normal wave: distribute all enemies across random archetype groups.
     * Select 3-5 different groups for variety. */
    const numGroups = 3 + Math.floor(rng() * 3); // 3 to 5 groups
    const countPerGroup = Math.floor(totalCount / numGroups);
    let remainingCount = totalCount;
    let currentDelay = 0;

    for (let i = 0; i < numGroups; i++) {
      const archetype = weightedSelect(weights, rng);
      const isLastGroup = i === numGroups - 1;
      const groupCount = isLastGroup ? remainingCount : countPerGroup;

      if (groupCount <= 0) continue;

      /* Vary the spawn interval slightly per group for pacing variety. */
      const intervalVariance = Math.floor((rng() - 0.5) * 100);
      const groupInterval = Math.max(
        baseInterval + intervalVariance,
        config.minSpawnIntervalMs,
      );

      groups.push({
        enemyId: archetype,
        count: groupCount,
        spawnIntervalMs: groupInterval,
        delayMs: currentDelay,
      });

      remainingCount -= groupCount;
      /* Stagger groups by 1-3 seconds for wave pacing. */
      currentDelay += 1000 + Math.floor(rng() * 2000);
    }
  }

  return groups;
}

/**
 * Distributes a count of enemies into multiple groups with random archetypes.
 * Used for filler groups in boss waves.
 *
 * @param totalCount - Total enemies to distribute.
 * @param weights - Archetype weight table.
 * @param baseInterval - Base spawn interval in ms.
 * @param startDelay - Starting delay offset in ms.
 * @param rng - Seeded RNG.
 * @returns Array of WaveGroup definitions.
 */
function distributeEnemies(
  totalCount: number,
  weights: Record<string, number>,
  baseInterval: number,
  startDelay: number,
  rng: () => number,
): WaveGroup[] {
  const groups: WaveGroup[] = [];
  const numGroups = 2 + Math.floor(rng() * 2); // 2 to 3 groups
  const countPerGroup = Math.floor(totalCount / numGroups);
  let remaining = totalCount;
  let delay = startDelay;

  for (let i = 0; i < numGroups; i++) {
    const archetype = weightedSelect(weights, rng);
    const isLast = i === numGroups - 1;
    const count = isLast ? remaining : countPerGroup;

    if (count <= 0) continue;

    groups.push({
      enemyId: archetype,
      count,
      spawnIntervalMs: baseInterval,
      delayMs: delay,
    });

    remaining -= count;
    delay += 1500 + Math.floor(rng() * 1500);
  }

  return groups;
}
