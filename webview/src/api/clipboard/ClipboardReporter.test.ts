import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardReporter } from './ClipboardReporter';

let detach: (() => void) | undefined;

function clipboardWith(writeText: (text: string) => Promise<void>) {
  return { writeText } as unknown as Clipboard;
}

function selectWord(word: string) {
  const node = document.getElementById('text')!.firstChild as Text;
  const start = node.data.indexOf(word);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + word.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

beforeEach(() => {
  document.body.innerHTML = '<p id="text">alpha beta gamma</p>';
});

afterEach(() => {
  detach?.();
  detach = undefined;
  window.getSelection()?.removeAllRanges();
});

describe('ClipboardReporter', () => {
  it('reports text copied through the native copy event', () => {
    const report = vi.fn();
    detach = new ClipboardReporter(document, undefined, report).attach();
    selectWord('beta');

    document.dispatchEvent(new Event('copy'));

    expect(report).toHaveBeenCalledWith('beta');
  });

  it('reports text written by a copy button through navigator.clipboard', async () => {
    const report = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = clipboardWith(writeText);
    detach = new ClipboardReporter(document, clipboard, report).attach();

    await clipboard.writeText('code from the block');

    expect(writeText).toHaveBeenCalledWith('code from the block');
    expect(report).toHaveBeenCalledWith('code from the block');
  });

  it('falls back to the host when the browser clipboard rejects the write', async () => {
    const report = vi.fn();
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    const clipboard = clipboardWith(writeText);
    detach = new ClipboardReporter(document, clipboard, report).attach();

    await expect(clipboard.writeText('message text')).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith('message text');
  });

  it('does not report password selections', () => {
    const report = vi.fn();
    document.body.innerHTML = '<input id="secret" type="password" value="hunter2" />';
    const field = document.getElementById('secret') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, field.value.length);
    detach = new ClipboardReporter(document, undefined, report).attach();

    document.dispatchEvent(new Event('copy'));

    expect(report).not.toHaveBeenCalled();
  });

  it('restores the browser clipboard method when detached', async () => {
    const report = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = clipboardWith(writeText);
    const original = clipboard.writeText;
    detach = new ClipboardReporter(document, clipboard, report).attach();
    detach();
    detach = undefined;

    expect(clipboard.writeText).toBe(original);
    await clipboard.writeText('after detach');
    expect(report).not.toHaveBeenCalled();
  });
});
