import { describe, it, expect } from 'vitest';
import { fontFamilyToCss, isValidFontFamilyText, resolveFontCss, userFontVariables } from '../fontFamily';

describe('fontFamilyToCss', () => {
  it('writes one name with spaces as one quoted family', () => {
    expect(fontFamilyToCss('Google Sans Code')).toBe('"Google Sans Code"');
  });

  it('writes a list in order, trimming each name', () => {
    expect(fontFamilyToCss('JetBrains Mono ,  Consolas')).toBe('"JetBrains Mono", "Consolas"');
  });

  it('keeps the names a person already put in quotes, whichever quote', () => {
    expect(fontFamilyToCss(`'JetBrains Mono', "Fira Code"`)).toBe('"JetBrains Mono", "Fira Code"');
  });

  it('does not split on a comma inside quotes', () => {
    expect(fontFamilyToCss(`"Odd, Name", Arial`)).toBe('"Odd, Name", "Arial"');
  });

  it('leaves a generic family bare, in lower case', () => {
    expect(fontFamilyToCss('Menlo, Monospace')).toBe('"Menlo", monospace');
    expect(fontFamilyToCss('ui-monospace')).toBe('ui-monospace');
  });

  it('is null for text that names no font', () => {
    expect(fontFamilyToCss('')).toBeNull();
    expect(fontFamilyToCss('  ,  , ')).toBeNull();
    expect(fontFamilyToCss('""')).toBeNull();
    expect(fontFamilyToCss(null)).toBeNull();
    expect(fontFamilyToCss(undefined)).toBeNull();
  });

  it('drops a name that has a stray quote inside instead of writing a broken declaration', () => {
    expect(fontFamilyToCss(`Arial, Bad"Name`)).toBe('"Arial"');
  });
});

describe('isValidFontFamilyText', () => {
  it('accepts what a font name or a list of them is made of', () => {
    expect(isValidFontFamilyText('Google Sans Code')).toBe(true);
    expect(isValidFontFamilyText(`'JetBrains Mono', Fira-Code, D2Coding 1.0`)).toBe(true);
    expect(isValidFontFamilyText('나눔고딕코딩')).toBe(true);
  });

  it('refuses what could end the CSS declaration, and a text that is too long', () => {
    for (const bad of ['Arial; color: red', 'x} body {', 'url(javascript:1)', 'a\\b', '<b>', 'a'.repeat(201)]) {
      expect(isValidFontFamilyText(bad)).toBe(false);
    }
  });
});

describe('resolveFontCss', () => {
  it('uses the IDE font when it is asked for and the host provided it', () => {
    expect(resolveFontCss(true, 'Fira Code', '"JetBrains Mono"')).toBe('"JetBrains Mono"');
  });

  it('falls back to the typed font when the host did not provide an editor font (no IDE)', () => {
    expect(resolveFontCss(true, 'Fira Code', '')).toBe('"Fira Code"');
    expect(resolveFontCss(true, 'Fira Code', undefined)).toBe('"Fira Code"');
  });

  it('uses the typed font when the IDE font is not asked for, even if the host provided one', () => {
    expect(resolveFontCss(false, 'Fira Code', '"JetBrains Mono"')).toBe('"Fira Code"');
  });

  it('is null when nothing names a font', () => {
    expect(resolveFontCss(false, null, '"JetBrains Mono"')).toBeNull();
    expect(resolveFontCss(true, null, null)).toBeNull();
  });
});

describe('userFontVariables', () => {
  it('puts the chosen font first and the built-in one after it', () => {
    expect(userFontVariables({ chatFont: 'Inter', chatFromIde: false, codeFont: 'Fira Code', codeFromIde: false, ideUiFont: null, ideEditorFont: null })).toEqual({
      ui: '"Inter", var(--ide-font-ui)',
      code: '"Fira Code", var(--ide-font-code)',
    });
  });

  it('removes a variable whose setting is unset, so the built-in font stays', () => {
    expect(userFontVariables({ chatFont: null, chatFromIde: false, codeFont: null, codeFromIde: false, ideUiFont: '"Inter"', ideEditorFont: '"JetBrains Mono"' })).toEqual({ ui: null, code: null });
  });

  it('takes the IDE font for the code when asked', () => {
    const vars = userFontVariables({ chatFont: null, chatFromIde: true, codeFont: null, codeFromIde: true, ideUiFont: '"Inter"', ideEditorFont: '"JetBrains Mono"' });
    expect(vars.code).toBe('"JetBrains Mono", var(--ide-font-code)');
    expect(vars.ui).toBe('"Inter", var(--ide-font-ui)');
  });
});
