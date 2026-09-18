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
  invertedOf,
  invertKeyLabel,
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
    // Plain Enter sends, which is the whole point: the legacy key would have made
    // it break the line.
    expect(actionUnder(chosen, press())).toBe(ComposerKeyAction.Send);
    // Ctrl+Enter is no longer the legacy send key. It is the key derived from
    // this send shortcut, so it sends with the follow-up behaviour inverted.
    expect(actionUnder(chosen, press({ ctrlKey: true }))).toBe(ComposerKeyAction.SendInverted);
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

describe('the key that inverts the follow-up behaviour once', () => {
  it('adds the platform modifier when the send key has none', () => {
    expect(invertedOf('Enter')).toBe('Ctrl+Enter');
    mockIsMac = true;
    expect(invertedOf('Enter')).toBe('Meta+Enter');
  });

  it('adds Shift when the send key already carries a modifier', () => {
    // Not Shift first: Shift+Enter is the newline default, so reaching for it
    // here would collide with it on a stock setup.
    expect(invertedOf('Meta+Enter')).toBe('Shift+Meta+Enter');
    expect(invertedOf('Ctrl+Enter')).toBe('Ctrl+Shift+Enter');
  });

  it('has nothing to add when the send key carries both', () => {
    expect(invertedOf('Ctrl+Shift+Enter')).toBeNull();
  });

  it('is derived for every send binding, so either modifier works for modEnter', () => {
    const bindings = composerBindings({ composerSendShortcut: ComposerSendShortcut.ModEnter });
    expect(bindings.send).toEqual(['Ctrl+Enter', 'Meta+Enter']);
    expect(bindings.sendInverted).toEqual(['Ctrl+Shift+Enter', 'Shift+Meta+Enter']);
  });

  it('sends with the behaviour inverted rather than doing nothing', () => {
    // Default send is Enter, so Ctrl+Enter is the derived invert on Windows.
    expect(actionUnder({}, press({ ctrlKey: true }))).toBe(ComposerKeyAction.SendInverted);
  });

  it('never steals a keystroke the send key itself claims', () => {
    // With modEnter sending, Ctrl+Enter IS the send key and must stay a send.
    const modEnter = { composerSendShortcut: ComposerSendShortcut.ModEnter };
    expect(actionUnder(modEnter, press({ ctrlKey: true }))).toBe(ComposerKeyAction.Send);
    expect(actionUnder(modEnter, press({ ctrlKey: true, shiftKey: true }))).toBe(
      ComposerKeyAction.SendInverted,
    );
  });

  it('types a line on a touch keyboard, where there are no modifiers to press', () => {
    expect(actionUnder({}, press({ ctrlKey: true, isMobile: true }))).toBe(
      ComposerKeyAction.Newline,
    );
  });
});

describe('invertKeyLabel', () => {
  it('names the modifier this platform actually has', () => {
    // modEnter binds Ctrl AND Cmd, so the label has to choose. Naming Ctrl to a
    // Mac user would point at a key that does not send here.
    const settings = { composerSendShortcut: ComposerSendShortcut.ModEnter };
    expect(invertKeyLabel(settings)).toBe('Ctrl+Shift+Enter');
    mockIsMac = true;
    expect(invertKeyLabel(settings)).toBe('⇧⌘Enter');
  });

  it('is empty when the send key leaves no modifier to add', () => {
    expect(
      invertKeyLabel({
        composerSendShortcut: ComposerSendShortcut.Custom,
        composerSendShortcutCustom: 'Ctrl+Shift+Enter',
      }),
    ).toBe('');
  });
});

describe('a chosen newline key beats the derived invert key', () => {
  // Send on Enter derives Ctrl+Enter as the invert, and this user has put their
  // newline key on exactly that. The one they chose has to win: a derived key
  // taking it would make a setting they filled in stop working silently.
  const collides = {
    composerSendShortcut: ComposerSendShortcut.Enter,
    composerNewlineShortcut: ComposerNewlineShortcut.Custom,
    composerNewlineShortcutCustom: 'Ctrl+Enter',
  };

  it('Ctrl+Enter still breaks the line', () => {
    expect(actionUnder(collides, press({ ctrlKey: true }))).toBe(ComposerKeyAction.Newline);
  });

  it('and the row stops naming a shortcut it cannot deliver', () => {
    expect(invertKeyLabel(collides)).toBe('');
  });

  it('while an uncontested derived key is still named', () => {
    expect(invertKeyLabel({ composerSendShortcut: ComposerSendShortcut.Enter })).toBe('Ctrl+Enter');
  });
});
