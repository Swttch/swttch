import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { PrimarySelectionReporter } from './PrimarySelectionReporter';

let detach: (() => void) | undefined;
let report: Mock<(text: string) => void>;

function newReporter(): PrimarySelectionReporter {
  report = vi.fn<(text: string) => void>();
  const reporter = new PrimarySelectionReporter(document, report);
  detach = reporter.attach();
  return reporter;
}

function pointer(type: 'pointerdown' | 'pointerup' | 'pointercancel') {
  document.dispatchEvent(new Event(type, { bubbles: true }));
}

function selectionChanged() {
  document.dispatchEvent(new Event('selectionchange'));
}

/** Select [word] inside the paragraph, the way a double-click leaves it. */
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
  (document.activeElement as HTMLElement | null)?.blur();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  detach?.();
  detach = undefined;
});

describe('PrimarySelectionReporter with the mouse', () => {
  it('reports the word a double-click selected once the button is released', () => {
    newReporter();
    pointer('pointerdown');
    selectWord('beta');
    selectionChanged();
    expect(report).not.toHaveBeenCalled();

    pointer('pointerup');

    expect(report.mock.calls).toEqual([['beta']]);
  });

  it('does not report again for the selection change that follows the release', () => {
    newReporter();
    pointer('pointerdown');
    selectWord('beta');
    pointer('pointerup');

    selectionChanged();

    expect(report).toHaveBeenCalledTimes(1);
  });

  it('stays silent while a drag is in progress and reports only the final text', () => {
    newReporter();
    pointer('pointerdown');
    selectWord('alpha');
    selectionChanged();
    selectWord('beta');
    selectionChanged();
    selectWord('gamma');
    selectionChanged();
    expect(report).not.toHaveBeenCalled();

    pointer('pointerup');

    expect(report.mock.calls).toEqual([['gamma']]);
  });

  it('claims the buffer again when a release ends on the same text, since another program may have taken it', () => {
    newReporter();
    pointer('pointerdown');
    selectWord('beta');
    pointer('pointerup');

    pointer('pointerdown');
    pointer('pointerup');

    expect(report.mock.calls).toEqual([['beta'], ['beta']]);
  });

  it('treats a cancelled press as a release', () => {
    newReporter();
    pointer('pointerdown');
    selectWord('beta');
    pointer('pointercancel');

    expect(report.mock.calls).toEqual([['beta']]);
  });
});

describe('PrimarySelectionReporter with the keyboard', () => {
  it('reports each change of the selection, since no button is held', () => {
    newReporter();

    selectWord('alpha');
    selectionChanged();
    selectWord('beta');
    selectionChanged();

    expect(report.mock.calls).toEqual([['alpha'], ['beta']]);
  });

  it('does not repeat the same text', () => {
    newReporter();

    selectWord('alpha');
    selectionChanged();
    selectionChanged();

    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports a text again once the selection has been emptied in between', () => {
    newReporter();
    selectWord('alpha');
    selectionChanged();

    window.getSelection()!.removeAllRanges();
    selectionChanged();
    selectWord('alpha');
    selectionChanged();

    expect(report.mock.calls).toEqual([['alpha'], ['alpha']]);
  });
});

describe('PrimarySelectionReporter and empty selections', () => {
  it('never reports an empty selection, since that must not empty the buffer the user can still paste', () => {
    newReporter();

    selectionChanged();
    pointer('pointerdown');
    pointer('pointerup');

    expect(report).not.toHaveBeenCalled();
  });
});

describe('PrimarySelectionReporter with text fields', () => {
  it('reports the selected part of a text field, which the page selection does not hold', () => {
    document.body.innerHTML = '<textarea id="field"></textarea>';
    const field = document.getElementById('field') as HTMLTextAreaElement;
    field.value = 'one two three';
    newReporter();
    field.focus();
    field.setSelectionRange(4, 7);

    pointer('pointerup');

    expect(report.mock.calls).toEqual([['two']]);
  });

  it('never reports anything from a password field', () => {
    document.body.innerHTML = '<input id="secret" type="password" />';
    const field = document.getElementById('secret') as HTMLInputElement;
    field.value = 'hunter2';
    newReporter();
    field.focus();
    field.setSelectionRange(0, 7);

    pointer('pointerup');
    selectionChanged();

    expect(report).not.toHaveBeenCalled();
  });
});

describe('PrimarySelectionReporter detaching', () => {
  it('stops watching after the returned function is called', () => {
    const reporter = new PrimarySelectionReporter(document, (report = vi.fn<(text: string) => void>()));
    const stop = reporter.attach();
    stop();

    selectWord('beta');
    pointer('pointerup');
    selectionChanged();

    expect(report).not.toHaveBeenCalled();
  });
});
