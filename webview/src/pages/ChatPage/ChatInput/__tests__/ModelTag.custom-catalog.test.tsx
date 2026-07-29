import { describe, it, expect } from 'vitest';
import { resolveModelInfo, resolveModelLabel } from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';

/**
 * Issue #217 — a third-party proxy maps the CLI's model slots onto its own ids
 * (`ANTHROPIC_DEFAULT_*_MODEL`), so no catalog value carries an
 * "opus"/"sonnet"/"haiku" token. This is the exact catalog from the report.
 */
const CUSTOM_CATALOG: ModelInfo[] = [
  {
    value: 'default',
    displayName: 'Default (recommended)',
    description: 'Use the default model (currently glm-5.2-mayi[1m])',
  },
  { value: 'glm-5.2-mayi', displayName: 'glm-5.2-mayi', description: 'Custom Opus model' },
  { value: 'glm-5.1-mayi', displayName: 'glm-5.1-mayi', description: 'Custom Fable model' },
  { value: 'glm-4.7-mayi', displayName: 'glm-4.7-mayi', description: 'Custom Sonnet model' },
  { value: 'glm-4.5-air-mayi', displayName: 'glm-4.5-air-mayi', description: 'Custom Haiku model' },
];

/** What the composer's model tag ends up showing for a given current model. */
function tagLabel(current: string | null): string {
  const info = resolveModelInfo(CUSTOM_CATALOG, current);
  return info ? resolveModelLabel(info) : '';
}

describe('ModelTag label on a custom model catalog (issue #217)', () => {
  it('shows the picked model right after switching', () => {
    // Before the CLI is spawned the tag reflects the user's pick directly.
    expect(tagLabel('glm-4.5-air-mayi')).toBe('glm-4.5-air-mayi');
  });

  it('keeps showing it once the session starts and system/init echoes back', () => {
    // The regression: each of these is a shape system/init may report for the
    // very model the user picked. None of them may fall back to the default row.
    for (const echoed of ['haiku', 'glm-4.5-air-mayi', 'glm-4.5-air-mayi[1m]', 'GLM-4.5-Air-MAYI']) {
      expect(tagLabel(echoed)).toBe('glm-4.5-air-mayi');
    }
  });

  it('never renders the default row blurb as a label', () => {
    // This long sentence is what overflowed the composer's bottom row.
    const blurb = 'Use the default model (currently glm-5.2-mayi[1m])';
    for (const current of ['haiku', 'sonnet', 'glm-4.7-mayi', 'default', null]) {
      expect(tagLabel(current)).not.toBe(blurb);
    }
  });

  it('labels the default row itself by its display name, not its blurb', () => {
    expect(tagLabel('default')).toBe('Default (recommended)');
  });

  it('resolves every non-default slot to its own model', () => {
    expect(tagLabel('opus')).toBe('glm-5.2-mayi');
    expect(tagLabel('sonnet')).toBe('glm-4.7-mayi');
    expect(tagLabel('fable')).toBe('glm-5.1-mayi');
  });

  it('keeps labels short enough for a single-line bottom row', () => {
    // Not a pixel assertion — a guard that no label degrades into a sentence
    // again. Real width is bounded by `truncate max-w-*` on the tag.
    for (const m of CUSTOM_CATALOG) {
      expect(resolveModelLabel(m).length).toBeLessThanOrEqual(24);
    }
  });
});

describe('ModelTag label on the Anthropic catalog (no regression)', () => {
  const ANTHROPIC_CATALOG: ModelInfo[] = [
    {
      value: 'default',
      displayName: 'Default (recommended)',
      description: 'Opus 4.8 with 1M context · Best for everyday tasks',
    },
    { value: 'opus[1m]', displayName: 'Opus', description: 'Opus 4.8 with 1M context · hard tasks' },
    { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.6 · everyday' },
    { value: 'haiku', displayName: 'Haiku', description: 'Haiku 4.5 · fast' },
  ];

  it('still extracts name + version from the description', () => {
    const info = resolveModelInfo(ANTHROPIC_CATALOG, 'haiku');
    expect(info && resolveModelLabel(info)).toBe('Haiku 4.5');
  });

  it('still resolves a full model id reported by system/init', () => {
    const info = resolveModelInfo(ANTHROPIC_CATALOG, 'claude-haiku-4-5-20251001');
    expect(info?.value).toBe('haiku');
  });
});
