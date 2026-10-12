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

/**
 * What happens to a message sent while a turn is already running.
 *
 * `Steer` is the plain stdin send. The message goes straight to the CLI, which
 * picks it up at the next point it accepts input, exactly as when the same
 * message is typed into the terminal CLI. Nothing is interrupted.
 *
 * `Queue` holds the message here instead: the backend keeps it and releases one
 * per finished turn, so it reaches the CLI only after the current turn ends.
 */
export enum FollowUpBehavior {
  /** Hand it to the running turn now. The default, as in the terminal CLI. */
  Steer = 'steer',
  /** Hold it until the current turn finishes on its own. Opt-in. */
  Queue = 'queue',
}

/** Every accepted {@link FollowUpBehavior} value. */
export const FOLLOW_UP_BEHAVIORS: readonly string[] = Object.values(FollowUpBehavior);

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
  /** Null until the user chooses, which reads as {@link FollowUpBehavior.Steer}. */
  composerFollowUpBehavior?: FollowUpBehavior | string | null;
}

/**
 * What a mid-turn message does, with nothing left null.
 *
 * Steer is the default because it is what the terminal CLI does and what this
 * app did before the setting offered a choice. Defaulting to queue made a
 * message typed mid-turn wait for the turn to end for everyone who never opened
 * the setting (#547). Holding a message back is something a user asks for.
 */
export function resolveFollowUpBehavior(settings: ComposerShortcutSettings): FollowUpBehavior {
  const stored = settings.composerFollowUpBehavior;
  return FOLLOW_UP_BEHAVIORS.includes(stored as string)
    ? (stored as FollowUpBehavior)
    : FollowUpBehavior.Steer;
}

/** The other one. Used for the keystroke that inverts the setting once. */
export function invertFollowUpBehavior(behavior: FollowUpBehavior): FollowUpBehavior {
  return behavior === FollowUpBehavior.Queue ? FollowUpBehavior.Steer : FollowUpBehavior.Queue;
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
