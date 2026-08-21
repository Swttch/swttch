import { describe, it, expect, vi } from 'vitest';
import {
  formatShortcut,
  parseShortcut,
  matchesShortcut,
  shouldToggleOnShortcut,
  isBindableShortcut,
  shortcutPartsFromEvent,
  isModifierOnly,
  displayShortcut,
} from '../shortcut';

vi.mock('@/config/environment', () => ({ isMac: () => mockIsMac }));
let mockIsMac = false;

/**
 * A keyboard event, with only the fields a shortcut cares about.
 *
 * `code` defaults to the physical key that types `key` on a US layout, which is
 * what an unmodified Latin press reports. Tests that care about the two
 * disagreeing (an IME, a non-US layout) pass `code` explicitly.
 */
function press(
  key: string,
  mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {},
  code?: string,
) {
  return {
    key,
    code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
  };
}

describe('formatShortcut / parseShortcut', () => {
  it('round-trips a combination', () => {
    const parts = shortcutPartsFromEvent(press('d', { alt: true }));
    const stored = formatShortcut(parts);
    expect(stored).toBe('Alt+D');
    expect(parseShortcut(stored)).toEqual(parts);
  });

  it('orders modifiers the same way regardless of press order', () => {
    // Otherwise the same combination could be stored two ways and compare unequal.
    const a = formatShortcut(shortcutPartsFromEvent(press('k', { meta: true, shift: true })));
    const b = formatShortcut(shortcutPartsFromEvent(press('k', { shift: true, meta: true })));
    expect(a).toBe(b);
    expect(a).toBe('Shift+Meta+K');
  });

  it('rejects stored values that are not a usable shortcut', () => {
    expect(parseShortcut('')).toBeNull();
    expect(parseShortcut(null)).toBeNull();
    expect(parseShortcut('Alt')).toBeNull(); // modifier with no key
    expect(parseShortcut('Alt+D+K')).toBeNull(); // two keys
  });
});

/**
 * Issue #315: with a Korean IME active, Ctrl+A arrives as key="ㅁ" while
 * code stays "KeyA". Recording stored the character, so the binding was saved
 * as the IME's output and stopped matching once the layout changed.
 *
 * Measured in JCEF on macOS (WebStorm sandbox), Korean input source:
 *   DOWN key="ㅁ" code=KeyA [CTRL]     ← Ctrl+A
 *   DOWN key="a"  code=KeyA [ALT]      ← Option+A
 */
describe('layout-independent binding (issue #315)', () => {
  const ctrlAKorean = press('ㅁ', { ctrl: true }, 'KeyA');
  const ctrlALatin = press('a', { ctrl: true }, 'KeyA');

  it('stores the physical key, not the character the IME produced', () => {
    expect(formatShortcut(shortcutPartsFromEvent(ctrlAKorean))).toBe('Ctrl+A');
  });

  it('stores the same value whether or not the IME is active', () => {
    const withIme = formatShortcut(shortcutPartsFromEvent(ctrlAKorean));
    const withoutIme = formatShortcut(shortcutPartsFromEvent(ctrlALatin));
    expect(withIme).toBe(withoutIme);
  });

  it('matches the binding with the IME on and off', () => {
    // The whole point: bind it in one input mode, use it in the other.
    expect(matchesShortcut(ctrlAKorean, 'Ctrl+A')).toBe(true);
    expect(matchesShortcut(ctrlALatin, 'Ctrl+A')).toBe(true);
  });

  it('accepts a Ctrl combination the IME rewrote', () => {
    // It was never rejected outright, but guard it: the recorder must not treat
    // 'ㅁ' as a bare character press.
    expect(isBindableShortcut(shortcutPartsFromEvent(ctrlAKorean))).toBe(true);
  });

  it('displays the physical key rather than the IME character', () => {
    mockIsMac = true;
    expect(displayShortcut(formatShortcut(shortcutPartsFromEvent(ctrlAKorean)))).toBe('⌃A');
    mockIsMac = false;
  });
});

