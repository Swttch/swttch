import { parseShortcut, type ShortcutParts } from '@/utils/shortcut';

/**
 * The modifier that means "the platform's primary shortcut key" in a combo
 * string: Command on macOS, Ctrl everywhere else. Every other modifier name is
 * taken literally, so `Ctrl` stays Control on a Mac.
 */
const MOD = 'Mod';

const ARROW_SYMBOLS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * Read a combo such as `Mod+Shift+M` into the parts the rest of the shortcut
 * code speaks, with `Mod` already resolved for the platform.
 *
 * The same spelling as the stored form (`Alt+D`, `Meta+Enter`) is accepted, so
 * a binding the user recorded can be shown without translating it first. A `+`
 * key is written as the last character (`Mod++`).
 */
export function parseCombo(combo: string, mac: boolean): ShortcutParts | null {
  const plusKey = combo.endsWith('++');
  const modifierText = plusKey ? combo.slice(0, -2) : combo;
  const resolved = modifierText
    .split('+')
    .map((segment) => (segment === MOD ? (mac ? 'Meta' : 'Ctrl') : segment))
    .join('+');

  // parseShortcut splits on '+', so a plus key is parsed as a placeholder and
  // put back afterwards.
  const parts = parseShortcut(plusKey ? `${resolved}+x` : resolved);
  if (!parts) return null;
  return plusKey ? { ...parts, key: '+' } : parts;
}

function keyLabel(key: string, mac: boolean): string {
  const arrow = ARROW_SYMBOLS[key];
  if (arrow) return arrow;
  if (key === 'Enter') return mac ? '↩' : '↵';
  if (key === 'Tab') return '⇥';
  if (key === 'Escape') return 'Esc';
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * The key caps for one combination, in the order they are read.
 *
 * macOS gets its symbols in Apple's own order (Control, Option, Shift, Command),
 * the other platforms get words for Ctrl, Alt and Win. Shift, the arrows, Tab and
 * Enter are glyphs on every platform (Enter is the return arrow on macOS and the
 * enter arrow elsewhere).
 */
export function keyCapsOfParts(parts: ShortcutParts, mac: boolean): string[] {
  const caps: string[] = [];
  if (parts.ctrl) caps.push(mac ? '⌃' : 'Ctrl');
  if (parts.alt) caps.push(mac ? '⌥' : 'Alt');
  if (parts.shift) caps.push('⇧');
  // Windows/Linux name the Meta key after the key cap.
  if (parts.meta) caps.push(mac ? '⌘' : 'Win');
  caps.push(keyLabel(parts.key, mac));
  return caps;
}

/**
 * The key caps for a combo string, or an empty list when it cannot be read, which
 * a caller should treat as "nothing to show" rather than draw an empty chip.
 */
export function keyCapsFor(combo: string, mac: boolean): string[] {
  const parts = parseCombo(combo, mac);
  return parts ? keyCapsOfParts(parts, mac) : [];
}
