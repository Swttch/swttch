import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * Pasting into a plain text field in the IDE (#752). On a Wayland desktop the
 * browser's clipboard is empty or old, so the host is asked beside every paste, and
 * its text wins when it differs. A matching or missing answer changes nothing.
 */

const { requestMock, runtime } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  runtime: { jetbrains: true },
}));

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
  getBridge: () => ({ request: requestMock }),
}));
vi.mock('@/config/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/environment')>()),
  isJetBrains: () => runtime.jetbrains,
}));
vi.mock('@/contexts/WorkingDirContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/WorkingDirContext')>()),
  useWorkingDirOrNull: () => ({ workingDirectory: '/proj' }),
}));

import { useHostFieldPaste } from '../useHostFieldPaste';

type Field = HTMLInputElement | HTMLTextAreaElement;

/** The values a field can be taken back to, newest last, as the browser's undo stack holds them. */
let history: { field: Field; value: string }[] = [];
let execCommand: ReturnType<typeof vi.fn>;

/** What the browser does to a field: replace the selection and remember what was there. */
function edit(field: Field, text: string): void {
  history.push({ field, value: field.value });
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + text + field.value.slice(end);
  // Number and email fields tell no selection, and refuse to be given one.
  if (field.selectionStart !== null) field.setSelectionRange(start + text.length, start + text.length);
}

function focusedField(value = '', tag: 'input' | 'textarea' = 'input', type = 'text'): Field {
  const field = document.createElement(tag);
  if (field instanceof HTMLInputElement) field.type = type;
  field.value = value;
  document.body.appendChild(field);
  field.focus();
  if (field.selectionStart !== null) field.setSelectionRange(value.length, value.length);
  return field;
}

/** A paste as the page sees it: the event first, then the browser's own insert. */
async function paste(target: HTMLElement, text: string, options: { browserInserts?: boolean; prevented?: boolean } = {}) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  if (options.prevented) event.preventDefault();
  target.dispatchEvent(event);
  if ((options.browserInserts ?? true) && !event.defaultPrevented && text !== '') {
    edit(target as Field, text);
  }
  await vi.runAllTimersAsync();
}

describe('useHostFieldPaste', () => {
  let unmount: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    runtime.jetbrains = true;
    history = [];
    execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => {
      if (command === 'undo') {
        const last = history.pop();
        if (last) last.field.value = last.value;
        return true;
      }
      edit(document.activeElement as Field, value ?? '');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: execCommand });
  });

  afterEach(() => {
    unmount();
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete (document as { execCommand?: unknown }).execCommand;
  });

  function mount(): void {
    unmount = renderHook(() => useHostFieldPaste()).unmount;
  }

  it('asks the host for the text only, for this project', async () => {
    requestMock.mockResolvedValue({ text: null });
    mount();

    await paste(focusedField(), 'x');

    expect(requestMock).toHaveBeenCalledWith(
      MessageType.GET_CLIPBOARD,
      { workingDir: '/proj', textOnly: true },
      { timeout: 1_500 },
    );
  });

  it('puts the host text in when the browser had nothing to paste', async () => {
    requestMock.mockResolvedValue({ text: 'from outside' });
    mount();
    const field = focusedField('find ');

    await paste(field, '');

    expect(field.value).toBe('find from outside');
    expect(execCommand).not.toHaveBeenCalledWith('undo');
    // The user is waiting on the host for the paste itself, so it gets the longer wait.
    expect(requestMock.mock.calls[0]![2]).toEqual({ timeout: 5_000 });
  });

  it('takes back an old browser text and puts the host text in its place', async () => {
    requestMock.mockResolvedValue({ text: 'new' });
    mount();
    const field = focusedField('a ');

    await paste(field, 'stale');

    expect(execCommand.mock.calls[0]).toEqual(['undo']);
    expect(field.value).toBe('a new');
  });

  it('pastes over what was selected', async () => {
    requestMock.mockResolvedValue({ text: 'NEW' });
    mount();
    const field = focusedField('abcd');
    field.setSelectionRange(1, 3);

    await paste(field, 'stale');

    expect(field.value).toBe('aNEWd');
  });

  it('leaves the browser paste alone when the host holds the same text, line endings aside', async () => {
    requestMock.mockResolvedValue({ text: 'a\r\nb' });
    mount();
    const field = focusedField('', 'textarea');

    await paste(field, 'a\nb');

    expect(field.value).toBe('a\nb');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty answer', () => requestMock.mockResolvedValue({ text: null, image: null })],
    ['a failed read', () => requestMock.mockRejectedValue(new Error('no host'))],
  ])('leaves the browser paste standing on %s', async (_name, answer) => {
    answer();
    mount();
    const field = focusedField();

    await paste(field, 'browser text');

    expect(field.value).toBe('browser text');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('leaves the field alone when the user typed on before the host answered', async () => {
    let resolve: (value: unknown) => void = () => {};
    requestMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount();
    const field = focusedField();

    await paste(field, 'stale');
    field.value += ' typed';
    resolve({ text: 'new' });
    await vi.runAllTimersAsync();

    expect(field.value).toBe('stale typed');
  });

  it('leaves the field alone when the focus has moved elsewhere', async () => {
    let resolve: (value: unknown) => void = () => {};
    requestMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount();
    const field = focusedField();

    await paste(field, '');
    focusedField();
    resolve({ text: 'new' });
    await vi.runAllTimersAsync();

    expect(field.value).toBe('');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('replaces the whole value rather than keeping both texts when there is nothing to undo', async () => {
    requestMock.mockResolvedValue({ text: 'new' });
    mount();
    const field = focusedField('a ');
    execCommand.mockImplementation((command: string, _ui?: boolean, value?: string) => {
      if (command !== 'undo') edit(document.activeElement as Field, value ?? '');
      return true;
    });

    await paste(field, 'stale');

    expect(field.value).toBe('a new');
  });

  it('does not undo when the browser paste changed nothing, so earlier typing survives', async () => {
    requestMock.mockResolvedValue({ text: '7' });
    mount();
    const field = focusedField('4', 'input');

    await paste(field, 'abc', { browserInserts: false });

    expect(execCommand).not.toHaveBeenCalledWith('undo');
    expect(field.value).toBe('47');
  });

  it.each(['search', 'password', 'email', 'url', 'tel', 'number'])('covers a %s input', async (type) => {
    requestMock.mockResolvedValue({ text: '1' });
    mount();

    await paste(focusedField('', 'input', type), '');

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the composer, which is not a field', () => {
      const composer = document.createElement('div');
      composer.setAttribute('contenteditable', 'plaintext-only');
      document.body.appendChild(composer);
      return composer;
    }],
    ['a checkbox', () => focusedCheckbox()],
    ['a read-only field', () => Object.assign(focusedField(), { readOnly: true })],
    ['a disabled field', () => Object.assign(focusedField(), { disabled: true })],
  ])('stays out of %s', async (_name, make) => {
    mount();

    await paste(make(), 'x', { browserInserts: false });

    expect(requestMock).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  function focusedCheckbox(): HTMLInputElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    return box;
  }

  it('stays out of a paste something else has already taken over', async () => {
    mount();

    await paste(focusedField(), 'x', { prevented: true });

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('listens for nothing outside the IDE', async () => {
    runtime.jetbrains = false;
    mount();

    await paste(focusedField(), 'x');

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', async () => {
    mount();
    unmount();

    await paste(focusedField(), 'x');

    expect(requestMock).not.toHaveBeenCalled();
  });
});