describe('matchesShortcut', () => {
  it('matches the bound combination', () => {
    expect(matchesShortcut(press('d', { alt: true }), 'Alt+D')).toBe(true);
  });

  it('ignores the character the layout produced', () => {
    // macOS reports Option+D as '∂'. Matching on the character would mean the
    // binding silently stops working the moment a modifier changes it.
    expect(matchesShortcut(press('D', { alt: true }), 'Alt+D')).toBe(true);
  });

  it('does not match when a modifier differs', () => {
    expect(matchesShortcut(press('d', { meta: true }), 'Alt+D')).toBe(false);
    expect(matchesShortcut(press('d', { alt: true, shift: true }), 'Alt+D')).toBe(false);
    expect(matchesShortcut(press('d'), 'Alt+D')).toBe(false);
  });

  it('does not match a different key', () => {
    expect(matchesShortcut(press('k', { alt: true }), 'Alt+D')).toBe(false);
  });

  it('matches nothing when no shortcut is bound', () => {
    expect(matchesShortcut(press('d', { alt: true }), null)).toBe(false);
  });
});

describe('values stored by earlier versions', () => {
  // Shortcuts already saved to settings must keep working across the upgrade —
  // silently unbinding someone's voice key is worse than the bug being fixed.
  it('still matches a shortcut stored before the change', () => {
    expect(matchesShortcut(press('d', { alt: true }), 'Alt+D')).toBe(true);
  });

  it('reads the default binding', () => {
    expect(parseShortcut('Alt+D')).not.toBeNull();
  });

  it('matches a stored letter pressed under an IME', () => {
    // 'Alt+D' was stored before the fix; the user now types in Korean.
    expect(matchesShortcut(press('ㅇ', { alt: true }, 'KeyD'), 'Alt+D')).toBe(true);
  });

  it('still displays a shortcut stored before the change', () => {
    mockIsMac = false;
    expect(displayShortcut('Alt+D')).toBe('Alt+D');
  });
});

describe('shouldToggleOnShortcut', () => {
  it('fires on the first press', () => {
    expect(shouldToggleOnShortcut({ ...press('d', { alt: true }), repeat: false }, 'Alt+D')).toBe(true);
  });

  it('ignores the repeats a held key produces', () => {
    // Holding the key makes the OS repeat keydown many times a second. Toggling
    // on each one flipped voice input between recording and stopped so fast it
    // visibly flickered.
    expect(shouldToggleOnShortcut({ ...press('d', { alt: true }), repeat: true }, 'Alt+D')).toBe(false);
  });

  it('counts one toggle for a press held down', () => {
    // One press, then a burst of repeats: exactly one toggle.
    const events = [
      { ...press('d', { alt: true }), repeat: false },
      ...Array.from({ length: 20 }, () => ({ ...press('d', { alt: true }), repeat: true })),
    ];
    const fired = events.filter((e) => shouldToggleOnShortcut(e, 'Alt+D')).length;
    expect(fired).toBe(1);
  });

  it('still ignores a key that is not the shortcut', () => {
    expect(shouldToggleOnShortcut({ ...press('k', { alt: true }), repeat: false }, 'Alt+D')).toBe(false);
  });
});

describe('isBindableShortcut', () => {
  it('accepts a combination with Ctrl, Alt or Meta', () => {
    for (const mod of ['ctrl', 'alt', 'meta'] as const) {
      expect(isBindableShortcut(shortcutPartsFromEvent(press('d', { [mod]: true })))).toBe(true);
    }
  });

  it('refuses a bare key, which the user is trying to type', () => {
    // Binding 'd' would make the letter unusable in the composer.
    expect(isBindableShortcut(shortcutPartsFromEvent(press('d')))).toBe(false);
    expect(isBindableShortcut(shortcutPartsFromEvent(press('d', { shift: true })))).toBe(false);
  });

  it('refuses a modifier on its own', () => {
    expect(isBindableShortcut(shortcutPartsFromEvent(press('Alt', { alt: true })))).toBe(false);
  });

  it('knows which keys are modifiers', () => {
    expect(isModifierOnly('Shift')).toBe(true);
    expect(isModifierOnly('d')).toBe(false);
  });
});

describe('displayShortcut', () => {
  it('uses the Mac symbols on macOS', () => {
    mockIsMac = true;
    expect(displayShortcut('Alt+D')).toBe('⌥D');
    expect(displayShortcut('Shift+Meta+K')).toBe('⇧⌘K');
  });

  it('spells the modifiers out elsewhere', () => {
    mockIsMac = false;
    expect(displayShortcut('Alt+D')).toBe('Alt+D');
    expect(displayShortcut('Ctrl+Shift+K')).toBe('Ctrl+Shift+K');
  });

  it('shows nothing when nothing is bound', () => {
    expect(displayShortcut(null)).toBe('');
  });
});
