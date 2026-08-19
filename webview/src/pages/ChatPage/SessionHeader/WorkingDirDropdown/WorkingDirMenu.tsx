import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Route, routeToPath } from '@/router/routes';
import { ClassifiedWorkingDirs, WorkingDirEntry } from './classifyWorkingDirs';
import { WorkingDirItem } from './WorkingDirItem';
import { useTranslation } from '@/i18n';
import { isMobile } from '@/config/environment';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import {
  isSameWorkingDir,
  relativeWorkingDir,
  workingDirName,
  workingDirSegments,
} from '@/shared';

interface Props {
  classified: ClassifiedWorkingDirs;
  /** Where the tree is rooted — the directory the user is browsing. */
  currentPath: string | null;
  /** Which row is highlighted; differs from [currentPath] for a nested session. */
  selectedPath: string | null;
  ideRoot: string | null;
  isLoading: boolean;
  /** A fetch is in flight; the refresh button spins and stops accepting clicks. */
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Whether the session list spans directories nested under the anchor. */
  includeNested: boolean;
  onToggleIncludeNested: (next: boolean) => void;
  onNavigate: () => void;
  onAddWorkingDir: () => void;
}

export interface DisplayNode {
  entry: WorkingDirEntry;
  depth: number;
  isCurrent: boolean;
  isIdeRoot: boolean;
  isDraft: boolean;
  /**
   * Structural row reconstructed to carry the tree shape (e.g. `packages/`
   * between the repo root and `packages/webview`). It is not a registered
   * working directory, so it renders unclickable with no session count.
   */
  isScaffold: boolean;
  /** Path of the row this one hangs off, or null for the top-level rows. */
  parentPath: string | null;
  hasChildren: boolean;
}

function pathSegments(path: string): number {
  return workingDirSegments(path).length;
}

/**
 * Render [descendants] as a real tree under [rootPath].
 *
 * Working dirs nest at arbitrary depth (`packages/claude-code-battery` sits two
 * levels below the repo root), and the folders in between are usually not
 * working dirs themselves. Those gaps are filled with scaffold rows so the
 * nesting reads as a folder tree instead of a flat list of long paths.
 *
 * Depth is carried by indentation alone; each row also reports its parent so
 * the menu can fold whole subtrees.
 */
function buildDescendantNodes(
  descendants: WorkingDirEntry[],
  rootPath: string,
  baseDepth: number,
  selected: string | null,
): DisplayNode[] {
  // Collect every path level between [rootPath] and each descendant, so the
  // intermediate folders exist as nodes even when nobody ran claude in them.
  const known = new Map<string, WorkingDirEntry>();
  const allPaths = new Set<string>();

  // Scaffold paths are built by re-joining segments onto [rootPath], so they
  // must use the separator the real paths already use — otherwise a Windows
  // subtree would grow forward-slash rows that no longer match the entries
  // they stand for.
  const separator = rootPath.includes('\\') && !rootPath.includes('/') ? '\\' : '/';

  descendants.forEach((entry) => {
    known.set(entry.path, entry);
    const relative = relativeWorkingDir(entry.path, rootPath);
    if (relative === null) return;
    let acc = rootPath;
    relative.split('/').forEach((segment) => {
      acc = `${acc}${separator}${segment}`;
      allPaths.add(acc);
    });
  });

  // parent path → its children, so each group can resolve its own last item.
  const childrenOf = new Map<string, string[]>();
  allPaths.forEach((path) => {
    const parent = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(path);
    else childrenOf.set(parent, [path]);
  });
  childrenOf.forEach((paths) => paths.sort((a, b) => a.localeCompare(b)));

  const nodes: DisplayNode[] = [];

  // The direct children of [rootPath] report it as their parent, so collapsing
  // the current row folds the whole descendant tree in one step.
  const walk = (parentPath: string) => {
    const children = childrenOf.get(parentPath) ?? [];
    children.forEach((path) => {
      const depth = Math.max(0, pathSegments(path) - baseDepth);
      const entry = known.get(path);

      nodes.push({
        entry: entry ?? {
          name: workingDirName(path),
          path,
          sessionCount: 0,
          lastModified: new Date(0).toISOString(),
        },
        depth,
        isCurrent: !!selected && isSameWorkingDir(path, selected),
        isIdeRoot: false,
        isDraft: false,
        isScaffold: !entry,
        parentPath,
        hasChildren: (childrenOf.get(path) ?? []).length > 0,
      });

      walk(path);
    });
  };

  walk(rootPath);
  return nodes;
}

