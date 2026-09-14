import { describe, it, expect } from 'vitest';
import { modelChangeLabel } from '../modelChangeLabel';
import { ANTHROPIC, REMAPPED_NAMES_ONLY, PROXIED, rowFor } from '@/types/__tests__/measuredCatalogs';
import { ModelInfo } from '@/types/slashCommand';

/**
 * The chat's model-change line answers "what did I just pick". For the `default`
 * row that answer has two halves, because picking it is a choice to follow the
 * default AND that default is some particular model right now.
 */
describe('the model-change line says both halves of a default pick', () => {
  it('names the choice and the model behind it', () => {
    expect(modelChangeLabel(rowFor(ANTHROPIC, 'default'))).toBe('Default · Opus 5 (1M)');
    expect(modelChangeLabel(rowFor(PROXIED, 'default'))).toBe('Default · Glm 4.6 (1M)');
    expect(modelChangeLabel(rowFor(REMAPPED_NAMES_ONLY, 'default'))).toBe('Default · Glm 5.2 Mayi (1M)');
  });

  it('drops "(recommended)", which is a nudge for while you are still choosing', () => {
    expect(modelChangeLabel(rowFor(ANTHROPIC, 'default'))).not.toContain('recommended');
  });

  it('takes the word from the CLI rather than writing "Default" itself', () => {
    // A catalog that calls the row something else keeps its own wording. Nothing
    // in here knows the word "Default", so nothing can overwrite theirs with it.
    const renamed = ModelInfo.from({
      value: 'default',
      resolvedModel: 'claude-opus-5[1m]',
      displayName: 'Auto (suggested)',
      description: '',
    });
    expect(modelChangeLabel(renamed)).toBe('Auto · Opus 5 (1M)');
  });

  it('keeps the row name whole when the CLI resolved no model for it', () => {
    // Older CLIs (2.1.170) omit `resolvedModel`: there is no second half to say.
    const unresolved = ModelInfo.from({ value: 'default', displayName: 'Default (recommended)', description: '' });
    expect(modelChangeLabel(unresolved)).toBe('Default (recommended)');
  });

  it('says the model alone when the row has no name of its own', () => {
    const nameless = ModelInfo.from({ value: 'default', resolvedModel: 'claude-opus-5[1m]', description: '' });
    expect(modelChangeLabel(nameless)).toBe('Opus 5 (1M)');
  });
});

describe('every other row is named exactly as it is', () => {
  it('repeats the row label unchanged', () => {
    expect(modelChangeLabel(rowFor(ANTHROPIC, 'opus[1m]'))).toBe('Opus 5 (1M)');
    expect(modelChangeLabel(rowFor(ANTHROPIC, 'sonnet'))).toBe('Sonnet 5');
    expect(modelChangeLabel(rowFor(REMAPPED_NAMES_ONLY, 'haiku'))).toBe('Glm 4.5 Air Mayi');
  });

  it('keeps the dated snapshot, unlike the chip, because this line has room', () => {
    expect(modelChangeLabel(rowFor(ANTHROPIC, 'haiku'))).toBe('Haiku 4.5 (20251001)');
  });
});
