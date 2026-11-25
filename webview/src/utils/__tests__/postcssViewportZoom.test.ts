import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
// @ts-expect-error -- plain JS build plugin next to vite.config, no type declarations
import { viewportZoom, divideViewportLengths, toDynamicViewportHeight } from '../../../postcss-viewport-zoom.js';

// Made-up absolute paths: the plugin only compares them, it never reads a file.
const SOURCES = '/app/webview/src';
const OWN_STYLESHEET = `${SOURCES}/index.css`;

/** `from: null` processes the CSS with no file at all, as PostCSS does for a string of unknown origin. */
const run = async (css: string, from: string | null = OWN_STYLESHEET) =>
  (await postcss([viewportZoom({ sources: SOURCES })]).process(css, { from: from ?? undefined })).css;

describe('postcss-viewport-zoom', () => {
  it('divides a plain viewport length by the UI zoom', () => {
    expect(divideViewportLengths('80vh')).toBe('calc(80vh / var(--ui-zoom, 1))');
  });

  it('rewrites each viewport length inside min() and calc() and leaves other units alone', () => {
    expect(divideViewportLengths('min(32rem,90vw)')).toBe('min(32rem,calc(90vw / var(--ui-zoom, 1)))');
    expect(divideViewportLengths('calc(100vh - 5rem)')).toBe('calc(calc(100vh / var(--ui-zoom, 1)) - 5rem)');
    expect(divideViewportLengths('100dvh')).toBe('calc(100dvh / var(--ui-zoom, 1))');
    expect(divideViewportLengths('12px 2rem 50%')).toBe('12px 2rem 50%');
  });

  it('does not touch a value that already corrects for the zoom', () => {
    const corrected = 'calc((100vw - 400px) / var(--ui-zoom, 1))';
    expect(divideViewportLengths(corrected)).toBe(corrected);
  });

  it('does not mistake identifiers or url() contents for lengths', () => {
    expect(divideViewportLengths('var(--x-90vh)')).toBe('var(--x-90vh)');
    expect(divideViewportLengths('url(a10vh.png)')).toBe('url(a10vh.png)');
  });

  it('rewrites declarations, custom properties included, exactly once', async () => {
    const out = await run('.a{max-width:90vw;--tw-translate-x:50vw}');
    expect(out).toBe('.a{max-width:calc(90vw / var(--ui-zoom, 1));--tw-translate-x:calc(50vw / var(--ui-zoom, 1))}');
  });

  it('follows a vh declaration with a dvh one, which browsers without dvh drop', async () => {
    const out = await run('.a{max-height:calc(100vh - 5rem)}');
    expect(out).toBe(
      '.a{max-height:calc(calc(100vh / var(--ui-zoom, 1)) - 5rem);max-height:calc(calc(100dvh / var(--ui-zoom, 1)) - 5rem)}',
    );
  });

  it('adds no dvh copy for a custom property or a length already in dvh', async () => {
    expect(await run('.a{--h:80vh}')).toBe('.a{--h:calc(80vh / var(--ui-zoom, 1))}');
    expect(await run('.a{height:100dvh}')).toBe('.a{height:calc(100dvh / var(--ui-zoom, 1))}');
  });

  it('turns only plain vh into dvh', () => {
    expect(toDynamicViewportHeight('calc(90vh / var(--ui-zoom, 1))')).toBe('calc(90dvh / var(--ui-zoom, 1))');
    expect(toDynamicViewportHeight('min(32rem,90vw)')).toBeNull();
    expect(toDynamicViewportHeight('100svh')).toBeNull();
  });

  it("leaves a library's stylesheet and one with no known file alone", async () => {
    const css = '.a{max-height:80vh}';
    expect(await run(css, '/app/webview/node_modules/some-lib/dist/style.css')).toBe(css);
    expect(await run(css, null)).toBe(css);
  });
});
