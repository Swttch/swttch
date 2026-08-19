import { Link } from 'react-router-dom';
import { ChevronRightIcon, FolderIcon } from '@heroicons/react/24/outline';
import { FolderIcon as FolderSolidIcon } from '@heroicons/react/24/solid';
import { Route, routeToPath, withWorkingDir } from '@/router/routes';
import { WorkingDirEntry } from './classifyWorkingDirs';
import { useTranslation } from '@/i18n';
import type { TFunction } from 'i18next';

interface Props {
  entry: WorkingDirEntry;
  /**
   * Tree depth relative to the highest visible ancestor (0 = top of the
   * rendered tree). Drives left padding to express the nesting visually.
   */
  depth: number;
  isCurrent: boolean;
  isIdeRoot: boolean;
  /**
   * Synthesized current row — the user picked the folder but no Claude session
   * has been started there yet. Replaces the session-count slot with a "Draft"
   * badge so the user knows this working dir only becomes permanent after a
   * session runs.
   */
  isDraft: boolean;
  /**
   * Structural row that only exists to carry the tree shape (e.g. `packages/`
   * sitting between the repo root and `packages/webview`). No Claude session
   * ever ran there, so it renders unclickable and without a session count.
   */
  isScaffold: boolean;
  /** Whether this row has children, i.e. whether it gets a chevron at all. */
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

/** Indent of the depth-0 row, matching the menu's own horizontal padding. */
const BASE_INDENT_REM = 0.625;
/** How much further each nesting level steps in. */
const STEP_INDENT_REM = 0.875;

/**
 * Indentation as an inline style rather than a Tailwind class.
 *
 * Tailwind can only emit classes it sees at build time, so a class-based scale
 * has to be a fixed palette — which silently clamps once the tree runs deeper
 * than the palette, collapsing distinct levels onto the same indent. Computing
 * the value here keeps depth honest at any nesting level.
 *
 * `paddingInlineStart` (not `paddingLeft`) so RTL layouts indent from the right.
 */
export function indentStyle(depth: number): React.CSSProperties {
  const level = Math.max(0, depth);
  return { paddingInlineStart: `${BASE_INDENT_REM + level * STEP_INDENT_REM}rem` };
}

/**
 * Disclosure triangle, or an equally sized blank when the row is a leaf.
 *
 * Leaves still reserve the slot so every folder icon in the menu lines up on
 * the same vertical axis — the indentation is what carries depth, and a
 * missing chevron would make a leaf sit one notch left of its siblings.
 */
function Chevron({
  hasChildren,
  isExpanded,
  onToggle,
  label,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  if (!hasChildren) return <span className="w-4 shrink-0" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={(e) => {
        // The row itself navigates; the chevron must only fold the subtree.
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={isExpanded}
      aria-label={label}
      className="w-4 h-4 shrink-0 flex items-center justify-center text-text-tertiary hover:text-text-primary"
    >
      <ChevronRightIcon
        // Collapsed: points toward reading-forward direction (right in LTR, left in
        // RTL via rtl:-scale-x-100). Expanded: always points down. Tailwind composes
        // transforms as rotate() then scaleX(), so under RTL the mirrored coordinate
        // frame needs the rotation sign flipped too (rtl:-rotate-90) to still land on
        // "down" instead of "up" once combined with the mirror.
        className={`w-3.5 h-3.5 transition-transform rtl:-scale-x-100 ${
          isExpanded ? 'rotate-90 rtl:-rotate-90' : ''
        }`}
      />
    </button>
  );
}

function CountSlot({ entry, isDraft, t }: { entry: WorkingDirEntry; isDraft: boolean; t: TFunction }) {
  if (isDraft) {
    return (
      <span
        className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary"
        title={t('sessionHeader.workingDir.draftBadgeTitle')}
      >
        {t('sessionHeader.workingDir.draftBadge')}
      </span>
    );
  }
  return <span className="text-text-tertiary tabular-nums">{entry.sessionCount}</span>;
}

export function WorkingDirItem(props: Props) {
  const {
    entry,
    depth,
    isCurrent,
    isIdeRoot,
    isDraft,
    isScaffold,
    hasChildren,
    isExpanded,
    onToggle,
    onNavigate,
  } = props;
  const { t } = useTranslation('chat');
  const href = withWorkingDir(routeToPath(Route.NEW_SESSION), entry.path);
  const indent = indentStyle(depth);

  const toggleLabel = t(
    isExpanded
      ? 'sessionHeader.workingDir.collapseSubtree'
      : 'sessionHeader.workingDir.expandSubtree',
    { name: entry.name },
  );

  // Fill carries the meaning, so no accent hue is needed: a solid folder is a
  // directory that has actually hosted sessions, a hollow one has not.
  //
  // Two different rows render hollow, for the same underlying reason — nothing
  // has run there yet. `isScaffold` is a path segment we reconstructed and is
  // muted further because it cannot even be opened; `isDraft` is a real, still
  // clickable working dir the user just picked, so it keeps the normal tone.
  const isEmptyFolder = isScaffold || isDraft;
  const folderIcon = isEmptyFolder ? (
    <FolderIcon
      className={`w-4 h-4 shrink-0 ${isScaffold ? 'text-text-tertiary' : 'text-text-secondary'}`}
      aria-hidden="true"
    />
  ) : (
    <FolderSolidIcon className="w-4 h-4 shrink-0 text-text-secondary" aria-hidden="true" />
  );

  const chevron = (
    <Chevron
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      onToggle={onToggle}
      label={toggleLabel}
    />
  );

  if (isScaffold) {
    return (
      <div
        className="flex items-center gap-1.5 py-1.5 pe-2.5 text-xs cursor-default text-text-tertiary min-w-full"
        style={indent}
      >
        {chevron}
        {folderIcon}
        <span className="flex-1 whitespace-nowrap">{entry.name}</span>
      </div>
    );
  }

  if (isCurrent) {
    return (
      <div
        className="flex items-center gap-1.5 py-1.5 pe-2.5 text-xs cursor-default text-text-primary bg-[var(--surface-selected)] font-medium min-w-full"
        style={indent}
        aria-current="true"
      >
        {chevron}
        {folderIcon}
        {isIdeRoot && (
          <span className="text-accent-default" title={t('sessionHeader.workingDir.ideRootTitle')} aria-hidden="true">
            ★
          </span>
        )}
        <span className="flex-1 whitespace-nowrap">{entry.name}</span>
        <CountSlot entry={entry} isDraft={isDraft} t={t} />
      </div>
    );
  }

  return (
    <Link
      to={href}
      onClick={(e) => {
        // Modifier-key clicks (cmd/ctrl/shift/middle) fall through to the host
        // default, which is "open in new tab" on supported shells. Only plain
        // left-clicks close the dropdown via SPA navigation.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        onNavigate();
      }}
      className="flex items-center gap-1.5 py-1.5 pe-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-[var(--surface-hover)] min-w-full"
      style={indent}
    >
      {chevron}
      {folderIcon}
      {isIdeRoot && (
        <span className="text-accent-default" title={t('sessionHeader.workingDir.ideRootTitle')} aria-hidden="true">
          ★
        </span>
      )}
      <span className="flex-1 whitespace-nowrap">{entry.name}</span>
      <CountSlot entry={entry} isDraft={isDraft} t={t} />
    </Link>
  );
}
