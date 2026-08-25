import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCaretBoundaryKeys } from '../useCaretBoundaryKeys';

vi.mock('@/config/environment', () => ({ isMac: () => true }));

/**
 * Cmd+Arrow has to work in every text field, not just the composer: under JCEF's
 * off-screen rendering the macOS binding is missing app-wide, and the first fix
 * for it reached the chat input alone — leaving the session search, the settings
 * fields and everything else still stuck.
 *
 * `<input>`/`<textarea>` are the half that can be asserted in jsdom, since their
 * selection is character offsets rather than a laid-out Selection.
 */
describe('useCaretBoundaryKeys', () => {
  let field: HTMLInputElement;

  beforeEach(() => {
    renderHook(() => useCaretBoundaryKeys());
    field = document.createElement('input');
    field.value = 'hello world';
    document.body.appendChild(field);
    field.focus();
  });

  afterEach(() => {
    field.remove();
  });

  function pressOn(target: HTMLElement, key: string, mods: { shiftKey?: boolean; altKey?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      metaKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...mods,
    });
    target.dispatchEvent(event);
    return event;
  }

  it('sends the caret to the start of an input', () => {
    field.setSelectionRange(7, 7);

    const event = pressOn(field, 'ArrowLeft');

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('sends the caret to the end of an input', () => {
    field.setSelectionRange(3, 3);

    pressOn(field, 'ArrowRight');

    expect(field.selectionStart).toBe('hello world'.length);
  });

  it('selects up to the edge when Shift is held', () => {
    field.setSelectionRange(6, 6);

    pressOn(field, 'ArrowLeft', { shiftKey: true });

    // The anchor stays where the user started; the caret end travels.
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(6);
  });

  it('leaves Option+Arrow to the browser', () => {
    field.setSelectionRange(6, 6);

    const event = pressOn(field, 'ArrowLeft', { altKey: true });

    // Word-wise movement is Chromium's own and still works under OSR, so this
    // must pass through untouched rather than jumping to the line edge.
    expect(event.defaultPrevented).toBe(false);
    expect(field.selectionStart).toBe(6);
  });

  it('ignores keystrokes that did not land in a text field', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    const event = pressOn(button, 'ArrowLeft');

    expect(event.defaultPrevented).toBe(false);
    button.remove();
  });

  it('stops a hard newline from being crossed in a textarea', () => {
    const area = document.createElement('textarea');
    area.value = 'first line\nsecond line';
    document.body.appendChild(area);
    area.setSelectionRange(17, 17); // inside "second line"

    pressOn(area, 'ArrowLeft');

    // The start of the line the caret is on, not the start of the whole value.
    expect(area.selectionStart).toBe('first line\n'.length);
    area.remove();
  });
});
