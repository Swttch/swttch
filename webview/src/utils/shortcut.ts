/**
 * Keyboard shortcuts the user can rebind.
 *
 * One canonical string form is stored and compared ("Alt+D", "Meta+Shift+K"):
 * modifiers in a fixed order, then the key. Storing the raw event would freeze
 * in details that differ between platforms and layouts; storing a display
 * string ("⌥D") would make the stored value depend on who last looked at it.
 */

import { isMac } from '@/config/environment';

export interface ShortcutParts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** The non-modifier key, already normalised ('d', 'Enter', 'F5'). */
  key: string;
}

/**
 * The parts of a keyboard event a shortcut reads.
 *
 * `code` is optional so callers can pass a plain object (and so synthetic
 * events without it still work); when present it wins over `key`. See
 * {@link keyOfEvent}.
 */
export interface ShortcutEvent {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}

/** Read the parts out of a keyboard event. */
export function shortcutPartsFromEvent(e: ShortcutEvent): ShortcutParts {
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key: keyOfEvent(e),
  };
}

/**
 * Which key the binding is about, preferring the physical key over the
 * character it produced.
 *
 * `key` is what the layout and input method decided the press means, so it
 * moves with them: with a Korean IME active, Ctrl+A arrives as 'ㅁ' while the
 * key under the finger is still A (issue #315). Binding the character stored
 * the IME's output, and the binding then stopped matching the moment the input
 * mode changed.
 *
 * `code` names the physical key ('KeyA', 'Digit1') and does not move, so it is
 * used whenever it describes one. It is deliberately NOT used for keys whose
 * identity is their meaning rather than their position — Enter, the arrows, the
 * function keys — where `key` already says the same thing on every layout and
 * reads better in storage.
 *
 * Falls back to `key` when `code` is absent, which is what synthetic events and
 * older browsers report.
 */
export function keyOfEvent(e: { key: string; code?: string }): string {
  const fromCode = physicalKey(e.code);
  return fromCode ?? normaliseKey(e.key);
}

/**
 * The letter or digit a `code` refers to, or null when it is not one.
 *
 * Only the shapes whose character is fixed by position are unwrapped, so the
 * stored form stays the letter the user pressed ('Alt+D') rather than the raw
 * code ('Alt+KeyD') — existing stored shortcuts keep parsing unchanged.
 */
function physicalKey(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  return null;
}

/**
 * Normalise the key so the same physical press always compares equal.
 *
 * Single characters are lowercased, because Shift and some layouts change the
 * reported character ('D', '∂' on macOS with Option held) while the binding is
 * about the key itself. Named keys ('Enter', 'ArrowUp') are left alone.
 */
function normaliseKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Is this key press only a modifier, with no actual key yet? */
export function isModifierOnly(key: string): boolean {
  return ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'OS'].includes(key);
}

/** The stored form: "Alt+D", "Meta+Shift+K". */
export function formatShortcut(parts: ShortcutParts): string {
  const mods: string[] = [];
  if (parts.ctrl) mods.push('Ctrl');
  if (parts.alt) mods.push('Alt');
  if (parts.shift) mods.push('Shift');
  if (parts.meta) mods.push('Meta');
  const key = parts.key.length === 1 ? parts.key.toUpperCase() : parts.key;
  return [...mods, key].join('+');
}

/** Parse the stored form back, or null when it is not a shortcut we can use. */
export function parseShortcut(stored: string | null | undefined): ShortcutParts | null {
  if (!stored) return null;
  const segments = stored.split('+').filter(Boolean);
  if (segments.length === 0) return null;

  const parts: ShortcutParts = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (const segment of segments) {
    switch (segment) {
      case 'Ctrl':
        parts.ctrl = true;
        break;
      case 'Alt':
        parts.alt = true;
        break;
      case 'Shift':
        parts.shift = true;
        break;
      case 'Meta':
        parts.meta = true;
        break;
      default:
        // Two non-modifier segments is not a combination we can match.
        if (parts.key) return null;
        parts.key = normaliseKey(segment);
    }
  }
  return parts.key ? parts : null;
}

/**
 * Should this event fire a shortcut that toggles something?
 *
 * Holding a key makes the OS repeat `keydown` many times a second. For a
 * toggle that means flipping back and forth — voice input visibly flickered
 * between recording and stopped while the key was held. Only the first event of
 * a press counts as the user having pressed it.
 *
 * Separate from {@link matchesShortcut} because an action that is not a toggle
 * (scrolling, say) may legitimately want to run on every repeat.
 */
export function shouldToggleOnShortcut(
  e: ShortcutEvent & { repeat?: boolean },
  stored: string | null | undefined,
): boolean {
  return !e.repeat && matchesShortcut(e, stored);
}

/** Does this event match the stored shortcut? */
export function matchesShortcut(e: ShortcutEvent, stored: string | null | undefined): boolean {
  const want = parseShortcut(stored);
  if (!want) return false;
  const got = shortcutPartsFromEvent(e);
  return (
    got.ctrl === want.ctrl &&
    got.alt === want.alt &&
    got.shift === want.shift &&
    got.meta === want.meta &&
    got.key === want.key
  );
}

/**
 * Is this combination safe to bind inside a text input?
 *
 * A bare key, or one with only Shift, is a character the user is trying to
 * type — binding it would make the composer unusable. At least one of
 * Ctrl/Alt/Meta is required.
 */
export function isBindableShortcut(parts: ShortcutParts): boolean {
  if (!parts.key || isModifierOnly(parts.key)) return false;
  return parts.ctrl || parts.alt || parts.meta;
}

/**
 * How the shortcut is shown: macOS uses its symbols, everything else spells the
 * modifiers out. Purely for display — never stored or compared.
 */
export function displayShortcut(stored: string | null | undefined): string {
  const parts = parseShortcut(stored);
  if (!parts) return '';

  const key = parts.key.length === 1 ? parts.key.toUpperCase() : parts.key;
  if (isMac()) {
    // Apple's own order: Control, Option, Shift, Command.
    return (
      (parts.ctrl ? '⌃' : '') +
      (parts.alt ? '⌥' : '') +
      (parts.shift ? '⇧' : '') +
      (parts.meta ? '⌘' : '') +
      key
    );
  }
  const mods: string[] = [];
  if (parts.ctrl) mods.push('Ctrl');
  if (parts.alt) mods.push('Alt');
  if (parts.shift) mods.push('Shift');
  // Windows/Linux name the Meta key after the key cap.
  if (parts.meta) mods.push('Win');
  return [...mods, key].join('+');
}
