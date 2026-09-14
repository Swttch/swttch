import { describe, it, expect } from 'vitest';
import { resolveModelInfo, resolveModelLabel } from '@/types/models';
import { chipLabel } from '../ModelTag';
import { ModelInfo } from '@/types/slashCommand';

/**
 * Issue #217 — a third-party proxy maps the CLI's model slots onto its own ids
 * (`ANTHROPIC_DEFAULT_*_MODEL`), so no catalog value carries an
 * "opus"/"sonnet"/"haiku" token. This is the exact catalog from the report.
 */
const CUSTOM_CATALOG: ModelInfo[] = [
  ModelInfo.from({
    value: 'default',
    resolvedModel: 'glm-5.2-mayi[1m]',
    displayName: 'Default (recommended)',
    description: 'Use the default model (currently glm-5.2-mayi[1m])',
  }),
  ModelInfo.from({ value: 'glm-5.2-mayi', resolvedModel: 'glm-5.2-mayi', displayName: 'glm-5.2-mayi', description: 'Custom Opus model' }),
  ModelInfo.from({ value: 'glm-5.1-mayi', resolvedModel: 'glm-5.1-mayi', displayName: 'glm-5.1-mayi', description: 'Custom Fable model' }),
  ModelInfo.from({ value: 'glm-4.7-mayi', resolvedModel: 'glm-4.7-mayi', displayName: 'glm-4.7-mayi', description: 'Custom Sonnet model' }),
  ModelInfo.from({ value: 'glm-4.5-air-mayi', resolvedModel: 'glm-4.5-air-mayi', displayName: 'glm-4.5-air-mayi', description: 'Custom Haiku model' }),
];

/** What the composer's model tag ends up showing for a given current model. */
function tagLabel(current: string | null): string {
  const info = resolveModelInfo(CUSTOM_CATALOG, current);
  return info ? chipLabel(info) : '';
}

describe('ModelTag label on a custom model catalog (issue #217)', () => {
  it('shows the picked model right after switching', () => {
    // Before the CLI is spawned the tag reflects the user's pick directly.
    expect(tagLabel('glm-4.5-air-mayi')).toBe('Glm 4.5 Air Mayi');
  });

  it('keeps showing it once the session starts and system/init echoes back', () => {
    // The regression: each of these is a shape system/init may report for the
    // very model the user picked. None of them may fall back to the default row.
    for (const echoed of ['glm-4.5-air-mayi', 'glm-4.5-air-mayi[1m]', 'GLM-4.5-Air-MAYI']) {
      expect(tagLabel(echoed)).toBe('Glm 4.5 Air Mayi');
    }
  });

  it('never renders the default row blurb as a label', () => {
    // This long sentence is what overflowed the composer's bottom row.
    const blurb = 'Use the default model (currently glm-5.2-mayi[1m])';
    for (const current of ['haiku', 'sonnet', 'glm-4.7-mayi', 'default', null]) {
      expect(tagLabel(current)).not.toBe(blurb);
    }
  });

  it('labels the default row by the model behind it, never by its blurb', () => {
    // The chip is asked which model is running, so on this row it looks past the
    // row's own name to the model. The long blurb is still never the label, and
    // the picker rows keep naming the row itself (see models.label.measured).
    expect(tagLabel('default')).toBe('Glm 5.2 Mayi (1M)');
  });

  it('resolves every slot to its own model, never to a neighbour', () => {
    // Each row here is a distinct proxy model, and the CLI reports whichever one
    // is running by its id — so every slot must land back on itself.
    expect(tagLabel('glm-5.2-mayi')).toBe('Glm 5.2 Mayi');
    expect(tagLabel('glm-4.7-mayi')).toBe('Glm 4.7 Mayi');
    expect(tagLabel('glm-5.1-mayi')).toBe('Glm 5.1 Mayi');
  });

  it('does not hand a coarse alias to a row that merely advertises that family', () => {
    // "Custom Opus model" is marketing copy in the blurb, not a claim that the
    // row answers to "opus". We used to read the family out of that sentence and
    // pick a row by it; a proxy can point two differently-blurbed slots at one
    // model, which makes that pick arbitrary. Nothing named "opus" here, so the
    // honest answer is no row (the caller then keeps showing the user's pick).
    expect(resolveModelInfo(CUSTOM_CATALOG, 'opus', { allowDefaultFallback: false })).toBeNull();
    expect(resolveModelInfo(CUSTOM_CATALOG, 'haiku', { allowDefaultFallback: false })).toBeNull();
  });

  it('keeps labels short enough for a single-line bottom row', () => {
    // Not a pixel assertion — a guard that no label degrades into a sentence
    // again. Real width is bounded by `truncate max-w-*` on the tag.
    // Measured on what the chip actually renders, not on the row label: those
    // two diverge on the default row, and it is the chip that has to fit.
    for (const m of CUSTOM_CATALOG) {
      expect(chipLabel(m).length).toBeLessThanOrEqual(24);
    }
  });
});

describe('ModelTag label on the Anthropic catalog (no regression)', () => {
  const ANTHROPIC_CATALOG: ModelInfo[] = [
    ModelInfo.from({
      value: 'default',
      resolvedModel: 'claude-opus-4-8[1m]',
      displayName: 'Default (recommended)',
      description: 'Opus 4.8 with 1M context · Best for everyday tasks',
    }),
    ModelInfo.from({ value: 'opus[1m]', resolvedModel: 'claude-opus-4-8[1m]', displayName: 'Opus', description: 'Opus 4.8 with 1M context · hard tasks' }),
    ModelInfo.from({ value: 'sonnet', resolvedModel: 'claude-sonnet-4-6', displayName: 'Sonnet', description: 'Sonnet 4.6 · everyday' }),
    ModelInfo.from({ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · fast' }),
  ];

  it('still spells out name + version for a first-party row', () => {
    const info = resolveModelInfo(ANTHROPIC_CATALOG, 'haiku');
    expect(info && resolveModelLabel(info)).toBe('Haiku 4.5 (20251001)');
  });

  it('still resolves a full model id reported by system/init', () => {
    const info = resolveModelInfo(ANTHROPIC_CATALOG, 'claude-haiku-4-5-20251001');
    expect(info?.value).toBe('haiku');
  });
});
