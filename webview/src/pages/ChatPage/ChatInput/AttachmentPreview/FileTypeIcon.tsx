import { FileKind, fileKindOf } from './fileType';

/** Text color per kind, so a row of chips can be told apart before a name is read. */
export const KIND_COLOR: Record<FileKind, string> = {
  [FileKind.Pdf]: 'text-state-error-fg',
  [FileKind.Document]: 'text-state-info-fg',
  [FileKind.Spreadsheet]: 'text-state-success-fg',
  [FileKind.Presentation]: 'text-state-warning-fg',
  [FileKind.Text]: 'text-text-secondary',
  [FileKind.Code]: 'text-accent-primary',
  [FileKind.Archive]: 'text-state-warning-fg',
  [FileKind.Video]: 'text-accent-claude',
  [FileKind.Audio]: 'text-accent-claude',
  [FileKind.Image]: 'text-state-success-fg',
  [FileKind.Other]: 'text-text-tertiary',
};

/**
 * What is drawn on the page for each kind, in a 24-unit box with the page itself
 * at x 4 to 20. Small enough to stay legible at 14px, where a chip draws it.
 */
const SYMBOL: Record<FileKind, string | null> = {
  [FileKind.Pdf]: 'M8 13h8 M8 16h8 M8 19h4',
  [FileKind.Document]: 'M8 12h8 M8 15h8 M8 18h5',
  [FileKind.Text]: 'M8 13h8 M8 16h6',
  [FileKind.Spreadsheet]: 'M8 11h8v8H8z M8 15h8 M12 11v8',
  [FileKind.Presentation]: 'M8 12h8v5H8z M12 17v2 M10 19h4',
  [FileKind.Code]: 'M10 12.5l-2.5 2.5 2.5 2.5 M14 12.5l2.5 2.5-2.5 2.5',
  [FileKind.Archive]: 'M12 9v10 M10.5 16h3v3h-3z',
  [FileKind.Video]: 'M10 12l6 3.5-6 3.5z',
  [FileKind.Audio]: 'M10.5 18a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z M10.5 18v-6l5-1v5.5 M15.5 16.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  [FileKind.Image]: 'M8 19l3-4.5 2 2.5 1.5-2 2.5 4z M10 12.5h.01',
  [FileKind.Other]: null,
};

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/**
 * A file's icon, chosen by its extension: the page every file shares, a symbol on
 * it that says what is inside (a play triangle, code brackets, a grid), and the
 * kind's own color. It draws in the current text color unless the caller overrides
 * it, so it works in a chip and in a card alike.
 */
export function FileTypeIcon(props: { name: string; className?: string; colored?: boolean }) {
  const { name, className = '', colored = true } = props;
  const kind = fileKindOf(name);
  const symbol = SYMBOL[kind];

  return (
    <svg
      {...SVG_PROPS}
      data-kind={kind}
      className={`${colored ? KIND_COLOR[kind] : ''} ${className}`.trim()}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {symbol && <path d={symbol} strokeWidth={1.5} strokeDasharray={kind === FileKind.Archive ? '1.6 1.6' : undefined} />}
    </svg>
  );
}

export function FolderIcon(props: { className?: string }) {
  return (
    <svg {...SVG_PROPS} data-kind="folder" className={props.className} aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
