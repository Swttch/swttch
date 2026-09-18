/**
 * What a keystroke does in the composer, decided in one place.
 *
 * The settings screen and the composer both depend on this module: the screen
 * to show which mode is on, the composer to act on it. Deciding it twice is how
 * a screen ends up describing behaviour the code no longer has.
 */

import {
  ComposerSendShortcut,
  ComposerNewlineShortcut,
  resolveComposerShortcuts,
  type ComposerShortcutSettings,
} from '@/shared';
import { isMac } from '@/config/environment';
import { displayShortcut, matchesShortcut, type ShortcutEvent } from './shortcut';

/** What the composer should do with a keystroke. */
export enum ComposerKeyAction {
  Send = 'send',
  Newline = 'newline',
  /** Nothing of ours — leave the keystroke to the editor. */
  None = 'none',
}

/** The combinations in effect, in the stored form {@link matchesShortcut} reads. */
export interface ComposerBindings {
  /**
   * Combinations that send. More than one for `modEnter`, where Ctrl+Enter and
   * Cmd+Enter have always both submitted regardless of platform.
   */
  send: string[];
  /** Combinations that insert a line break. */
  newline: string[];
}

/** The keyboard-event fields this module reads. */
export interface ComposerKeyEvent extends ShortcutEvent {
  /**
   * The legacy numeric code, still consulted for Enter alone: under JCEF a
   * non-English layout can report Enter with a `key` that is not 'Enter' while
   * `keyCode` is still 13 (issue #215).
   */
  keyCode?: number;
  /** Our composition truth OR the native flag — see useIMEComposition. */
  isComposing: boolean;
  /** A touch keyboard, where Enter has to type a line and cannot send. */
  isMobile: boolean;
}

/** The combination `modEnter` binds, both modifiers, in stored form. */
const MOD_ENTER_BINDINGS = ['Ctrl+Enter', 'Meta+Enter'];

/**
 * The combinations each mode binds.
 *
 * A custom mode with nothing recorded yet binds nothing rather than falling back
 * to a built-in combination: a silent fallback would leave the row showing
 * "Custom" while some other key did the work.
 */
export function composerBindings(settings: ComposerShortcutSettings): ComposerBindings {
  const { send, newline } = resolveComposerShortcuts(settings);

  const sendBindings =
    send === ComposerSendShortcut.Enter
      ? ['Enter']
      : send === ComposerSendShortcut.ModEnter
        ? MOD_ENTER_BINDINGS
        : storedOrNothing(settings.composerSendShortcutCustom);

  const newlineBindings =
    newline === ComposerNewlineShortcut.ShiftEnter
      ? ['Shift+Enter']
      : newline === ComposerNewlineShortcut.Enter
        ? ['Enter']
        : storedOrNothing(settings.composerNewlineShortcutCustom);

  return { send: sendBindings, newline: newlineBindings };
}

function storedOrNothing(stored: string | null | undefined): string[] {
  return stored ? [stored] : [];
}

/**
 * What this keystroke should do.
 *
 * Send is checked before newline so that a pair of settings which somehow name
 * the same combination still sends, which is the action the user cannot reach
 * any other way — the line break is also on the Send button's neighbours, the
 * prompt is not.
 */
export function composerKeyAction(
  event: ComposerKeyEvent,
  bindings: ComposerBindings,
): ComposerKeyAction {
  // A composition owns its keystrokes: Enter is how the IME commits a candidate,
  // and neither sending nor breaking the line is ours to do until it is done.
  if (event.isComposing) return ComposerKeyAction.None;

  const normalised = withEnterFromKeyCode(event);

  // A touch keyboard has no modifiers to reach for, so Enter has to type a line
  // there whatever it is bound to. Skipping the send check rather than returning
  // early lets an explicitly bound newline still match first.
  if (!event.isMobile && bindings.send.some((stored) => matchesShortcut(normalised, stored))) {
    return ComposerKeyAction.Send;
  }

  if (bindings.newline.some((stored) => matchesShortcut(normalised, stored))) {
    return ComposerKeyAction.Newline;
  }

  // An Enter that is bound to neither still breaks the line. Leaving it to do
  // nothing is the one outcome no user wants from an Enter key, and under JCEF
  // "nothing" is exactly what happens: the editor swallows the press as an IME
  // commit and no line break appears (issue #215).
  if (isEnter(normalised)) return ComposerKeyAction.Newline;

  return ComposerKeyAction.None;
}

/** Enter reported through the numeric code, put back under its own name. */
function withEnterFromKeyCode(event: ComposerKeyEvent): ComposerKeyEvent {
  if (event.key === 'Enter' || event.keyCode !== 13) return event;
  return { ...event, key: 'Enter' };
}

function isEnter(event: ComposerKeyEvent): boolean {
  return event.key === 'Enter' || event.keyCode === 13;
}

/**
 * The combination both settings would claim, or null when they claim none.
 *
 * Asked before a change is saved rather than after. A composer whose send and
 * newline keys are the same combination has lost one of the two actions
 * outright, and the setting that took it away looks applied — the row shows the
 * value the user picked while the composer does something else with it.
 */
export function conflictingBinding(settings: ComposerShortcutSettings): string | null {
  const { send, newline } = composerBindings(settings);
  return send.find((stored) => newline.includes(stored)) ?? null;
}

/**
 * How the send key is written in the composer placeholder.
 *
 * Both Ctrl and Cmd submit on either platform, so the label names the one that
 * platform's users reach for rather than hardcoding a single symbol: a Windows
 * user who reads "⌘Enter" has no such key.
 */
export function sendKeyLabel(settings: ComposerShortcutSettings): string {
  const { send } = resolveComposerShortcuts(settings);
  if (send === ComposerSendShortcut.Enter) return 'Enter';
  if (send === ComposerSendShortcut.ModEnter) {
    return displayShortcut(isMac() ? 'Meta+Enter' : 'Ctrl+Enter');
  }
  // Nothing recorded yet: the placeholder says Enter because that is what an
  // unbound composer still does (see composerKeyAction).
  return displayShortcut(settings.composerSendShortcutCustom) || 'Enter';
}
