import { describe, it, expect } from 'vitest';
import { noteCliSessionTitle } from '../cliSessionTitleTracker';

describe('noteCliSessionTitle', () => {
  it('treats the first announcement for a session as a reference, not a rename', () => {
    expect(noteCliSessionTitle('first-sighting', 'My name')).toBe(false);
  });

  it('treats the same name announced again as a repeat', () => {
    noteCliSessionTitle('repeat', 'My name');

    expect(noteCliSessionTitle('repeat', 'My name')).toBe(false);
  });

  it('treats a different name as a rename', () => {
    noteCliSessionTitle('renamed', 'Old name');

    expect(noteCliSessionTitle('renamed', 'New name')).toBe(true);
  });

  it('compares against the latest name, so a later repeat of the new name is not a rename', () => {
    noteCliSessionTitle('latest', 'Old name');
    noteCliSessionTitle('latest', 'New name');

    expect(noteCliSessionTitle('latest', 'New name')).toBe(false);
  });

  it('keeps sessions apart', () => {
    noteCliSessionTitle('session-a', 'Shared name');

    expect(noteCliSessionTitle('session-b', 'Other name')).toBe(false);
  });
});
