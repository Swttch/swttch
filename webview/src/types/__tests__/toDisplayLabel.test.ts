import { describe, it, expect } from 'vitest';
import { toDisplayLabel } from '../ModelInfo';

/**
 * The spelling rules for a model id on screen. They are written as a table
 * because the point of this function is that it holds no knowledge of any
 * particular model — only of how an id is spelled out.
 */
describe('toDisplayLabel', () => {
  const cases: Array<[string, string]> = [
    // vendor prefix dropped, bracket parenthesised and uppercased
    ['claude-opus-5[1m]', 'Opus 5 (1M)'],
    ['claude-sonnet-5', 'Sonnet 5'],
    // consecutive number parts read as one version
    ['claude-fable-5-1', 'Fable 5.1'],
    ['claude-opus-4-8', 'Opus 4.8'],
    // a dated snapshot is not a version part
    ['claude-haiku-4-5-20251001', 'Haiku 4.5 (20251001)'],
    // a name its owner chose keeps every word; only the spelling changes
    ['glm-4.5-air', 'Glm 4.5 Air'],
    ['glm-4.6[1m]', 'Glm 4.6 (1M)'],
    ['glm-4.5-air-mayi', 'Glm 4.5 Air Mayi'],
    ['my-big-model-2', 'My Big Model 2'],
    // bare aliases, which is what an unresolved row falls back to
    ['fable', 'Fable'],
    ['sonnet', 'Sonnet'],
    ['default', 'Default'],
    ['opus[1m]', 'Opus (1M)'],
  ];

  for (const [id, expected] of cases) {
    it(`${id} -> ${expected}`, () => {
      expect(toDisplayLabel(id)).toBe(expected);
    });
  }

  it('handles an id it has never seen in the same shape', () => {
    // No family list, no version table: a brand new model spells out the same way.
    expect(toDisplayLabel('claude-mythos-7-2[2m]')).toBe('Mythos 7.2 (2M)');
    expect(toDisplayLabel('vendor-x-9')).toBe('Vendor X 9');
  });

  it('does not fall apart on degenerate input', () => {
    expect(toDisplayLabel('')).toBe('');
    expect(toDisplayLabel('---')).toBe('');
    expect(toDisplayLabel('[1m]')).toBe('(1M)');
  });
});
