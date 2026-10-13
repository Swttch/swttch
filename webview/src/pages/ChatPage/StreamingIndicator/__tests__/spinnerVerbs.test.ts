import { describe, it, expect } from 'vitest';
import { resolveSpinnerVerbs } from '../spinnerVerbs';
import { SpinnerVerbsMode, type SpinnerVerbsConfig } from '@/types/claude-settings';

const BUILT_IN = ['Deliberating', 'Perusing', 'Flibbertigibbeting'] as const;

// A settings file is hand-edited JSON, so the value can be anything. This lets a test
// hand the resolver a shape the type forbids without reaching for `any`.
function malformed(value: object): SpinnerVerbsConfig {
  return value as SpinnerVerbsConfig;
}

describe('resolveSpinnerVerbs', () => {
  it('keeps the built-in verbs when there is no setting', () => {
    expect(resolveSpinnerVerbs(BUILT_IN, undefined)).toEqual(BUILT_IN);
    expect(resolveSpinnerVerbs(BUILT_IN, null)).toEqual(BUILT_IN);
  });

  it('shows only the user’s verbs in replace mode', () => {
    // The reporter of #548 sets exactly this and expects "Processing…" and nothing else.
    expect(
      resolveSpinnerVerbs(BUILT_IN, { mode: SpinnerVerbsMode.Replace, verbs: ['Processing'] }),
    ).toEqual(['Processing']);
  });

  it('adds the user’s verbs after the built-in ones in append mode', () => {
    expect(
      resolveSpinnerVerbs(BUILT_IN, { mode: SpinnerVerbsMode.Append, verbs: ['Pondering', 'Crafting'] }),
    ).toEqual([...BUILT_IN, 'Pondering', 'Crafting']);
  });

  it('keeps the built-in verbs when replace has an empty verbs list', () => {
    // Claude Code's documented behaviour. Showing an empty spinner would be worse than ignoring the key.
    expect(
      resolveSpinnerVerbs(BUILT_IN, { mode: SpinnerVerbsMode.Replace, verbs: [] }),
    ).toEqual(BUILT_IN);
  });

  it('leaves only the built-in verbs when append has an empty verbs list', () => {
    expect(
      resolveSpinnerVerbs(BUILT_IN, { mode: SpinnerVerbsMode.Append, verbs: [] }),
    ).toEqual(BUILT_IN);
  });

  it('reads any mode other than replace as append', () => {
    // The Cursor extension does the same: anything but "replace" adds to the built-in set.
    expect(resolveSpinnerVerbs(BUILT_IN, malformed({ mode: 'merge', verbs: ['X'] }))).toEqual([...BUILT_IN, 'X']);
    expect(resolveSpinnerVerbs(BUILT_IN, malformed({ verbs: ['X'] }))).toEqual([...BUILT_IN, 'X']);
  });

  it('treats verbs that is not a list as no setting', () => {
    expect(
      resolveSpinnerVerbs(BUILT_IN, malformed({ mode: SpinnerVerbsMode.Replace, verbs: 'Processing' })),
    ).toEqual(BUILT_IN);
    expect(resolveSpinnerVerbs(BUILT_IN, malformed({ mode: SpinnerVerbsMode.Replace }))).toEqual(BUILT_IN);
  });

  it('drops entries that are not text and uses the rest', () => {
    expect(
      resolveSpinnerVerbs(
        BUILT_IN,
        malformed({ mode: SpinnerVerbsMode.Replace, verbs: ['Processing', 3, null, 'Working'] }),
      ),
    ).toEqual(['Processing', 'Working']);
  });

  it('keeps the built-in verbs when replace has nothing usable left', () => {
    expect(
      resolveSpinnerVerbs(BUILT_IN, malformed({ mode: SpinnerVerbsMode.Replace, verbs: [1, null] })),
    ).toEqual(BUILT_IN);
  });
});
