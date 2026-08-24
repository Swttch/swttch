/**
 * What the renderer is told when the reviewer answers a hunk.
 *
 * The renderer redraws on identity: it compares the `fileDiff` it was handed
 * with the one it holds, and the `lineAnnotations` array likewise. Hand it the
 * same objects and it keeps what is on screen — which is correct while nothing
 * has changed, and a bug the moment something has.
 *
 * Answering a hunk changes the diff (the block collapses to context), so a new
 * `fileDiff` has to arrive. Answering does NOT change where the controls live,
 * so the same annotations array should. Both halves are asserted here because
 * getting either backwards is invisible until you click Accept and nothing
 * happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { parseDiffFromFile } from '@pierre/diffs';
import type { DiffPreview } from '@/api/modules/ToolsApi';
import { useHunkDecisions } from '../../DiffPage/useHunkDecisions';
import { changeBlocksOf } from '../../DiffPage/changeBlocks';

/** Every (fileDiff, lineAnnotations) pair the renderer was handed, in order. */
const handed: { fileDiff: unknown; lineAnnotations: unknown }[] = [];

vi.mock('@pierre/diffs/react', () => ({
  FileDiff: (props: Record<string, unknown>) => {
    handed.push({ fileDiff: props.fileDiff, lineAnnotations: props.lineAnnotations });
    return null;
  },
  EditProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@pierre/diffs/edit', () => ({
  Editor: class {
    edit() {
      return () => {};
    }
    cleanUp() {}
  },
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useThemeContext: () => ({ isDark: true }),
}));

// Two edits far apart, so there are two blocks to answer independently.
const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const after = before.replace('line 5', 'FIVE').replace('line 16', 'SIXTEEN');

const preview = {
  filePath: '/tmp/f.txt',
  oldContent: before,
  newContent: after,
} as DiffPreview;

const blocks = changeBlocksOf(
  parseDiffFromFile({ name: 'f.txt', contents: before }, { name: 'f.txt', contents: after }),
);

/** Drives the surface the way DiffPage does, exposing `keep` to the test. */
function Harness({ onReady }: { onReady: (keep: (i: number) => void) => void }) {
  const decisions = useHunkDecisions(blocks);
  onReady(decisions.keep);
  // Imported lazily so the mocks above are in place first.
  const Surface = Surfaces.current!;
  return (
    <Surface
      preview={preview}
      proposedContents={after}
      onEdit={() => {}}
      decisions={decisions}
    />
  );
}

const Surfaces: { current: React.ComponentType<Record<string, unknown>> | null } = {
  current: null,
};

beforeEach(async () => {
  handed.length = 0;
  const mod = await import('../ReviewDiffSurface');
  Surfaces.current = mod.default as unknown as React.ComponentType<Record<string, unknown>>;
});

describe('when the reviewer answers a hunk', () => {
  it('hands the renderer a new fileDiff, so the answered block leaves the screen', () => {
    // The reported symptom: Accept flips the controls to Reset/Back — that is
    // local state — but the diff underneath keeps showing the hunk, because the
    // renderer was handed the object it already had and redrew nothing.
    let keep!: (i: number) => void;
    render(<Harness onReady={(k) => { keep = k; }} />);

    const before_ = handed[handed.length - 1].fileDiff;
    act(() => keep(0));
    const after_ = handed[handed.length - 1].fileDiff;

    expect(after_).not.toBe(before_);
  });

  it('hands it the same annotations array, so the edit session survives', () => {
    // The other half. A new array here rebuilds the whole view and takes the
    // reviewer's edit session with it — which is what made typing impossible.
    let keep!: (i: number) => void;
    render(<Harness onReady={(k) => { keep = k; }} />);

    const before_ = handed[handed.length - 1].lineAnnotations;
    act(() => keep(0));
    const after_ = handed[handed.length - 1].lineAnnotations;

    expect(after_).toBe(before_);
  });

  it('keeps handing the same objects while nothing is answered', () => {
    // A re-render that changes nothing must change neither, or the session dies
    // on every unrelated render — the state this page was in before the fix.
    const { rerender } = render(<Harness onReady={() => {}} />);

    const first = handed[handed.length - 1];
    rerender(<Harness onReady={() => {}} />);
    const second = handed[handed.length - 1];

    expect(second.fileDiff).toBe(first.fileDiff);
    expect(second.lineAnnotations).toBe(first.lineAnnotations);
  });
});
