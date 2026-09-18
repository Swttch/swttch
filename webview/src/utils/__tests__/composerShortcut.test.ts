/**
 * What a keystroke does in the composer.
 *
 * Tested through the pure decision rather than through ChatInput, whose context
 * tree (focus, session, stream, Claude settings) would be ~50 lines of setup
 * before a single key could be pressed. This module is the one place the
 * send/newline branching lives, so covering it directly covers the behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  composerBindings,
  composerKeyAction,
  conflictingBinding,
  sendKeyLabel,
  ComposerKeyAction,
  type ComposerKeyEvent,
} from '../composerShortcut';
import { ComposerSendShortcut, ComposerNewlineShortcut } from '@/shared';

vi.mock('@/config/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/environment')>()),
  isMac: () => mockIsMac,
}));

let mockIsMac = false;

const press = (overrides: Partial<ComposerKeyEvent> = {}): ComposerKeyEvent => ({
  key: 'Enter',
  keyCode: 13,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  isMobile: false,
  ...overrides,
});

/** What the composer does with this keystroke under these settings. */
const actionUnder = (settings: Parameters<typeof composerBindings>[0], event: ComposerKeyEvent) =>
  composerKeyAction(event, composerBindings(settings));

beforeEach(() => {
  mockIsMac = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defaults — nothing chosen, no legacy setting', () => {
  const settings = {};

  it('Enter sends', () => {
    expect(actionUnder(settings, press())).toBe(ComposerKeyAction.Send);
  });

  it('Shift+Enter breaks the line', () => {
    expect(actionUnder(settings, press({ shiftKey: true }))).toBe(ComposerKeyAction.Newline);
  });

  it('a letter is none of our business', () => {
    expect(actionUnder(settings, press({ key: 'a', keyCode: 65 }))).toBe(ComposerKeyAction.None);
  });
});

describe('the legacy useCtrlEnterToSend still decides when nothing newer was chosen', () => {
  const legacy = { useCtrlEnterToSend: true };

  it('Ctrl+Enter sends', () => {
    expect(actionUnder(legacy, press({ ctrlKey: true }))).toBe(ComposerKeyAction.Send);
  });

  it('Cmd+Enter sends too, on either platform', () => {
    expect(actionUnder(legacy, press({ metaKey: true }))).toBe(ComposerKeyAction.Send);
  });

  it('plain Enter breaks the line instead of sending', () => {
    expect(actionUnder(legacy, press())).toBe(ComposerKeyAction.Newline);
  });

  it('is overruled the moment the user chooses explicitly', () => {
    const chosen = { useCtrlEnterToSend: true, composerSendShortcut: ComposerSendShortcut.Enter };
    expect(actionUnder(chosen, press())).toBe(ComposerKeyAction.Send);
    expect(actionUnder(chosen, press({ ctrlKey: true }))).toBe(ComposerKeyAction.Newline);
  });
});

describe('custom combinations', () => {
  const settings = {
    composerSendShortcut: ComposerSendShortcut.Custom,
    composerSendShortcutCustom: 'Alt+Enter',
    composerNewlineShortcut: ComposerNewlineShortcut.Custom,
    composerNewlineShortcutCustom: 'Shift+Enter',
  };

  it('sends on the recorded combination', () => {
    expect(actionUnder(settings, press({ altKey: true }))).toBe(ComposerKeyAction.Send);
  });

  it('breaks the line on the recorded newline combination', () => {
    expect(actionUnder(settings, press({ shiftKey: true }))).toBe(ComposerKeyAction.Newline);
  });

  it('does not send on a near miss', () => {
    expect(actionUnder(settings, press({ altKey: true, shiftKey: true }))).not.toBe(
      ComposerKeyAction.Send,
    );
  });

  it('with nothing recorded yet, sends on nothing rather than falling back', () => {
    // Falling back to Ctrl+Enter would leave the row reading "Custom" while some
    // combination the user never chose did the sending.
    const empty = { composerSendShortcut: ComposerSendShortcut.Custom };
    expect(actionUnder(empty, press({ ctrlKey: true }))).not.toBe(ComposerKeyAction.Send);
    expect(actionUnder(empty, press())).not.toBe(ComposerKeyAction.Send);
    // It is still an Enter, so it breaks the line rather than doing nothing.
    expect(actionUnder(empty, press())).toBe(ComposerKeyAction.Newline);
  });
});

describe('an Enter bound to neither still breaks the line', () => {
  // Never nothing: under JCEF a plain Enter the code ignores is swallowed as an
  // IME commit and no line break appears at all (issue #215).
  const settings = {
    composerSendShortcut: ComposerSendShortcut.ModEnter,
    composerNewlineShortcut: ComposerNewlineShortcut.Custom,
    composerNewlineShortcutCustom: 'Alt+Enter',
  };

  it('plain Enter', () => {
    expect(actionUnder(settings, press())).toBe(ComposerKeyAction.Newline);
  });

  it('Shift+Enter, which nothing here claims', () => {
    expect(actionUnder(settings, press({ shiftKey: true }))).toBe(ComposerKeyAction.Newline);
  });
});

describe('guards', () => {
  it('a composition owns its own keystrokes', () => {
    expect(actionUnder({}, press({ isComposing: true }))).toBe(ComposerKeyAction.None);
  });

  it('Enter types a line on a touch keyboard instead of sending', () => {
    expect(actionUnder({}, press({ isMobile: true }))).toBe(ComposerKeyAction.Newline);
  });

  it('Enter reported only by keyCode 13 is still Enter (issue #215)', () => {
    expect(actionUnder({}, press({ key: 'Process', keyCode: 13 }))).toBe(ComposerKeyAction.Send);
  });

  it('Enter reported without a keyCode is still Enter', () => {
    expect(actionUnder({}, press({ key: 'Enter', keyCode: 0 }))).toBe(ComposerKeyAction.Send);
  });
});

describe('conflictingBinding', () => {
  it('finds nothing in the defaults', () => {
    expect(conflictingBinding({})).toBeNull();
  });

  it('catches both keys landing on Enter', () => {
    expect(
      conflictingBinding({
        composerSendShortcut: ComposerSendShortcut.Enter,
        composerNewlineShortcut: ComposerNewlineShortcut.Enter,
      }),
    ).toBe('Enter');
  });

  it('catches a custom newline that collides with one half of modEnter', () => {
    expect(
      conflictingBinding({
        composerSendShortcut: ComposerSendShortcut.ModEnter,
        composerNewlineShortcut: ComposerNewlineShortcut.Custom,
        composerNewlineShortcutCustom: 'Meta+Enter',
      }),
    ).toBe('Meta+Enter');
  });
});

describe('sendKeyLabel', () => {
  it('names Ctrl on Windows and Cmd on macOS for the same setting', () => {
    const settings = { composerSendShortcut: ComposerSendShortcut.ModEnter };
    expect(sendKeyLabel(settings)).toBe('Ctrl+Enter');
    mockIsMac = true;
    expect(sendKeyLabel(settings)).toBe('⌘Enter');
  });

  it('shows the recorded combination when the mode is custom', () => {
    expect(
      sendKeyLabel({
        composerSendShortcut: ComposerSendShortcut.Custom,
        composerSendShortcutCustom: 'Alt+Enter',
      }),
    ).toBe('Alt+Enter');
  });

  it('falls back to Enter when custom has nothing recorded, matching what the composer does', () => {
    expect(sendKeyLabel({ composerSendShortcut: ComposerSendShortcut.Custom })).toBe('Enter');
  });
});
