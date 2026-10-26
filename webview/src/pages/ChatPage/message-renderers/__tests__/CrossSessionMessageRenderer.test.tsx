import { describe, expect, it } from 'vitest';
import { parseCrossSessionMessage } from '../CrossSessionMessageRenderer';

describe('parseCrossSessionMessage', () => {
  it('reads the sender and text of a wrapped message', () => {
    expect(parseCrossSessionMessage('<cross-session-message from="local_a" name="* issue #593">\n#593 test\n</cross-session-message>')).toEqual({
      from: 'local_a', name: '* issue #593', body: '#593 test',
    });
  });

  it('ignores the system reminder the CLI puts ahead of it', () => {
    expect(parseCrossSessionMessage('<system-reminder>\nLinked sessions\n</system-reminder>\n\n<cross-session-message from="a" name="n">hi</cross-session-message>')).toEqual({ from: 'a', name: 'n', body: 'hi' });
  });

  it('leaves anything else alone', () => {
    expect(parseCrossSessionMessage('hello')).toBeUndefined();
    expect(parseCrossSessionMessage('see <cross-session-message from="a">x</cross-session-message> and more')).toBeUndefined();
  });
});

describe('parseCrossSessionPreview', () => {
  it('reads a cut copy whose closing tag is gone', async () => {
    const { parseCrossSessionPreview } = await import('../CrossSessionMessageRenderer');
    expect(parseCrossSessionPreview('<cross-session-message from="a" name="n">\nhello wor')).toEqual({ from: 'a', name: 'n', body: 'hello wor' });
    expect(parseCrossSessionPreview('plain')).toBeUndefined();
  });
});
