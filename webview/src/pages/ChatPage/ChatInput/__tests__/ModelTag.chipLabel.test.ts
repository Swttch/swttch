import { describe, it, expect } from 'vitest';
import { chipLabel } from '../ModelTag';
import { ANTHROPIC, REMAPPED_NAMES_ONLY, PROXIED, rowFor } from '@/types/__tests__/measuredCatalogs';
import { ModelInfo } from '@/types/slashCommand';

/**
 * The composer chip answers "which model is running right now", so it is the one
 * place that must NOT repeat the `default` row's own name: that name states a
 * choice, and the chip is asked about a model.
 */
describe('the chip names the model that is running', () => {
  it('spells out the model behind the default row instead of the row', () => {
    expect(chipLabel(rowFor(ANTHROPIC, 'default'))).toBe('Opus 5 (1M)');
    expect(chipLabel(rowFor(PROXIED, 'default'))).toBe('Glm 4.6 (1M)');
    expect(chipLabel(rowFor(REMAPPED_NAMES_ONLY, 'default'))).toBe('Glm 5.2 Mayi (1M)');
  });

  it('leaves every other row reading exactly as its own name', () => {
    expect(chipLabel(rowFor(ANTHROPIC, 'opus[1m]'))).toBe('Opus 5 (1M)');
    expect(chipLabel(rowFor(ANTHROPIC, 'sonnet'))).toBe('Sonnet 5');
    expect(chipLabel(rowFor(REMAPPED_NAMES_ONLY, 'haiku'))).toBe('Glm 4.5 Air Mayi');
    expect(chipLabel(rowFor(PROXIED, 'haiku'))).toBe('Glm 4.5 Air');
  });

  it('keeps the default row whole when the CLI resolved no model for it', () => {
    // Older CLIs (2.1.170) omit `resolvedModel`, so there is no model to name.
    const unresolved = ModelInfo.from({ value: 'default', displayName: 'Default (recommended)', description: '' });
    expect(chipLabel(unresolved)).toBe('Default (recommended)');
  });
});

describe('the chip drops only the dated snapshot', () => {
  it('removes a dated suffix so the composer bottom row stays short', () => {
    expect(chipLabel(rowFor(ANTHROPIC, 'haiku'))).toBe('Haiku 4.5');
  });

  it('keeps a context suffix, which changes which model you get', () => {
    expect(chipLabel(rowFor(ANTHROPIC, 'opus[1m]'))).toBe('Opus 5 (1M)');
    expect(chipLabel(rowFor(PROXIED, 'opus[1m]'))).toBe('Glm 4.6 (1M)');
  });

  it('applies to the model named behind the default row too', () => {
    // Both rules land on one row: name the model behind it, then drop its date.
    const datedDefault = ModelInfo.from({
      value: 'default',
      resolvedModel: 'claude-haiku-4-5-20251001',
      displayName: 'Default (recommended)',
      description: '',
    });
    expect(chipLabel(datedDefault)).toBe('Haiku 4.5');
  });

  it('leaves a label with no date untouched', () => {
    expect(chipLabel(rowFor(ANTHROPIC, 'sonnet'))).toBe('Sonnet 5');
    expect(chipLabel(rowFor(PROXIED, 'haiku'))).toBe('Glm 4.5 Air');
  });
});
