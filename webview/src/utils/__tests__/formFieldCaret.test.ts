import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { moveFormFieldCaret } from '../formFieldCaret';
import { CaretBoundary, CaretDirection } from '@/utils/domSelection';

/**
 * Caret steps inside `<input>` and `<textarea>`, which keep their selection in
 * character offsets and so can be asserted in jsdom. Cmd+Arrow (Line, Document)
 * is covered through useCaretBoundaryKeys; these are the steps the Emacs text
 * keys add: Character (Ctrl+B/F), Row (Ctrl+P/N) and Paragraph (Ctrl+A/E).
 */
const { Backward, Forward } = CaretDirection;
const { Character, Row, Paragraph } = CaretBoundary;

describe('moveFormFieldCaret', () => {
  describe('in an input', () => {
    let field: HTMLInputElement;

    beforeEach(() => {
      field = document.createElement('input');
      field.value = 'hello world';
      document.body.appendChild(field);
      field.focus();
    });

    afterEach(() => {
      field.remove();
    });

    it('moves the caret back and forward one character', () => {
      field.setSelectionRange(5, 5);

      moveFormFieldCaret(field, Backward, Character, false);
      expect(field.selectionStart).toBe(4);

      moveFormFieldCaret(field, Forward, Character, false);
      moveFormFieldCaret(field, Forward, Character, false);
      expect(field.selectionStart).toBe(6);
    });

    it('clamps a character step at the ends', () => {
      field.setSelectionRange(0, 0);
      moveFormFieldCaret(field, Backward, Character, false);
      expect(field.selectionStart).toBe(0);

      field.setSelectionRange(11, 11);
      moveFormFieldCaret(field, Forward, Character, false);
      expect(field.selectionStart).toBe(11);
    });

    it('collapses a selection to its near edge without Shift', () => {
      field.setSelectionRange(2, 8);
      moveFormFieldCaret(field, Backward, Character, false);
      expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2]);

      field.setSelectionRange(2, 8);
      moveFormFieldCaret(field, Forward, Character, false);
      expect([field.selectionStart, field.selectionEnd]).toEqual([8, 8]);
    });

    it('extends by one character with Shift, keeping the anchor', () => {
      field.setSelectionRange(5, 5);

      moveFormFieldCaret(field, Backward, Character, true);

      expect([field.selectionStart, field.selectionEnd]).toEqual([4, 5]);
    });

    it('sends the caret to the ends for a paragraph step', () => {
      field.setSelectionRange(5, 5);
      moveFormFieldCaret(field, Backward, Paragraph, false);
      expect(field.selectionStart).toBe(0);

      moveFormFieldCaret(field, Forward, Paragraph, false);
      expect(field.selectionStart).toBe(11);
    });

    it('treats a row step in an input as the ends', () => {
      field.setSelectionRange(5, 5);
      moveFormFieldCaret(field, Backward, Row, false);
      expect(field.selectionStart).toBe(0);

      moveFormFieldCaret(field, Forward, Row, false);
      expect(field.selectionStart).toBe(11);
    });
  });

  describe('in a textarea', () => {
    let area: HTMLTextAreaElement;

    beforeEach(() => {
      area = document.createElement('textarea');
      area.value = 'abcdef\nxy\nlonger line';
      document.body.appendChild(area);
      area.focus();
    });

    afterEach(() => {
      area.remove();
    });

    it('moves a row down keeping the column, clamped to a short line', () => {
      area.setSelectionRange(4, 4);

      moveFormFieldCaret(area, Forward, Row, false);
      // "xy" is two long, so column 4 clamps to its end.
      expect(area.selectionStart).toBe('abcdef\nxy'.length);

      moveFormFieldCaret(area, Forward, Row, false);
      expect(area.selectionStart).toBe('abcdef\nxy\n'.length + 2);
    });

    it('moves a row up keeping the column', () => {
      area.setSelectionRange('abcdef\nxy\nlon'.length, 'abcdef\nxy\nlon'.length);

      moveFormFieldCaret(area, Backward, Row, false);
      expect(area.selectionStart).toBe('abcdef\nxy'.length);

      moveFormFieldCaret(area, Backward, Row, false);
      expect(area.selectionStart).toBe(2);
    });

    it('goes to the text edge when there is no neighbouring line', () => {
      area.setSelectionRange(3, 3);
      moveFormFieldCaret(area, Backward, Row, false);
      expect(area.selectionStart).toBe(0);

      area.setSelectionRange(area.value.length - 2, area.value.length - 2);
      moveFormFieldCaret(area, Forward, Row, false);
      expect(area.selectionStart).toBe(area.value.length);
    });

    it('extends across lines with Shift', () => {
      area.setSelectionRange(2, 2);

      moveFormFieldCaret(area, Forward, Row, true);

      expect(area.selectionStart).toBe(2);
      expect(area.selectionEnd).toBe('abcdef\nxy'.length);
    });

    it('stops a paragraph step at the hard newlines', () => {
      area.setSelectionRange('abcdef\nx'.length, 'abcdef\nx'.length);

      moveFormFieldCaret(area, Backward, Paragraph, false);
      expect(area.selectionStart).toBe('abcdef\n'.length);

      moveFormFieldCaret(area, Forward, Paragraph, false);
      expect(area.selectionStart).toBe('abcdef\nxy'.length);
    });
  });
});
