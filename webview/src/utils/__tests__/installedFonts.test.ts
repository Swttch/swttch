import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * jsdom draws nothing, so text is "measured" by a stand-in: each family has a width per character, and a font list is as
 * wide as its first name that is known (the way a browser falls back along the list). Unknown names fall through to the
 * generic family at the end, which is what a font that is not installed does.
 */
const CHAR_WIDTH: Record<string, number> = {
  monospace: 8,
  'sans-serif': 7,
  serif: 6,
  '"Fake Sans"': 9,
  '"Fake Mono"': 8,
};

function installFakeCanvas() {
  let font = '';
  const context = {
    set font(value: string) {
      font = value;
    },
    get font() {
      return font;
    },
    measureText(text: string) {
      const list = font.replace(/^\d+px\s+/, '').split(',').map((part) => part.trim());
      const known = list.find((name) => name in CHAR_WIDTH) ?? 'serif';
      // A monospaced font is as wide for every character; the others are narrower for "i" and wider for "W".
      const mono = known === 'monospace' || known === '"Fake Mono"';
      const perChar = (char: string) => (mono ? CHAR_WIDTH[known] : char === 'i' || char === 'l' ? CHAR_WIDTH[known] * 0.5 : char === 'W' || char === 'm' ? CHAR_WIDTH[known] * 1.5 : CHAR_WIDTH[known]);
      return { width: [...text].reduce((sum, char) => sum + perChar(char), 0) };
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as CanvasRenderingContext2D);
}

describe('installed fonts', () => {
  beforeEach(() => {
    vi.resetModules();
    installFakeCanvas();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('knows a family the page can draw and one it cannot', async () => {
    const { isFontInstalled } = await import('../installedFonts');
    expect(isFontInstalled('Fake Sans')).toBe(true);
    expect(isFontInstalled('Fake Mono')).toBe(true);
    expect(isFontInstalled('Not Installed Anywhere')).toBe(false);
  });

  it('tells a monospaced family from a proportional one', async () => {
    const { isFontMonospaced } = await import('../installedFonts');
    expect(isFontMonospaced('Fake Mono')).toBe(true);
    expect(isFontMonospaced('Fake Sans')).toBe(false);
  });

  it('keeps only the families the page can draw, each once, in alphabetical order', async () => {
    const { filterInstalled } = await import('../installedFonts');
    expect(filterInstalled(['Fake Sans', 'Ghost', 'Fake Mono', 'fake mono', ' Fake Sans ', ''])).toEqual(['Fake Mono', 'Fake Sans']);
  });

  it('lists nothing as installed where text cannot be measured at all', async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const { isFontInstalled, filterInstalled } = await import('../installedFonts');
    expect(isFontInstalled('Fake Sans')).toBe(false);
    expect(filterInstalled(['Fake Sans'])).toEqual([]);
  });

  it('gives the families the browser reports, and rejects when it reports none or the person refuses', async () => {
    const { queryAllLocalFamilies } = await import('../installedFonts');
    const w = window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> };
    w.queryLocalFonts = () => Promise.resolve([{ family: 'Menlo' }, { family: 'Arial' }]);
    await expect(queryAllLocalFamilies()).resolves.toEqual(['Menlo', 'Arial']);
    w.queryLocalFonts = () => Promise.resolve([]);
    await expect(queryAllLocalFamilies()).rejects.toThrow('no installed fonts');
    w.queryLocalFonts = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    await expect(queryAllLocalFamilies()).rejects.toThrow('denied');
    delete w.queryLocalFonts;
  });

  it('reads the list the IDE host hands over, and ignores anything that is not a list of names', async () => {
    const { hostFontFamilies } = await import('../installedFonts');
    const w = window as unknown as { __IDE_FONT_FAMILIES__?: unknown };
    delete w.__IDE_FONT_FAMILIES__;
    expect(hostFontFamilies()).toBeNull();
    w.__IDE_FONT_FAMILIES__ = ['Arial', 3, 'Menlo'];
    expect(hostFontFamilies()).toEqual(['Arial', 'Menlo']);
    w.__IDE_FONT_FAMILIES__ = 'Arial';
    expect(hostFontFamilies()).toBeNull();
    delete w.__IDE_FONT_FAMILIES__;
  });
});
