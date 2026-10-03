import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';
import { useEditHistoryCommands } from '../useEditHistoryCommands';

type BridgeHandler = (msg: { type: string; payload: Record<string, string | number | boolean | null> }) => void;

const handlers = new Map<string, Set<BridgeHandler>>();
const mockBridge = {
  subscribe: vi.fn((type: string, handler: BridgeHandler) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
    return () => {
      handlers.get(type)?.delete(handler);
    };
  }),
};

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
  getBridge: () => mockBridge,
}));

/** What the backend delivers when the IDE claims an Undo or Redo keystroke. */
function deliver(payload: Record<string, string | number | boolean | null>) {
  handlers.get(MessageType.EDIT_HISTORY_COMMAND_REQUESTED)?.forEach((h) =>
    h({ type: MessageType.EDIT_HISTORY_COMMAND_REQUESTED, payload }),
  );
}

/**
 * The IDE's keymap runs its own Undo/Redo before the page sees the keystroke,
 * so the IDE claims it and names the command; the webview applies it to the
 * focused text field (issue #495). jsdom has no execCommand, so it is stubbed
 * and the call itself is what is asserted.
 */
describe('useEditHistoryCommands', () => {
  const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
  const execCommand = vi.fn((_command: string) => true);
  let unmount: () => void;
  const created: HTMLElement[] = [];

  function attach<T extends HTMLElement>(element: T): T {
    document.body.appendChild(element);
    created.push(element);
    return element;
  }

  beforeEach(() => {
    handlers.clear();
    execCommand.mockClear();
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: execCommand });
    unmount = renderHook(() => useEditHistoryCommands()).unmount;
  });

  afterEach(() => {
    unmount();
    created.splice(0).forEach((element) => element.remove());
    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand);
    } else {
      delete (document as { execCommand?: Document['execCommand'] }).execCommand;
    }
  });

  it('undoes in a focused input', () => {
    attach(document.createElement('input')).focus();

    deliver({ command: 'undo' });

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('undo');
  });

  it('redoes in a focused textarea', () => {
    attach(document.createElement('textarea')).focus();

    deliver({ command: 'redo' });

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('redo');
  });

  it('applies to the focused contentEditable composer', () => {
    const composer = attach(document.createElement('div'));
    composer.setAttribute('contenteditable', 'plaintext-only');
    composer.tabIndex = 0;
    composer.focus();

    deliver({ command: 'undo' });
    deliver({ command: 'redo' });

    expect(execCommand.mock.calls.map(([command]) => command)).toEqual(['undo', 'redo']);
  });

  it('is ignored when nothing editable has focus', () => {
    const button = attach(document.createElement('button'));
    button.focus();
    expect(document.activeElement).toBe(button);

    deliver({ command: 'undo' });

    (document.activeElement as HTMLElement | null)?.blur();
    deliver({ command: 'redo' });

    expect(execCommand).not.toHaveBeenCalled();
  });

  it('ignores a payload that names no command', () => {
    attach(document.createElement('input')).focus();

    deliver({ command: 'cut' });
    deliver({ command: 'Undo' });
    deliver({ command: 1 });
    deliver({ command: null });
    deliver({});

    expect(execCommand).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    attach(document.createElement('input')).focus();
    unmount();

    deliver({ command: 'undo' });

    expect(execCommand).not.toHaveBeenCalled();
  });
});
