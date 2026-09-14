import { describe, it, expect } from 'vitest';
import { resolveModelLabel, resolveModelRowText, resolveModelInfo, withFableFallback } from '../models';
import { ModelInfo } from '../slashCommand';
import { ANTHROPIC, REMAPPED_NAMES_ONLY, PROXIED, rowFor } from './measuredCatalogs';

describe('the label names the model that actually runs', () => {
  it('spells out a first-party catalog', () => {
    expect(resolveModelLabel(rowFor(ANTHROPIC, 'sonnet'))).toBe('Sonnet 5');
    expect(resolveModelLabel(rowFor(ANTHROPIC, 'opus[1m]'))).toBe('Opus 5 (1M)');
    expect(resolveModelLabel(rowFor(ANTHROPIC, 'haiku'))).toBe('Haiku 4.5 (20251001)');
    // The default row names the choice, not the model behind it. That is the
    // answer the picker rows and the settings dropdown want; the composer chip
    // and the model-change line spell that row out differently, and each of
    // those rules is tested with the screen that owns it.
    expect(resolveModelLabel(rowFor(ANTHROPIC, 'default'))).toBe('Default (recommended)');
    expect(resolveModelLabel(rowFor(PROXIED, 'default'))).toBe('Default (recommended)');
  });

  it("never claims an Anthropic model when the slot runs someone else's", () => {
    // These rows describe themselves as "Haiku 4.5" and "Sonnet" while running
    // GLM. Before the fix the composer repeated that claim.
    expect(resolveModelLabel(rowFor(REMAPPED_NAMES_ONLY, 'haiku'))).toBe('Glm 4.5 Air Mayi');
    expect(resolveModelLabel(rowFor(REMAPPED_NAMES_ONLY, 'sonnet'))).toBe('Glm 4.7 Mayi');
  });

  it('does not cut a versionless sentence mid-word', () => {
    // 'Opus with 1M context' + /^.+?\s[\d.]+/ used to yield the label "Opus with 1".
    for (const catalog of [REMAPPED_NAMES_ONLY, PROXIED]) {
      const label = resolveModelLabel(rowFor(catalog, 'opus[1m]'));
      expect(label).not.toBe('Opus with 1');
      expect(label).toContain('Glm');
    }
  });

  it('spells out a proxied catalog', () => {
    expect(resolveModelLabel(rowFor(PROXIED, 'opus'))).toBe('Glm 4.6');
    expect(resolveModelLabel(rowFor(PROXIED, 'haiku'))).toBe('Glm 4.5 Air');
    expect(resolveModelLabel(rowFor(PROXIED, 'opus[1m]'))).toBe('Glm 4.6 (1M)');
  });

  it('falls back to the row value when the CLI reports no resolvedModel', () => {
    // Older CLIs (2.1.170) omit the field entirely. `value` is what we hand back
    // to select the row, so it can never be wrong about what will run.
    const noResolved = ModelInfo.from({ value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.6 · Efficient for routine tasks' });
    expect(resolveModelLabel(noResolved)).toBe('Sonnet');
  });
});

describe('the picker row shows the CLI description untouched', () => {
  it('passes the description through verbatim on every measured catalog', () => {
    for (const catalog of [ANTHROPIC, REMAPPED_NAMES_ONLY, PROXIED]) {
      for (const row of catalog) {
        expect(resolveModelRowText(row).blurb).toBe(row.description);
      }
    }
  });

  it('titles each row with the model it runs', () => {
    expect(resolveModelRowText(rowFor(PROXIED, 'haiku')))
      .toEqual({ title: 'Glm 4.5 Air', blurb: 'Custom Haiku model' });
    expect(resolveModelRowText(rowFor(REMAPPED_NAMES_ONLY, 'haiku')))
      .toEqual({ title: 'Glm 4.5 Air Mayi', blurb: 'Haiku 4.5 · Fastest for quick answers' });
  });

  it('keeps the whole default-row sentence, which names its model already', () => {
    // 'Use the default model (currently glm-4.6[1m])' is the CLI telling the
    // truth about this row; an earlier version of ours deleted that sentence.
    expect(resolveModelRowText(rowFor(PROXIED, 'default')).blurb)
      .toBe('Use the default model (currently glm-4.6[1m])');
  });
});

describe('the Fable fallback states the version once the probe supplies it', () => {
  const withProbe = (canonical: string | null) =>
    withFableFallback([ANTHROPIC[0]], '2.1.261', true, canonical);

  it('reads "Fable 5.1" when the alias resolved to claude-fable-5-1', () => {
    // Measured: `--model fable` reports modelUsage.canonicalModel = claude-fable-5-1.
    expect(resolveModelLabel(withProbe('claude-fable-5-1')[1])).toBe('Fable 5.1');
  });

  it('reads plain "Fable" until the probe answers', () => {
    expect(resolveModelLabel(withProbe(null)[1])).toBe('Fable');
  });

  it('follows the alias to a future version without a code change', () => {
    expect(resolveModelLabel(withProbe('claude-fable-6')[1])).toBe('Fable 6');
    expect(resolveModelLabel(withProbe('claude-mythos-7-2')[1])).toBe('Mythos 7.2');
  });

  it('is still found when system/init reports the concrete id', () => {
    const catalog = withProbe('claude-fable-5-1');
    expect(resolveModelInfo(catalog, 'claude-fable-5-1', { allowDefaultFallback: false })?.value)
      .toBe('fable');
  });
});
