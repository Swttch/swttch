import { describe, it, expect } from 'vitest';
import { keyCapsFor, parseCombo } from '../keyCombo';

describe('keyCapsFor', () => {
  it('draws symbols on macOS, with Command resolved from Mod', () => {
    expect(keyCapsFor('Mod+Shift+M', true)).toEqual(['⇧', '⌘', 'M']);
  });

  it('draws words on other platforms, with Ctrl resolved from Mod', () => {
    expect(keyCapsFor('Mod+Shift+M', false)).toEqual(['Ctrl', '⇧', 'M']);
  });

  it('keeps a literal Ctrl as Control on macOS', () => {
    expect(keyCapsFor('Ctrl+A', true)).toEqual(['⌃', 'A']);
    expect(keyCapsFor('Ctrl+A', false)).toEqual(['Ctrl', 'A']);
  });

  it('puts the modifiers in Apple order on macOS', () => {
    expect(keyCapsFor('Meta+Alt+Ctrl+Shift+K', true)).toEqual(['⌃', '⌥', '⇧', '⌘', 'K']);
  });

  it('draws arrows as arrows on every platform', () => {
    for (const mac of [true, false]) {
      expect(keyCapsFor('ArrowUp', mac)).toEqual(['↑']);
      expect(keyCapsFor('ArrowDown', mac)).toEqual(['↓']);
      expect(keyCapsFor('ArrowLeft', mac)).toEqual(['←']);
      expect(keyCapsFor('ArrowRight', mac)).toEqual(['→']);
    }
    expect(keyCapsFor('Mod+ArrowLeft', true)).toEqual(['⌘', '←']);
    expect(keyCapsFor('Ctrl+ArrowRight', false)).toEqual(['Ctrl', '→']);
  });

  it('reads punctuation keys, including a plus', () => {
    expect(keyCapsFor('Mod+/', true)).toEqual(['⌘', '/']);
    expect(keyCapsFor('Mod+/', false)).toEqual(['Ctrl', '/']);
    expect(keyCapsFor('Mod++', true)).toEqual(['⌘', '+']);
    expect(keyCapsFor('Mod+-', false)).toEqual(['Ctrl', '-']);
    expect(keyCapsFor('Mod+Shift+.', true)).toEqual(['⇧', '⌘', '.']);
    expect(keyCapsFor('Mod+,', true)).toEqual(['⌘', ',']);
  });

  it('draws Shift, Tab and Enter as glyphs', () => {
    expect(keyCapsFor('Shift+Tab', true)).toEqual(['⇧', '⇥']);
    expect(keyCapsFor('Shift+Tab', false)).toEqual(['⇧', '⇥']);
    expect(keyCapsFor('Shift+Enter', true)).toEqual(['⇧', '↩']);
    expect(keyCapsFor('Shift+Enter', false)).toEqual(['⇧', '↵']);
  });

  it('draws a plain Enter as return on macOS and enter elsewhere', () => {
    expect(keyCapsFor('Enter', true)).toEqual(['↩']);
    expect(keyCapsFor('Enter', false)).toEqual(['↵']);
  });

  it('reads the stored spelling of a user binding', () => {
    expect(keyCapsFor('Alt+D', true)).toEqual(['⌥', 'D']);
    expect(keyCapsFor('Meta+Enter', false)).toEqual(['Win', '↵']);
  });

  it('returns nothing for a combo it cannot read', () => {
    expect(keyCapsFor('', true)).toEqual([]);
    expect(parseCombo('Mod+A+B', true)).toBeNull();
  });
});
