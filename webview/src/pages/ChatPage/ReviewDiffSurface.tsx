import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDiff, EditProvider, type FileContents } from '@pierre/diffs/react';
import { parseDiffFromFile } from '@pierre/diffs';
import { Editor } from '@pierre/diffs/edit';
import { useThemeContext } from '@/contexts/ThemeContext';
import type { DiffPreview } from '@/api/modules/ToolsApi';

interface Props {
  preview: DiffPreview;
  /** Called with the proposed side's full text after every edit. */
  onEdit: (contents: string) => void;
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
export default function ReviewDiffSurface({ preview, onEdit }: Props) {
  const { isDark } = useThemeContext();

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

  // Side-by-side halves the room each side gets, and this sits inside the chat
  // column rather than a full window. Below the threshold every line wraps or
  // scrolls away, so one column above it and stacked below.
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
        <FileDiff fileDiff={fileDiff} options={options} edit editorOptions={editorOptions} />
      </EditProvider>
    </div>
  );
}

/** Narrower than this and each side of a split view is too thin to read. */
const SPLIT_MIN_WIDTH = 720;
