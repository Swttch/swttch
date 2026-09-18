/**
 * Which keystroke sends the prompt from the composer.
 *
 * `ModEnter` is one mode rather than two, because Ctrl+Enter and Cmd+Enter have
 * always both submitted and only the printed label differs by platform.
 * Splitting it in two would make a file written on Windows stop working on a
 * Mac, for a distinction the user never asked for.
 *
 * Shared because both sides read it: the webview to decide what a keystroke
 * does, the backend to validate what was stored in settings.js.
 */
export enum ComposerSendShortcut {
  Enter = 'enter',
  ModEnter = 'modEnter',
  Custom = 'custom',
}

/**
 * Which keystroke inserts a line break in the composer instead of sending.
 *
 * A setting of its own rather than the leftover of the send setting. Moving
 * "send" onto a modifier leaves an open question that one setting can only
 * answer by guessing: what plain Enter now does (issue #463).
 */
export enum ComposerNewlineShortcut {
  ShiftEnter = 'shiftEnter',
  Enter = 'enter',
  Custom = 'custom',
}

/** Every accepted {@link ComposerSendShortcut} value, for validating storage. */
export const COMPOSER_SEND_SHORTCUTS: readonly string[] = Object.values(ComposerSendShortcut);

/** Every accepted {@link ComposerNewlineShortcut} value. */
export const COMPOSER_NEWLINE_SHORTCUTS: readonly string[] =
  Object.values(ComposerNewlineShortcut);

/** What the composer settings look like once read out of a settings file. */
export interface ComposerShortcutSettings {
  /** Null when the user has never chosen, which hands the answer to the legacy key. */
  composerSendShortcut?: ComposerSendShortcut | string | null;
  composerSendShortcutCustom?: string | null;
  composerNewlineShortcut?: ComposerNewlineShortcut | string | null;
  composerNewlineShortcutCustom?: string | null;
  /** The one setting that used to decide both, kept because users still have it. */
  useCtrlEnterToSend?: boolean | null;
}

/** The pair of modes in effect, with nothing left null. */
export interface ResolvedComposerShortcuts {
  send: ComposerSendShortcut;
  newline: ComposerNewlineShortcut;
}

/**
 * The modes in effect, resolving the two new settings against the old one.
 *
 * Asked in one place by every caller — the settings screen to show what the
 * dropdowns are on, the composer to decide what a keystroke does. Two callers
 * reading the raw keys and falling back on their own is how a screen ends up
 * disagreeing with the behaviour it claims to describe.
 *
 * A null mode is not "no preference to honour": it is the answer the user gave
 * before these keys existed, which `useCtrlEnterToSend` still holds. Reading it
 * here is what keeps an upgrade from silently changing how someone's Enter key
 * behaves.
 */
export function resolveComposerShortcuts(
  settings: ComposerShortcutSettings,
): ResolvedComposerShortcuts {
  const legacyModifierSends = settings.useCtrlEnterToSend === true;

  const storedSend = settings.composerSendShortcut;
  const send = COMPOSER_SEND_SHORTCUTS.includes(storedSend as string)
    ? (storedSend as ComposerSendShortcut)
    : legacyModifierSends
      ? ComposerSendShortcut.ModEnter
      : ComposerSendShortcut.Enter;

  const storedNewline = settings.composerNewlineShortcut;
  const newline = COMPOSER_NEWLINE_SHORTCUTS.includes(storedNewline as string)
    ? (storedNewline as ComposerNewlineShortcut)
    : legacyModifierSends
      ? // With the modifier sending, plain Enter was what broke the line.
        ComposerNewlineShortcut.Enter
      : ComposerNewlineShortcut.ShiftEnter;

  return { send, newline };
}
