import { describe, it, expect } from 'vitest';
import { withoutIdeContext } from '../cli-authored-text';

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
