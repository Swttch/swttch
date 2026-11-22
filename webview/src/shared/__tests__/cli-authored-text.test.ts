import { describe, it, expect } from 'vitest';
import { isCliAuthoredText, withoutIdeContext } from '../cli-authored-text';

const FILE =
  '<ide_opened_file>The user opened the file src/a.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>';
const SELECTION =
  '<ide_selection>The user selected the lines 1 to 2 from src/a.ts:\nfoo\n\nThis may or may not be related to the current task.</ide_selection>';

describe('withoutIdeContext', () => {
  it('takes off the open file and the selection, keeping the words around them', () => {
    expect(withoutIdeContext(`${FILE}${SELECTION}fix it`)).toBe('fix it');
    expect(withoutIdeContext(`before ${FILE} after`)).toBe('before  after');
  });

  it('leaves a text without the tags as it was', () => {
    expect(withoutIdeContext('a <b> c')).toBe('a <b> c');
  });
});

describe('isCliAuthoredText', () => {
  it('calls an entry made only of the IDE context CLI-authored', () => {
    expect(isCliAuthoredText(FILE)).toBe(true);
    expect(isCliAuthoredText(SELECTION)).toBe(true);
  });

  it('counts a send the plugin wrote the IDE context ahead of as typed (#719)', () => {
    // The plugin puts the tag in front of what was typed, in the same entry (`injectIdeContext`).
    expect(isCliAuthoredText(`${FILE}fix it`)).toBe(false);
    expect(isCliAuthoredText(`${SELECTION}fix it`)).toBe(false);
    expect(isCliAuthoredText(`${FILE}${SELECTION}fix it`)).toBe(false);
  });

  it('takes off the reminders before the test, as it did before (#657)', () => {
    expect(isCliAuthoredText('<system-reminder>a note</system-reminder>fix it')).toBe(false);
    expect(isCliAuthoredText('<system-reminder>a note</system-reminder>')).toBe(true);
  });

  it('still calls what the CLI wrote itself CLI-authored', () => {
    expect(isCliAuthoredText('<command-name>/compact</command-name>')).toBe(true);
    expect(isCliAuthoredText('<local-command-stdout>Compacted</local-command-stdout>')).toBe(true);
    expect(isCliAuthoredText('<task-notification>done</task-notification>')).toBe(true);
    expect(isCliAuthoredText('[Request interrupted by user]')).toBe(true);
    expect(isCliAuthoredText('')).toBe(true);
  });

  it('counts a prompt that only quotes a marker further in as typed', () => {
    expect(isCliAuthoredText('what does <local-command-stdout> mean?')).toBe(false);
  });
});
