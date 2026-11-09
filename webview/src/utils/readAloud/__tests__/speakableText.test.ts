import { describe, it, expect } from 'vitest';
import { speakableText } from '../speakableText';

const CODE = 'a code block';

describe('speakableText', () => {
  it('drops the marks of emphasis and headings but keeps the words', () => {
    expect(speakableText('# Title\n\nSome **bold** and *slanted* and `code` words.', CODE)).toBe('Title\n\nSome bold and slanted and code words.');
  });

  it('says a link by its words, not its address, and drops a picture', () => {
    expect(speakableText('See [the docs](https://example.com/x) now ![shot](a.png).', CODE)).toBe('See the docs now .');
  });

  it('turns a fenced code block into one phrase', () => {
    const text = 'Run this:\n\n```bash\nls -la\nrm x\n```\n\nThen wait.';
    expect(speakableText(text, CODE)).toBe(`Run this:\n\n${CODE}\n\nThen wait.`);
  });

  it('turns an unfinished fence, as in a reply still being written, into the phrase and cuts the rest', () => {
    expect(speakableText('Look:\n\n```ts\nconst a = 1;\nmore', CODE)).toBe(`Look:\n\n${CODE}`);
  });

  it('drops list bullets, numbers and table rules', () => {
    const text = '- one\n- two\n1. first\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    const spoken = speakableText(text, CODE);
    expect(spoken).toContain('one\ntwo\nfirst');
    expect(spoken).not.toContain('---');
    expect(spoken).not.toContain('|');
  });
});
