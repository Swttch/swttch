import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { ComposerFocusPolicy } from '../composerFocusPolicy';

let detach: (() => void) | undefined;
let focusComposer: Mock<() => void>;

function newPolicy(): ComposerFocusPolicy {
  focusComposer = vi.fn<() => void>();
  const policy = new ComposerFocusPolicy(document, focusComposer);
  detach = policy.attach();
  return policy;
}

function press(type: 'pointerdown' | 'pointerup' | 'pointercancel') {
  document.dispatchEvent(new Event(type, { bubbles: true }));
}

function click(target: Element) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

function selectText() {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('text')!);
  window.getSelection()!.addRange(range);
}

beforeEach(() => {
  document.body.innerHTML =
    '<p id="text">some chat text</p><button id="btn">x</button>' +
    '<div role="dialog"><span id="in-dialog">inside a dialog</span></div>';
  (document.activeElement as HTMLElement | null)?.blur();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  detach?.();
  detach = undefined;
});

describe('ComposerFocusPolicy when the window regains focus', () => {
  it('puts the caret in the composer when nothing holds focus, nothing is selected and no button is down', () => {
    newPolicy().restoreOnWindowFocus();
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('leaves another focused element alone', () => {
    const policy = newPolicy();
    document.getElementById('btn')!.focus();
    expect(document.activeElement).not.toBe(document.body);

    policy.restoreOnWindowFocus();

    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('waits while a selection exists and goes ahead once it is dropped', () => {
    const policy = newPolicy();
    selectText();
    policy.restoreOnWindowFocus();
    expect(focusComposer).not.toHaveBeenCalled();

    window.getSelection()!.removeAllRanges();
    policy.restoreOnWindowFocus();
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('waits while the mouse button is held, however long it has been down, and goes ahead after release', () => {
    const policy = newPolicy();
    press('pointerdown');
    policy.restoreOnWindowFocus();
    expect(focusComposer).not.toHaveBeenCalled();

    press('pointerup');
    policy.restoreOnWindowFocus();
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('treats a cancelled press as released', () => {
    const policy = newPolicy();
    press('pointerdown');
    press('pointercancel');

    policy.restoreOnWindowFocus();

    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('stops watching presses after the returned function is called', () => {
    const policy = new ComposerFocusPolicy(document, (focusComposer = vi.fn<() => void>()));
    const stop = policy.attach();
    stop();
    press('pointerdown');

    policy.restoreOnWindowFocus();

    expect(focusComposer).toHaveBeenCalledTimes(1);
  });
});

describe('ComposerFocusPolicy after a click (#513)', () => {
  it('puts the caret in the composer after a plain click on the page', () => {
    newPolicy();
    click(document.getElementById('text')!);
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('does that for every plain click, not only the first one after returning', () => {
    newPolicy();
    click(document.getElementById('text')!);
    click(document.getElementById('text')!);
    expect(focusComposer).toHaveBeenCalledTimes(2);
  });

  it('leaves a click on a button alone, since the click was meant for the button', () => {
    newPolicy();
    click(document.getElementById('btn')!);
    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('leaves a click inside a dialog alone, since the dialog traps focus on its own', () => {
    newPolicy();
    click(document.getElementById('in-dialog')!);
    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('leaves a click alone when it ended with text selected (word or drag selection)', () => {
    newPolicy();
    selectText();
    click(document.getElementById('text')!);
    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('leaves a click alone when another element already holds focus', () => {
    newPolicy();
    document.getElementById('btn')!.focus();
    click(document.getElementById('text')!);
    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('reads the composed path, so a click inside a shadow root editor is not taken for a plain click', () => {
    newPolicy();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div id="editable" contenteditable="true">proposed edit</div>';

    click(shadow.getElementById('editable')!);

    expect(focusComposer).not.toHaveBeenCalled();
  });

  it('stops watching clicks after the returned function is called', () => {
    const policy = new ComposerFocusPolicy(document, (focusComposer = vi.fn<() => void>()));
    const stop = policy.attach();
    stop();
    click(document.getElementById('text')!);
    expect(focusComposer).not.toHaveBeenCalled();
  });
});
