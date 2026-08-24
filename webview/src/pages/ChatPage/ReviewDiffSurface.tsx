import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDiff, EditProvider, type FileContents } from '@pierre/diffs/react';
import type { DiffLineAnnotation, EditorChange, EditorChangeEvent } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { Editor } from '@pierre/diffs/edit';
import { useThemeContext } from '@/contexts/ThemeContext';
import type { DiffPreview } from '@/api/modules/ToolsApi';
import { HunkActions } from '../DiffPage/HunkActions';
import type { HunkDecisions } from '../DiffPage/useHunkDecisions';
import { useResolvedDiff } from '../DiffPage/useResolvedDiff';
import { changeBlocksOf, blockAnchorLine } from '../DiffPage/changeBlocks';

/** What a hunk's annotation carries: which hunk its control decides. */
interface HunkAnnotation {
  hunkIndex: number;
}

interface Props {
  preview: DiffPreview;
  /**
   * The proposed side as it stands, edits included. The diff is built from
   * this rather than from `preview.newContent`, so resolving one hunk does not
   * rebuild the file from the untouched proposal and drop every edit with it.
   */
  proposedContents: string;
  /** Called with the full text and the ranges that changed, after every edit. */
  onEdit: (contents: string, changes: readonly EditorChange[]) => void;
  /**
   * What the reviewer has answered per hunk, and how to answer. Absent draws no
   * per-hunk controls at all, which is the case for a change the backend could
   * not split — there the decision is whole-file.
   */
  decisions?: HunkDecisions;
  /** Whether the reviewer has typed inside a given hunk. */
  isHunkEdited?: (hunkIndex: number) => boolean;
  /** Discard what was typed in a hunk, back to what Claude proposed. */
  onResetHunk?: (hunkIndex: number) => void;
}

/**
 * The rendered half of the review diff, kept in its own module so the diff
 * renderer stays out of the main bundle (see the lazy import in ReviewDiff).
 *
 * The proposed side is editable for the same reason the IDE's is (#305): a
 * reviewer who spots a small slip should be able to correct it rather than
 * describe it back to the agent. The original side is not — it shows the file
 * as it is on disk, where typing would look like an edit while changing
 * nothing.
 */
export default function ReviewDiffSurface({
  preview,
  proposedContents,
  onEdit,
  decisions,
  isHunkEdited = () => false,
  onResetHunk = () => {},
}: Props) {
  const { isDark } = useThemeContext();

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<HunkAnnotation>) => {
      if (!decisions) return null;
      const index = annotation.metadata.hunkIndex;
      return (
        <HunkActions
          decision={decisions.decisionFor(index)}
          isEdited={isHunkEdited(index)}
          onAccept={() => decisions.keep(index)}
          onDeny={() => decisions.undo(index)}
          onReset={() => onResetHunk(index)}
          onBack={() => decisions.reset(index)}
        />
      );
    },
    [decisions, isHunkEdited, onResetHunk],
  );

  const originalDiff = useMemo(() => {
    const name = preview.filePath.split(/[\\/]/).pop() ?? preview.filePath;
    const oldFile: FileContents = { name, contents: preview.oldContent };
    // The edited text, not the proposal: see `proposedContents`.
    const newFile: FileContents = { name, contents: proposedContents };
    return parseDiffFromFile(oldFile, newFile);
  }, [preview.filePath, preview.oldContent, proposedContents]);

  /*
   * One control per hunk, anchored to the first proposed line it touches.
   *
   * The annotation carries the hunk index rather than a rendered node, so the
   * control below re-reads the current state on every draw — an annotation list
   * rebuilt on each toggle would restart the edit session underneath it.
   *
   * Anchored to the first line the hunk CHANGES, not where the hunk begins —
   * a hunk starts three lines of context earlier, and a control sitting beside
   * an unchanged line reads as deciding that line. See firstChangedLine.
   */
  const lineAnnotations = useMemo<DiffLineAnnotation<HunkAnnotation>[]>(() => {
    if (!decisions) return [];
    // From the ORIGINAL diff, not the resolved one: an answered block collapses
    // to context there, and its control has to stay put so Back can reach it.
    return changeBlocksOf(originalDiff).map((block) => ({
      side: 'additions' as const,
      lineNumber: blockAnchorLine(block),
      metadata: { hunkIndex: block.index },
    }));
  }, [decisions, originalDiff]);

  // An answered hunk collapses to context, so what stays on screen is what is
  // left to decide. Replayed from the original every time — see useResolvedDiff.
  const fileDiff = useResolvedDiff(originalDiff, decisions);

  // One editor per surface. Defined here rather than inline so the provider
  // does not rebuild it on every render, which would restart the edit session
  // and lose the reviewer's undo history.
  const createEditor = useCallback(
    (options: ConstructorParameters<typeof Editor>[0]) => new Editor(options),
    [],
  );

  const editorOptions = useMemo(
    () => ({
      onChange: (file: FileContents, _annotations: unknown, event: EditorChangeEvent<unknown>) =>
        onEdit(file.contents, event.changes),
    }),
    [onEdit],
  );

  // Side-by-side halves the room each side gets. A full window has room for it;
  // a narrow overlay does not, and below the threshold every line wraps or
  // scrolls away — so one column above it and stacked below. Measured from the
  // host element rather than the viewport, because what matters is the width
  // this surface actually got, not the size of the screen around it.
  const hostRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= SPLIT_MIN_WIDTH);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const options = useMemo(
    () => ({
      diffStyle: (wide ? 'split' : 'unified') as 'split' | 'unified',
      themeType: (isDark ? 'dark' : 'light') as 'dark' | 'light',
    }),
    [wide, isDark],
  );

  return (
    <div ref={hostRef} className="review-diff-surface">
      <EditProvider createEditor={createEditor}>
        <FileDiff
          fileDiff={fileDiff}
          options={options}
          edit
          editorOptions={editorOptions}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
        />
      </EditProvider>
    </div>
  );
}

/** Narrower than this and each side of a split view is too thin to read. */
const SPLIT_MIN_WIDTH = 720;
