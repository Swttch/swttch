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

/** Read the parts out of a keyboard event. */
export function shortcutPartsFromEvent(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
}): ShortcutParts {
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key: normaliseKey(e.key),
  };
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

/** Does this event match the stored shortcut? */
export function matchesShortcut(
  e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; key: string },
  stored: string | null | undefined,
): boolean {
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
