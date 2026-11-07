import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachFormattedCopy } from './FormattedCopy';

let detach: (() => void) | undefined;

function copyEvent(type: 'copy' | 'cut' = 'copy') {
  const setData = vi.fn();
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { setData } });
  document.dispatchEvent(event);
  return { event, setData };
}

function selectAll(id: string) {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById(id)!);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

beforeEach(() => {
  document.body.innerHTML =
    '<div id="block"><pre><code>' +
    '<span class="block"><span>def</span><span> </span><span>greet():</span></span>' +
    '<span class="block"><span>    return</span><span> </span><span>1</span></span>' +
    '</code></pre></div><input id="field" value="typed words" />';
  detach = attachFormattedCopy(document);
});

afterEach(() => {
  detach?.();
  detach = undefined;
  window.getSelection()?.removeAllRanges();
});

describe('attachFormattedCopy (a browser with no IDE host)', () => {
  it('writes the text and the HTML of a copy, so a code block keeps its lines and spaces when pasted (#648)', () => {
    selectAll('block');

    const { event, setData } = copyEvent('copy');

    expect(setData).toHaveBeenCalledWith('text/html', '<pre><code>def greet():\n    return 1</code></pre>');
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('def greet():'));
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a cut to the browser, which has to remove the selection itself', () => {
    selectAll('block');

    const { event, setData } = copyEvent('cut');

    expect(setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a copy from a text field to the browser, since there is no formatting to keep', () => {
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, 5);

    const { event, setData } = copyEvent('copy');

    expect(setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a copy alone when nothing is selected', () => {
    const { event, setData } = copyEvent('copy');

    expect(setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops when detached', () => {
    selectAll('block');
    detach!();
    detach = undefined;

    const { setData } = copyEvent('copy');

    expect(setData).not.toHaveBeenCalled();
  });
});