/**
 * Flatten the classified entries into a depth-tagged list.
 *
 * Layout order, top to bottom:
 *   1. IDE root (★ anchor) — unless [current] IS the IDE root
 *   2. ancestors chain
 *   3. parent's children (siblings + current), sorted by path. The [current]
 *      entry within this group is highlighted as selected.
 *   4. current's descendants at any depth, nested as a folder tree under
 *      [current], with the in-between folders filled in as scaffold rows.
 *
 * Depth is real path-segment depth relative to the shallowest visible node,
 * so a `webview/` sitting under the IDE root nests one step. Nesting is shown
 * with indentation plus a folder icon and a disclosure chevron — the same
 * vocabulary the host IDE's project tree uses.
 */
export function buildDisplayNodes(
  classified: ClassifiedWorkingDirs,
  currentPath: string | null,
  /**
   * The row to highlight. Defaults to the anchor, which is the ordinary case;
   * it differs once a session nested under the anchor is open, where the tree
   * stays rooted where the user is browsing while the highlight follows the
   * directory that session actually runs in.
   */
  selectedPath?: string | null,
): DisplayNode[] {
  const selected = selectedPath ?? currentPath;
  const { ancestors, current, siblings, descendants, ideRootEntry, currentIsDraft } = classified;

  const topAnchor =
    ideRootEntry ?? ancestors[0] ?? current ?? siblings[0] ?? descendants[0] ?? null;
  if (!topAnchor) return [];
  const baseDepth = pathSegments(topAnchor.path);

  const nodes: DisplayNode[] = [];

  if (ideRootEntry && ideRootEntry.path !== currentPath) {
    nodes.push({
      entry: ideRootEntry,
      depth: 0,
      isCurrent: false,
      isIdeRoot: true,
      isDraft: false,
      isScaffold: false,
      parentPath: null,
      hasChildren: false,
    });
  }

  ancestors.forEach((entry) => {
    const depth = Math.max(0, pathSegments(entry.path) - baseDepth);
    nodes.push({
      entry,
      depth,
      isCurrent: false,
      isIdeRoot: false,
      isDraft: false,
      isScaffold: false,
      parentPath: null,
      hasChildren: false,
    });
  });

  if (current) {
    const merged: WorkingDirEntry[] = [...siblings, current].sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    merged.forEach((entry) => {
      const isAnchorRow = entry.path === current.path;
      const depth = Math.max(0, pathSegments(entry.path) - baseDepth);

      nodes.push({
        entry,
        depth,
        isCurrent: entry.path === selected,
        isIdeRoot: ideRootEntry?.path === entry.path,
        isDraft: isAnchorRow && currentIsDraft,
        isScaffold: false,
        parentPath: null,
        // Only the anchor row hosts the descendant subtree below it.
        hasChildren: isAnchorRow && descendants.length > 0,
      });

      if (isAnchorRow) {
        nodes.push(...buildDescendantNodes(descendants, current.path, baseDepth, selected));
      }
    });
  }

  return nodes;
}

/**
 * Drop the rows sitting beneath a collapsed row.
 *
 * Walks the whole parent chain rather than checking the direct parent alone,
 * so folding a branch high in the tree takes its entire subtree with it — a
 * grandchild must not survive its grandparent being collapsed.
 */
