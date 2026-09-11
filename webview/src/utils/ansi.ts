/**
 * Turn a terminal log into styled spans.
 *
 * Every tool a developer backgrounds writes colour: vite, gradle, pnpm, vitest.
 * Rendered as plain text their escape codes read as litter — a real `dist` log
 * came out as `[2mdist/ [22m [36mmwasm-CG6Dc4jp.js [39m [1m [33m 622.34 kB`,
 * with the numbers a reader wants buried in the codes. Since the pane is styled
 * as a terminal, it should show what a terminal shows.
 *
 * Only SGR (`ESC[…m`) is interpreted. Every other escape — cursor moves, erase,
 * OSC title sets — is dropped rather than printed: none of them mean anything
 * in a pane that only ever appends.
 */

export interface AnsiSegment {
  text: string;
  /** Tailwind classes for this run, empty for the pane's default styling. */
  className: string;
}

/** ESC [ … <final byte>, plus the OSC form ESC ] … (BEL | ESC \). */
const ANSI_PATTERN = /\u001b\[([0-9;?]*)([@-~])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

/**
 * A terminal's 16 colours, picked to stay legible on the pane's near-black
 * background rather than to match any one terminal's palette.
 */
const FOREGROUND: Record<number, string> = {
  30: 'text-neutral-500', // black, lifted so it is not invisible here
  31: 'text-red-400',
  32: 'text-emerald-400',
  33: 'text-amber-300',
  34: 'text-blue-400',
  35: 'text-fuchsia-400',
  36: 'text-cyan-300',
  37: 'text-neutral-200',
  90: 'text-neutral-500',
  91: 'text-red-300',
  92: 'text-emerald-300',
  93: 'text-amber-200',
  94: 'text-blue-300',
  95: 'text-fuchsia-300',
  96: 'text-cyan-200',
  97: 'text-white',
};

const BACKGROUND: Record<number, string> = {
  40: 'bg-neutral-800',
  41: 'bg-red-900',
  42: 'bg-emerald-900',
  43: 'bg-amber-900',
  44: 'bg-blue-900',
  45: 'bg-fuchsia-900',
  46: 'bg-cyan-900',
  47: 'bg-neutral-700',
  100: 'bg-neutral-700',
  101: 'bg-red-800',
  102: 'bg-emerald-800',
  103: 'bg-amber-800',
  104: 'bg-blue-800',
  105: 'bg-fuchsia-800',
  106: 'bg-cyan-800',
  107: 'bg-neutral-600',
};

interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function classNameOf(style: Style): string {
  const parts: string[] = [];
  if (style.fg) parts.push(style.fg);
  if (style.bg) parts.push(style.bg);
  if (style.bold) parts.push('font-bold');
  // Dim and the pane's own default are both "quieter than normal"; opacity
  // composes with whatever colour is set rather than replacing it.
  if (style.dim) parts.push('opacity-60');
  if (style.italic) parts.push('italic');
  if (style.underline) parts.push('underline');
  return parts.join(' ');
}

/** Apply one `ESC[…m` parameter run to the running style. */
function applySgr(style: Style, params: string): Style {
  // `ESC[m` with no parameters means reset, same as `ESC[0m`.
  const codes = params === '' ? [0] : params.split(';').map((p) => parseInt(p, 10) || 0);
  let next = { ...style };

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) { next.bold = false; next.dim = false; }
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 39) next.fg = undefined;
    else if (code === 49) next.bg = undefined;
    else if (FOREGROUND[code]) next.fg = FOREGROUND[code];
    else if (BACKGROUND[code]) next.bg = BACKGROUND[code];
    // 256-colour and truecolour take their arguments from the codes that
    // follow; skip those so they are not read as styles of their own.
    else if (code === 38 || code === 48) {
      const mode = codes[i + 1];
      i += mode === 5 ? 2 : mode === 2 ? 4 : 1;
    }
  }
  return next;
}

/**
 * Collapse the carriage returns progress bars use. A terminal draws each `\r`
 * over the line so far, so only the last write survives; without this a single
 * gradle or pnpm progress line arrives as hundreds of stacked copies.
 */
function collapseCarriageReturns(text: string): string {
  if (!text.includes('\r')) return text;
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split('\r');
      return parts[parts.length - 1];
    })
    .join('\n');
}

/**
 * Split a log into styled runs. Text with no escapes comes back as a single
 * unstyled segment, so the common case costs one array entry.
 */
export function parseAnsi(input: string): AnsiSegment[] {
  const text = collapseCarriageReturns(input);
  const segments: AnsiSegment[] = [];
  let style: Style = {};
  let last = 0;

  ANSI_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_PATTERN.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), className: classNameOf(style) });
    }
    // group 2 is the final byte of a CSI sequence; only `m` carries styling,
    // and an OSC match has no groups at all.
    if (match[2] === 'm') style = applySgr(style, match[1] ?? '');
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    segments.push({ text: text.slice(last), className: classNameOf(style) });
  }
  return segments;
}
