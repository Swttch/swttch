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
import {
  displayShortcut,
  formatShortcut,
  matchesShortcut,
  parseShortcut,
  type ShortcutEvent,
} from './shortcut';

/** What the composer should do with a keystroke. */
export enum ComposerKeyAction {
  Send = 'send',
  /**
   * Send, but treat this one message the other way round: queue it if the
   * setting says steer, steer on it if the setting says queue.
   */
  SendInverted = 'send-inverted',
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
  /** Combinations that send while inverting the follow-up behaviour once. */
  sendInverted: string[];
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

  return {
    send: sendBindings,
    sendInverted: sendBindings.map(invertedOf).filter((s): s is string => s !== null),
    newline: newlineBindings,
  };
}

function storedOrNothing(stored: string | null | undefined): string[] {
  return stored ? [stored] : [];
}

/**
 * The send combination with one more modifier on it, which is how a single
 * message asks for the other follow-up behaviour.
 *
 * Derived rather than bound separately, so the pair always reads as one idea:
 * Enter sends and ⌘Enter sends the other way; ⌘Enter sends and ⇧⌘Enter sends the
 * other way. Binding it would also give the user a third key to keep clear of
 * the two they already set.
 *
 * Which modifier to add is decided by what the send key is missing. Ctrl/Cmd
 * first, because Shift+Enter is the newline default and reaching for it here
 * would collide with it on a stock setup. Shift second. A send key that already
 * carries both has nothing left to add, so that configuration simply has no
 * one-off invert — see the null below.
 */
export function invertedOf(stored: string): string | null {
  const parts = parseShortcut(stored);
  if (!parts) return null;
  if (!parts.ctrl && !parts.meta) {
    // Match the platform the label names, so the derived key is the one under
    // the user's hand rather than the one their keyboard does not have.
    return formatShortcut(isMac() ? { ...parts, meta: true } : { ...parts, ctrl: true });
  }
  if (!parts.shift) return formatShortcut({ ...parts, shift: true });
  return null;
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

  // Last of the three, because this is the only binding the user did not choose:
  // it is derived from the send key. A newline key that lands on the same
  // combination keeps it — taking a chosen key away for a derived one would make
  // a setting the user filled in stop working, with nothing on screen to say why.
  if (
    !event.isMobile &&
    bindings.sendInverted.some((stored) => matchesShortcut(normalised, stored))
  ) {
    return ComposerKeyAction.SendInverted;
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
 * How the one-off invert key is written, or empty when there is none.
 *
 * Picks by platform for the same reason {@link sendKeyLabel} does: `modEnter`
 * binds both Ctrl and Cmd, and naming the wrong one tells a Mac user to press a
 * key their keyboard does not have.
 */
export function invertKeyLabel(settings: ComposerShortcutSettings): string {
  const { sendInverted, newline } = composerBindings(settings);
  // A combination the newline key already claims is not ours to name: the
  // newline key wins (see composerKeyAction), so promising it here would be a
  // description of something that does not happen.
  const available = sendInverted.filter((stored) => !newline.includes(stored));
  if (available.length === 0) return '';
  const wanted = isMac() ? 'Meta+' : 'Ctrl+';
  const preferred = available.find((stored) => stored.includes(wanted)) ?? available[0];
  return displayShortcut(preferred);
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
