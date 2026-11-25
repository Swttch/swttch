/**
 * Makes viewport units mean "a share of the screen" again under the UI zoom.
 *
 * `<html>` carries CSS `zoom` (utils/zoom.ts): 1.25 on a phone, and whatever the reader picks with
 * CmdOrCtrl +/- elsewhere. That zoom multiplies every length on the page, viewport units included,
 * so at 1.25 a `100vh` box is 125% of the screen tall. A dialog capped at `max-h-[80vh]` came out
 * at 100% of the screen, centred, with its header and close button pushed above the top edge.
 *
 * This rewrites every viewport length in the stylesheets as `calc(<length> / var(--ui-zoom, 1))`,
 * the same correction the preview pane and the task panel already apply to their own `vw` lengths
 * (FilePreviewPane/usePaneColumn.ts). It runs after Tailwind, so arbitrary values such as
 * `max-h-[80vh]` and theme values such as `h-screen` are covered as well. Lengths written into
 * inline styles in TS/TSX never reach PostCSS and must divide by `--ui-zoom` themselves.
 */

import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

/** The webview's own sources. Tailwind's output counts as coming from `src/index.css`, which holds its directives. */
const OWN_SOURCES = resolve(dirname(fileURLToPath(import.meta.url)), 'src');

/**
 * Whether `file` is one of our own stylesheets. A library's stylesheet (`node_modules`) is left as it is: the
 * library may place things from script with lengths of its own, and correcting its CSS alone could split the two.
 */
function isOwnStylesheet(file, sources) {
  if (!file) return false;
  const path = relative(sources, file);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

/** A number directly followed by a viewport unit, e.g. `80vh`, `-2.5dvw`, `100svh`. */
const VIEWPORT_LENGTH = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:[dsl]?v[hwib]|vmin|vmax))(?![\w-])/g;

/** `value` with every viewport length divided by the UI zoom. Leaves already-corrected values alone. */
export function divideViewportLengths(value) {
  if (value.includes('--ui-zoom')) return value;
  return value.replace(VIEWPORT_LENGTH, (_, before, length) => `${before}calc(${length} / var(--ui-zoom, 1))`);
}

/** A plain `vh` length (not `dvh`/`svh`/`lvh`), e.g. the `80vh` in `calc(80vh / ...)`. */
const PLAIN_VH = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+))vh(?![\w-])/g;

/**
 * `value` with each plain `vh` turned into `dvh`, or null when it has none.
 *
 * `vh` is the height with the browser's bars hidden. On a phone the address bar and toolbar are
 * usually showing, so a dialog capped at `90vh` was taller than what is visible, and Chrome on iOS
 * drew its bars over the dialog's close button. `dvh` is the height that is visible right now.
 */
export function toDynamicViewportHeight(value) {
  const next = value.replace(PLAIN_VH, (_, before, number) => `${before}${number}dvh`);
  return next === value ? null : next;
}

/**
 * `options.sources`: the folder whose stylesheets are rewritten. Defaults to the webview's `src`; a test passes
 * a folder of its own.
 *
 * @type {import('postcss').PluginCreator<{ sources?: string } | void>}
 */
export const viewportZoom = (options) => ({
  postcssPlugin: 'viewport-zoom',
  // Custom properties included: the browser substitutes them where they are used, past this step, and
  // Tailwind keeps values such as `translate-x-[50vw]` in its own `--tw-*` properties.
  Declaration(decl) {
    if (!isOwnStylesheet(decl.source?.input.file, options?.sources ?? OWN_SOURCES)) return;
    const next = divideViewportLengths(decl.value);
    if (next === decl.value) return;
    decl.value = next;
    // Followed by the same length in `dvh`. A browser without `dvh` drops that declaration as
    // invalid and keeps the `vh` one before it. Not for a custom property: an invalid value there
    // is not dropped, it would only break the property where it is used.
    const dynamic = decl.prop.startsWith('--') ? null : toDynamicViewportHeight(next);
    if (dynamic) decl.cloneAfter({ value: dynamic });
  },
});
viewportZoom.postcss = true;
