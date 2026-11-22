import { describe, it, expect } from 'vitest';
import { composeSendText, typedSendText } from '../sendText';
import { buildSessionMentionTag } from '../ChatInput/sessionMentionTag';

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

describe('typedSendText', () => {
  const IDE_FILE =
    '<ide_opened_file>The user opened the file src/a.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>';
  const IDE_SELECTION =
    '<ide_selection>The user selected the lines 1 to 2 from src/a.ts:\nfoo\n\nThis may or may not be related to the current task.</ide_selection>';

  it('leaves a plain send as it was, without the blanks around it', () => {
    expect(typedSendText('just words')).toBe('just words');
    expect(typedSendText('  padded \n')).toBe('padded');
  });

  it('takes off the note the GUI wrapped around a send (#232)', () => {
    const raw = 'rename the helper\n<system-reminder>The text above is the user addressing another Claude session.</system-reminder>';
    expect(typedSendText(raw)).toBe('rename the helper');
  });

  it('takes off what a picked page element stands for', () => {
    const raw = 'change this Element button#ok\n<picked-element>\nElement button#ok\n<button id="ok"/>\n</picked-element>';
    expect(typedSendText(raw)).toBe('change this Element button#ok');
  });

  it('takes off the open file and the selection the IDE put ahead of what was typed (#719)', () => {
    expect(typedSendText(`${IDE_FILE}fix it`)).toBe('fix it');
    expect(typedSendText(`${IDE_SELECTION}fix it`)).toBe('fix it');
    expect(typedSendText(`${IDE_FILE}${IDE_SELECTION}fix it`)).toBe('fix it');
  });

  it('leaves nothing when only the IDE context was sent', () => {
    expect(typedSendText(IDE_FILE)).toBe('');
  });

  it('unwraps a pasted block and keeps the pasted words', () => {
    expect(typedSendText('look <pasted_content id="6c03">pasted body</pasted_content>')).toBe('look pasted body');
  });

  it('keeps the tag that addresses another session, so the composer can bring the chip back', () => {
    const mention = buildSessionMentionTag({
      sessionId: '458fa4b4-a049',
      agentName: 'proj-57',
      sessionDir: '/Users/me/proj',
      label: '@@fix the proxy',
    });
    expect(typedSendText(`${mention} hello\n<system-reminder>Call SendMessage now.</system-reminder>`)).toBe(
      `${mention} hello`,
    );
  });

  it('leaves reply cards as written, since they are the words that went out', () => {
    const raw = '<!-- reply 1 -->\n> a quote\n\nits comment\n\n\nthe typed words';
    expect(typedSendText(raw)).toBe(raw);
  });
});