export function visibleUnder(
  nodes: DisplayNode[],
  collapsed: ReadonlySet<string>,
): DisplayNode[] {
  if (collapsed.size === 0) return nodes;
  const byPath = new Map(nodes.map((n) => [n.entry.path, n]));

  return nodes.filter((node) => {
    let ancestor = node.parentPath;
    while (ancestor) {
      if (collapsed.has(ancestor)) return false;
      ancestor = byPath.get(ancestor)?.parentPath ?? null;
    }
    return true;
  });
}

export function WorkingDirMenu(props: Props) {
  const {
    classified,
    currentPath,
    selectedPath,
    isLoading,
    isRefreshing,
    onRefresh,
    includeNested,
    onToggleIncludeNested,
    onNavigate,
    onAddWorkingDir,
  } = props;
  const { t } = useTranslation('chat');
  const nodes = buildDisplayNodes(classified, currentPath, selectedPath);

  // Track only what is COLLAPSED, so "everything expanded" is the empty set —
  // the default needs no seeding and stays correct when the tree changes shape
  // underneath it. The menu unmounts on close, which resets this by itself:
  // the fold is a way to read the current tree, not a preference to remember.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const visibleNodes = useMemo(() => visibleUnder(nodes, collapsed), [nodes, collapsed]);

  const handleFooterClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    onNavigate();
  };

  return (
    <div
      // Mobile pins the panel to the viewport edges, matching the session
      // dropdown. On desktop `w-[22rem]` is the FLOOR, not the width: deep
      // trees push the panel wider (`w-max`) until it reaches the viewport,
      // so a long nested path stays readable instead of being truncated.
      className={[
        'absolute top-full mt-1 bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50',
        isMobile()
          ? 'start-2 end-2'
          : 'start-0 w-max min-w-[22rem] max-w-[calc(100vw-1rem)]',
      ].join(' ')}
      role="menu"
    >
      <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-b border-border-default">
        <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary cursor-pointer">
          <span className="whitespace-nowrap">{t('sessionHeader.workingDir.includeNested')}</span>
          <ToggleSwitch
            checked={includeNested}
            onChange={onToggleIncludeNested}
            size="small"
            ariaLabel={t('sessionHeader.workingDir.includeNested')}
          />
        </label>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={t('sessionHeader.workingDir.refreshTitle')}
          aria-label={t('sessionHeader.workingDir.refreshTitle')}
          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-hover)] disabled:hover:bg-transparent"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading && nodes.length === 0 ? (
        <div className="px-2.5 py-3 text-xs text-text-tertiary text-center">
          {t('sessionHeader.workingDir.loading')}
        </div>
      ) : nodes.length === 0 ? (
        <div className="px-2.5 py-3 text-xs text-text-tertiary text-center">
          {t('sessionHeader.workingDir.noWorkingDirectoriesFound')}
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {visibleNodes.map((node) => (
            <WorkingDirItem
              key={node.entry.path}
              entry={node.entry}
              depth={node.depth}
              isCurrent={node.isCurrent}
              isIdeRoot={node.isIdeRoot}
              isDraft={node.isDraft}
              isScaffold={node.isScaffold}
              hasChildren={node.hasChildren}
              isExpanded={!collapsed.has(node.entry.path)}
              onToggle={() => toggle(node.entry.path)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      <div className="w-full grid grid-cols-2 text-xs text-text-secondary border-t border-border-default">
        <Link
          to={routeToPath(Route.PROJECT_SELECTOR)}
          onClick={handleFooterClick}
          className="px-2.5 py-2 hover:text-text-primary hover:bg-[var(--surface-hover)] border-e border-border-default"
        >
          <span className="block text-center scale-90">{t('sessionHeader.workingDir.browseAll')}</span>
        </Link>

        <button
          type="button"
          onClick={onAddWorkingDir}
          className="px-2.5 py-2 hover:text-text-primary hover:bg-[var(--surface-hover)]"
        >
          <span className="block text-center scale-90">{t('sessionHeader.workingDir.addNew')}</span>
        </button>
      </div>
    </div>
  );
}
