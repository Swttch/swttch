import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDiff, EditProvider, type FileContents } from '@pierre/diffs/react';
import type { DiffLineAnnotation } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { Editor } from '@pierre/diffs/edit';
import { useThemeContext } from '@/contexts/ThemeContext';
import type { DiffPreview } from '@/api/modules/ToolsApi';
import { HunkControl } from '../DiffPage/HunkControl';
import type { HunkSelection } from '../DiffPage/useHunkSelection';
import { firstChangedLine } from '@/shared';

/** What a hunk's annotation carries: which hunk its control decides. */
interface HunkAnnotation {
  hunkIndex: number;
}

interface Props {
  preview: DiffPreview;
  /** Called with the proposed side's full text after every edit. */
  onEdit: (contents: string) => void;
  /**
   * Whether each hunk is being kept, and how to flip one. Absent leaves the
   * diff read-only in that sense — no per-hunk controls are drawn, and the
   * decision is whole-file.
   */
  selection?: HunkSelection;
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
export default function ReviewDiffSurface({ preview, onEdit, selection }: Props) {
  const { isDark } = useThemeContext();

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
    if (!selection) return [];
    return preview.hunks.map((hunk) => ({
      side: 'additions' as const,
      lineNumber: firstChangedLine(hunk),
      metadata: { hunkIndex: hunk.index },
    }));
  }, [selection, preview.hunks]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<HunkAnnotation>) => {
      if (!selection) return null;
      const index = annotation.metadata.hunkIndex;
      return (
        <HunkControl kept={selection.isKept(index)} onToggle={() => selection.toggle(index)} />
      );
    },
    [selection],
  );

  const fileDiff = useMemo(() => {
    const name = preview.filePath.split(/[\\/]/).pop() ?? preview.filePath;
    const oldFile: FileContents = { name, contents: preview.oldContent };
    const newFile: FileContents = { name, contents: preview.newContent };
    return parseDiffFromFile(oldFile, newFile);
  }, [preview.filePath, preview.oldContent, preview.newContent]);

  // One editor per surface. Defined here rather than inline so the provider
  // does not rebuild it on every render, which would restart the edit session
  // and lose the reviewer's undo history.
  const createEditor = useCallback(
    (options: ConstructorParameters<typeof Editor>[0]) => new Editor(options),
    [],
  );

  const editorOptions = useMemo(
    () => ({
      onChange: (file: FileContents) => onEdit(file.contents),
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
    <div ref={hostRef}>
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
