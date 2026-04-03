/**
 * Unit tests for the ID generator utility.
 *
 * Verifies that generated IDs are unique, properly prefixed,
 * and that the counter can be reset for test isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateId, resetIdCounter } from '../../src/utils/id-generator';

describe('generateId', () => {
  beforeEach(() => {
    /* Reset counter before each test for deterministic IDs. */
    resetIdCounter();
  });

  it('should generate IDs with the given prefix', () => {
    const id = generateId('enemy');
    expect(id).toMatch(/^enemy-\d+$/);
  });

  it('should generate sequential IDs', () => {
    const id1 = generateId('enemy');
    const id2 = generateId('enemy');
    const id3 = generateId('tower');

    expect(id1).toBe('enemy-1');
    expect(id2).toBe('enemy-2');
    expect(id3).toBe('tower-3');
  });

  it('should generate unique IDs across different prefixes', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId(i % 2 === 0 ? 'enemy' : 'tower'));
    }
    expect(ids.size).toBe(100);
  });

  it('should reset counter to produce IDs starting from 1', () => {
    generateId('test');
    generateId('test');
    resetIdCounter();
    const id = generateId('test');
    expect(id).toBe('test-1');
  });
});
