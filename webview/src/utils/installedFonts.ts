/**
 * The fonts a person can pick in the font settings (issue #729): the font families that are installed on this computer
 * AND that the page can draw.
 *
 * Where the names come from:
 * - In a JetBrains IDE the host hands over the families the system has (`window.__IDE_FONT_FAMILIES__`).
 * - In a browser there is no such list, so a list of common fonts is offered, and where the browser can give the whole
 *   list (`queryLocalFonts`, which asks the person for permission) that list can be loaded on request.
 *
 * Every name is then checked by measuring text: a name the page cannot draw (a font that only the IDE has inside itself,
 * or one that is not installed) is left out, so nothing in the dropdown is a choice that would change nothing.
 */

/** Common families, for where the system's own list is not available. Checked by measuring, so missing ones just vanish. */
export const COMMON_FONT_FAMILIES = [
  // Interface fonts
  'Inter', 'Roboto', 'Helvetica Neue', 'Helvetica', 'Arial', 'Segoe UI', 'SF Pro Text', 'SF Pro Display', 'Open Sans',
  'Noto Sans', 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans TC', 'Pretendard', 'Apple SD Gothic Neo',
  'Malgun Gothic', 'Nanum Gothic', 'Hiragino Sans', 'Yu Gothic', 'PingFang SC', 'Microsoft YaHei', 'Tahoma', 'Verdana',
  'Trebuchet MS', 'Lato', 'Ubuntu', 'Cantarell', 'Google Sans',
  // Serif fonts
  'Georgia', 'Times New Roman', 'Palatino', 'Palatino Linotype', 'Book Antiqua', 'Cambria', 'Noto Serif', 'Noto Serif KR',
  // Monospaced fonts
  'JetBrains Mono', 'Fira Code', 'Fira Mono', 'Source Code Pro', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Menlo',
  'Monaco', 'SF Mono', 'Courier New', 'Courier', 'D2Coding', 'Google Sans Code', 'IBM Plex Mono', 'Roboto Mono',
  'Inconsolata', 'Hack', 'Ubuntu Mono', 'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Lucida Console',
  'Anonymous Pro', 'Victor Mono', 'Space Mono', 'Nanum Gothic Coding', 'Sarasa Mono K',
];

const BASELINES = ['monospace', 'sans-serif', 'serif'] as const;
const PROBE_TEXT = 'mmmmmmmmmmlliWWWW0123456789';
const PROBE_SIZE = 72;

let context: CanvasRenderingContext2D | null | undefined;

function measure(fontList: string, text: string): number | null {
  if (context === undefined) {
    try {
      context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  if (!context) return null;
  context.font = `${PROBE_SIZE}px ${fontList}`;
  return context.measureText(text).width;
}

/** Whether the page can draw text in the family [name]: its width differs from each of the three generic families'. */
export function isFontInstalled(name: string): boolean {
  const quoted = `"${name.replace(/"/g, '')}"`;
  for (const baseline of BASELINES) {
    const bare = measure(baseline, PROBE_TEXT);
    const named = measure(`${quoted}, ${baseline}`, PROBE_TEXT);
    if (bare === null || named === null) continue;
    if (Math.abs(bare - named) > 0.01) return true;
  }
  return false;
}

/** Whether every character of the family [name] is as wide as the others (a monospaced font). */
export function isFontMonospaced(name: string): boolean {
  const quoted = `"${name.replace(/"/g, '')}"`;
  const narrow = measure(`${quoted}, sans-serif`, 'iiiiiiiiii');
  const wide = measure(`${quoted}, sans-serif`, 'WWWWWWWWWW');
  const digits = measure(`${quoted}, sans-serif`, '0000000000');
  if (narrow === null || wide === null || digits === null) return false;
  return Math.abs(narrow - wide) < 0.5 && Math.abs(narrow - digits) < 0.5;
}

/** The names of [candidates] that the page can draw, each once, in alphabetical order. */
export function filterInstalled(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of candidates) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (trimmed === '' || seen.has(key)) continue;
    seen.add(key);
    if (isFontInstalled(trimmed)) result.push(trimmed);
  }
  return result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** The family names the host (the JetBrains IDE) says the system has, or null where there is no host list. */
export function hostFontFamilies(): string[] | null {
  if (typeof window === 'undefined') return null;
  const list = (window as unknown as { __IDE_FONT_FAMILIES__?: unknown }).__IDE_FONT_FAMILIES__;
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string') : null;
}

/** Whether this browser can give the list of every installed font (asking the person first). */
export function canQueryLocalFonts(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
}

/**
 * The family names of every font installed, as the browser reports them. Rejects when the person says no, and when the
 * browser answers with no font at all (an embedded browser can have the API and no fonts to give), so the caller keeps
 * the list it already has instead of replacing it with an empty one.
 */
export async function queryAllLocalFamilies(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts: () => Promise<{ family: string }[]> }).queryLocalFonts;
  const fonts = await query.call(window);
  if (fonts.length === 0) throw new Error('The browser reported no installed fonts');
  return fonts.map((font) => font.family);
}
