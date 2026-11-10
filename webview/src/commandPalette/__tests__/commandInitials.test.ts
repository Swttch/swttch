import { describe, it, expect } from 'vitest';
import { initialsOf, matchInitials, highlightInitials } from '../commandInitials';
import { restoreCommandName } from '../typedKeys';

describe('initialsOf', () => {
  it('takes the first letter of each word, split at "-", ":" and "_"', () => {
    expect(initialsOf('/grill-with-docs')).toBe('gwd');
    expect(initialsOf('/oh-my-claudecode:analyze')).toBe('omca');
    expect(initialsOf('/add_new_thing')).toBe('ant');
  });

  it('has none for a one-word name', () => {
    expect(initialsOf('/model')).toBeNull();
  });
});

describe('matchInitials', () => {
  it('is exact for the whole set of initials and prefix for the start of it', () => {
    expect(matchInitials('/grill-with-docs', 'gwd')).toBe('exact');
    expect(matchInitials('/grill-with-docs', 'gw')).toBe('prefix');
    expect(matchInitials('/grill-with-docs', 'GWD')).toBe('exact');
  });

  it('does not match other letters or a single letter', () => {
    expect(matchInitials('/grill-with-docs', 'gx')).toBeNull();
    expect(matchInitials('/grill-with-docs', 'g')).toBeNull();
    expect(matchInitials('/model', 'mo')).toBeNull();
  });
});

describe('highlightInitials', () => {
  it('marks the first letter of each matched word', () => {
    expect(highlightInitials('/grill-with-docs', 'gw')).toEqual([
      { text: '/', matched: false },
      { text: 'g', matched: true },
      { text: 'rill-', matched: false },
      { text: 'w', matched: true },
      { text: 'ith-docs', matched: false },
    ]);
  });
});

describe('restoreCommandName with initials', () => {
  it('puts the full name back and keeps the arguments', () => {
    expect(restoreCommandName('/gwd some text', '/grill-with-docs')).toBe('/grill-with-docs some text');
    expect(restoreCommandName('/gwd', '/grill-with-docs')).toBe('/grill-with-docs');
  });

  it('leaves a line that is not the initials alone', () => {
    expect(restoreCommandName('/xyz foo', '/grill-with-docs')).toBe('/xyz foo');
  });
});
