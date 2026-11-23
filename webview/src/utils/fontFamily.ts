/**
 * The font settings (chat font, code font) are what a person types into a box: `Google Sans Code`, or a list such as
 * `JetBrains Mono, Consolas`. This turns that text into the value of a CSS `font-family`.
 */

/** Names CSS reads as a generic family. They are written without quotes: quoted, they would mean a font of that name. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** Splits on the commas that are not inside quotes. */
function splitFamilies(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ',') {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * The CSS `font-family` list for the text of a font setting, or null when the text names no font (empty, or only
 * commas and quotes). Every name is written in double quotes so a name with spaces or digits ("Google Sans Code",
 * "D2Coding") is read as one family; a generic family (`monospace`) is left bare.
 */
export function fontFamilyToCss(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const names = splitFamilies(text)
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, '$2').trim())
    .filter((name) => name !== '' && !/["']/.test(name));
  if (names.length === 0) return null;
  return names.map((name) => (GENERIC_FAMILIES.has(name.toLowerCase()) ? name.toLowerCase() : `"${name}"`)).join(', ');
}

/**
 * Whether the text of a font setting can be saved: the characters a font name is made of, at most 200 of them. The
 * backend checks the same rule (`validateSetting` in backend/src/core/features/settings.ts), so a value that passes here
 * is not refused there.
 */
export const FONT_FAMILY_MAX_LENGTH = 200;
export function isValidFontFamilyText(text: string): boolean {
  return text.length <= FONT_FAMILY_MAX_LENGTH && /^[\p{L}\p{N} ,.'"_-]+$/u.test(text);
}

/** The CSS properties the Kotlin host sets to the font of the IDE's editor and of its interface, as a quoted family. */
export const IDE_EDITOR_FONT_PROPERTY = '--ccg-ide-editor-font';
export const IDE_UI_FONT_PROPERTY = '--ccg-ide-ui-font';

/**
 * The font to draw with: the font of the IDE when that is asked for and the host provided it, otherwise the font
 * chosen in the setting, otherwise null (the built-in font).
 */
export function resolveFontCss(
  followIde: boolean,
  chosen: string | null | undefined,
  ideFont: string | null | undefined,
): string | null {
  if (followIde) {
    const ide = fontFamilyToCss(ideFont);
    if (ide) return ide;
  }
  return fontFamilyToCss(chosen);
}

/** The CSS variables the font settings set on `<html>`; index.css and tailwind.config.js read them. */
export const USER_FONT_UI_PROPERTY = '--user-font-ui';
export const USER_FONT_CODE_PROPERTY = '--user-font-code';

/**
 * The values of the two variables for the current settings: the chosen font first, then the built-in one, so text
 * still draws in a sensible font when the chosen one is not installed. null removes the variable (built-in fonts).
 */
export function userFontVariables(input: {
  chatFont: string | null | undefined;
  chatFromIde: boolean;
  codeFont: string | null | undefined;
  codeFromIde: boolean;
  ideUiFont: string | null | undefined;
  ideEditorFont: string | null | undefined;
}): { ui: string | null; code: string | null } {
  const ui = resolveFontCss(input.chatFromIde, input.chatFont, input.ideUiFont);
  const code = resolveFontCss(input.codeFromIde, input.codeFont, input.ideEditorFont);
  return {
    ui: ui ? `${ui}, var(--ide-font-ui)` : null,
    code: code ? `${code}, var(--ide-font-code)` : null,
  };
}
