import type { ReactNode } from 'react';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';
import { FileKind, extensionTag, fileKindOf } from './fileType';

/** Text color per kind, so a row of cards can be told apart before a name is read. */
const KIND_COLOR: Record<FileKind, string> = {
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

const ICON_PROPS = {
  className: 'w-7 h-7',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** The page-with-a-folded-corner every file kind shares; the kind shows in its color and tag. */
function PageIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * The icon a file or folder card carries: the page glyph tinted by the kind of
 * file, with its extension beneath it. `caption` replaces the extension while
 * something else is worth saying there, like the share already uploaded.
 */
export function FileGlyph(props: { name?: string; isFolder?: boolean; caption?: string }) {
  const { name = '', isFolder = false, caption } = props;
  const color = isFolder ? 'text-text-secondary' : KIND_COLOR[fileKindOf(name)];
  const tag = caption ?? (isFolder ? '' : extensionTag(name));

  return (
    <div className={`flex flex-col items-center gap-0.5 ${color}`}>
      {isFolder ? <FolderIcon /> : <PageIcon />}
      <span className="h-2.5 text-[0.6154rem] leading-[0.625rem] font-semibold tabular-nums">{tag}</span>
    </div>
  );
}

interface Props {
  /** What fills the square: the file glyph, or a preview of the file. */
  children: ReactNode;
  /** The whole name; the card shows it cut short beneath the square. */
  name: string;
  /** Where the file lives, shown with the name when the pointer rests on it. */
  path?: string;
  /** The shown label, when it differs from the name (a folder carries a trailing slash). */
  label?: string;
  /** Size in bytes when already known; otherwise the tooltip asks the backend by path. */
  size?: number;
  /** False for a folder, whose size is not told. */
  withSize?: boolean;
  /** Share uploaded so far, 0 to 100, drawn as a bar along the square's lower edge. */
  progress?: number;
  onRemove: () => void;
}

/**
 * A square card for a file, folder or upload, the size of an image thumbnail.
 *
 * A row holding an image is as tall as the image, so every other chip in it
 * becomes one of these instead of floating in the picture's height as a thin
 * pill. The label under the square is the same size as an image thumbnail's.
 */
export function AttachmentTile(props: Props) {
  const { children, name, path, label = name, size, withSize, progress, onRemove } = props;

  return (
    <div className="relative group">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-md overflow-hidden border border-border-default bg-surface-hover">
        {children}
        {progress !== undefined && (
          <div
            className="absolute left-0 bottom-0 h-0.5 bg-accent-primary transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -end-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-surface-tooltip hover:bg-state-error-fg text-text-secondary text-[0.7692rem] transition-colors opacity-0 group-hover:opacity-100"
      >
        ×
      </button>
      <AttachmentNameTooltip name={name} path={path} size={size} withSize={withSize}>
        <div className="text-[0.7692rem] text-text-tertiary truncate max-w-[64px] mt-0.5 text-center">
          {label}
        </div>
      </AttachmentNameTooltip>
    </div>
  );
}
