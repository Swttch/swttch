import { describe, it, expect } from 'vitest';
import { randomPick } from '../utils';

describe('randomPick', () => {
  it('picks from what is left after excluding the previous value', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomPick(['a', 'b'], 'a')).toBe('b');
    }
  });

  it('returns the previous value again when it is the only candidate', () => {
    // A user who sets `spinnerVerbs` to a single verb (#548) leaves nothing to rotate
    // to. Excluding the previous pick emptied the list and returned undefined, which
    // the scramble then read `.length` from.
    expect(randomPick(['Processing'], 'Processing')).toBe('Processing');
  });

  it('picks from the whole list when there is no previous value', () => {
    expect(randomPick(['only'])).toBe('only');
  });
});
