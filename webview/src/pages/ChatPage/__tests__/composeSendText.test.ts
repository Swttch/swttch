import { describe, it, expect } from 'vitest';
import { composeSendText } from '../sendText';

describe('composeSendText', () => {
  it('reads a send made only of reply cards as the quotes and comments (#657)', () => {
    const raw = '<!-- reply 2 -->\n> first quote\n\nfirst comment\n\n<!-- reply -->\n> second quote\n\nsecond comment\n\n\n';
    expect(composeSendText(raw)).toBe('first quote\nfirst comment\nsecond quote\nsecond comment');
  });

  it('puts what was typed after the cards', () => {
    const raw = '<!-- reply 1 -->\n> a quote\n\nits comment\n\n\nand the typed words';
    expect(composeSendText(raw)).toBe('a quote\nits comment\nand the typed words');
  });

  it('reads a copy cut in the middle of a card', () => {
    expect(composeSendText('<!-- reply 1 -->\n> a quote\n\nits comm')).toBe('a quote\nits comm');
  });

  it('leaves a plain send and a slash command as they were', () => {
    expect(composeSendText('just words')).toBe('just words');
    expect(composeSendText('<command-name>/clear</command-name>')).toBe('/clear');
  });
});
