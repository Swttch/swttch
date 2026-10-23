import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ClipboardReporter } from './ClipboardReporter';

let detach: (() => void) | undefined;
let report: Mock<(text: string) => Promise<unknown>>;

function clipboardWith(writeText: (text: string) => Promise<void>) {
  return { writeText } as unknown as Clipboard;
}

function attach(clipboard: Clipboard | undefined): void {
  report = vi.fn<(text: string) => Promise<unknown>>().mockResolvedValue(undefined);
  detach = new ClipboardReporter(document, clipboard, report).attach();
}

function copyEvent(type: 'copy' | 'cut' = 'copy'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
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
  document.body.innerHTML = '<p id="text">alpha beta gamma</p><input id="field" value="typed words" />';
});

afterEach(() => {
  detach?.();
  detach = undefined;
  window.getSelection()?.removeAllRanges();
});

describe('ClipboardReporter: copies made by script', () => {
  it('writes the browser clipboard as before and reports the same text to the host', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = clipboardWith(writeText);
    attach(clipboard);

    await clipboard.writeText('code from the block');

    expect(writeText).toHaveBeenCalledWith('code from the block');
    expect(report).toHaveBeenCalledWith('code from the block');
  });

  it('counts the copy as done when only the host placed it', async () => {
    const clipboard = clipboardWith(vi.fn().mockRejectedValue(new Error('clipboard unavailable')));
    attach(clipboard);

    await expect(clipboard.writeText('message text')).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith('message text');
  });

  it('counts the copy as done when only the browser placed it, so an unreachable host costs nothing', async () => {
    const clipboard = clipboardWith(vi.fn().mockResolvedValue(undefined));
    attach(clipboard);
    report.mockRejectedValue(new Error('No IDE host connected'));

    await expect(clipboard.writeText('x')).resolves.toBeUndefined();
  });

  it('does not wait for a host that never answers once the browser has placed the text', async () => {
    const clipboard = clipboardWith(vi.fn().mockResolvedValue(undefined));
    attach(clipboard);
    report.mockReturnValue(new Promise(() => {}));

    await expect(clipboard.writeText('x')).resolves.toBeUndefined();
  });

  it('rejects with the browser error when neither side placed the text, so the copy button says it failed', async () => {
    const refusal = new Error('denied');
    const clipboard = clipboardWith(vi.fn().mockRejectedValue(refusal));
    attach(clipboard);
    report.mockRejectedValue(new Error('No IDE host connected'));

    await expect(clipboard.writeText('x')).rejects.toBe(refusal);
  });

  it('rejects when the browser throws at once and the host cannot place the text either', async () => {
    const clipboard = clipboardWith(
      vi.fn().mockImplementation(() => {
        throw new TypeError('not allowed');
      }),
    );
    attach(clipboard);
    report.mockRejectedValue(new Error('No IDE host connected'));

    await expect(clipboard.writeText('x')).rejects.toThrow('not allowed');
  });

  it('does not ask the host to place an empty text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = clipboardWith(writeText);
    attach(clipboard);

    await clipboard.writeText('');

    expect(writeText).toHaveBeenCalledWith('');
    expect(report).not.toHaveBeenCalled();
  });

  it('restores the browser clipboard method when detached', async () => {
    const clipboard = clipboardWith(vi.fn().mockResolvedValue(undefined));
    const original = clipboard.writeText;
    attach(clipboard);
    expect(clipboard.writeText).not.toBe(original);

    detach!();
    detach = undefined;

    expect(clipboard.writeText).toBe(original);
    await clipboard.writeText('after detach');
    expect(report).not.toHaveBeenCalled();
  });

  it('leaves a later wrapper alone when detaching', () => {
    const clipboard = clipboardWith(vi.fn().mockResolvedValue(undefined));
    attach(clipboard);
    const later = vi.fn().mockResolvedValue(undefined);
    clipboard.writeText = later;

    detach!();
    detach = undefined;

    expect(clipboard.writeText).toBe(later);
  });

  it('works without a Clipboard API', () => {
    expect(() => attach(undefined)).not.toThrow();
  });
});

describe('ClipboardReporter: copies made by the browser itself', () => {
  it('reports text copied through the native copy event', () => {
    attach(undefined);
    selectWord('beta');

    copyEvent('copy');

    expect(report).toHaveBeenCalledWith('beta');
  });

  it('reports the selected text for a cut', () => {
    attach(undefined);
    selectWord('gamma');

    copyEvent('cut');

    expect(report).toHaveBeenCalledWith('gamma');
  });

  it('reads the selection inside a text field, which the page selection does not hold', () => {
    attach(undefined);
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, 5);

    copyEvent('copy');

    expect(report).toHaveBeenCalledWith('typed');
  });

  it('does not report password selections', () => {
    document.body.innerHTML = '<input id="secret" type="password" value="hunter2" />';
    attach(undefined);
    const field = document.getElementById('secret') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, field.value.length);

    copyEvent('copy');

    expect(report).not.toHaveBeenCalled();
  });

  it('reports nothing when nothing is selected', () => {
    attach(undefined);

    copyEvent('copy');

    expect(report).not.toHaveBeenCalled();
  });

  it('leaves a copy alone when someone else took it over and wrote their own text', () => {
    attach(undefined);
    selectWord('beta');
    document.addEventListener('copy', (e) => e.preventDefault(), { once: true, capture: true });

    copyEvent('copy');

    expect(report).not.toHaveBeenCalled();
  });

  it('survives a host that cannot place the text: the browser copy went ahead already', async () => {
    attach(undefined);
    report.mockRejectedValue(new Error('No IDE host connected'));
    selectWord('beta');

    expect(() => copyEvent('copy')).not.toThrow();
    await Promise.resolve();
  });

  it('stops listening when detached', () => {
    attach(undefined);
    selectWord('beta');
    detach!();
    detach = undefined;

    copyEvent('copy');

    expect(report).not.toHaveBeenCalled();
  });
});
