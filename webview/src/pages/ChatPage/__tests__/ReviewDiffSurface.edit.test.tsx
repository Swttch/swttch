/**
 * Whether the proposed side actually becomes editable.
 *
 * The rest of the edit path is covered on DiffPage, but with this surface
 * mocked — so nothing asserted that the surface turns editing ON. That gap is
 * why "the proposed side is editable" could stop working without a test saying
 * so.
 *
 * Asserted against the library's own contract rather than by typing: the
 * editor attaches inside a shadow root that jsdom does not lay out, so what can
 * be checked here is that we hand `FileDiff` an editable configuration and an
 * EditProvider for it to use. Typing into it belongs to a browser check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { DiffPreview } from '@/api/modules/ToolsApi';

/** What FileDiff was rendered with, captured per test. */
let lastProps: Record<string, unknown> | null = null;
/** Whether an EditProvider was wrapped around it. */
let editProviderSeen = false;
/** Every value `edit` took, in order — the retry edge is a sequence, not a value. */
const editSeen: boolean[] = [];

vi.mock('@pierre/diffs/react', () => ({
  FileDiff: (props: Record<string, unknown>) => {
    lastProps = props;
    editSeen.push(props.edit as boolean);
    return null;
  },
  EditProvider: ({ children }: { children: React.ReactNode }) => {
    editProviderSeen = true;
    return children;
  },
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

const before = 'const timeout = 20000;\nconst retries = 3;\n';
const after = 'const timeout = 15000;\nconst retries = 3;\n';

const preview: DiffPreview = {
  filePath: '/tmp/config.ts',
  oldContent: before,
  newContent: after,
} as DiffPreview;

async function renderSurface() {
  const { default: ReviewDiffSurface } = await import('../ReviewDiffSurface');
  render(
    <ReviewDiffSurface
      preview={preview}
      proposedContents={after}
      onEdit={() => {}}
    />,
  );
}

beforeEach(() => {
  lastProps = null;
  editProviderSeen = false;
});

describe('the proposed side of a review diff', () => {
  it('is handed to the renderer in edit mode', async () => {
    // The reported symptom: typing into the proposed side did nothing. If this
    // is false the surface is read-only however the rest of the path behaves.
    await renderSurface();

    expect(lastProps?.edit).toBe(true);
  });

  it('turns edit on only after the first commit, so the attach retries', async () => {
    // The renderer attaches its editor from an effect keyed on `edit` alone,
    // and only if its instance exists. Handed `true` from the very first render
    // there is one attempt and no retry — this asserts the false → true edge
    // that gives the effect a second run with the instance in place.
    editSeen.length = 0;

    await renderSurface();

    expect(editSeen[0]).toBe(false);
    expect(editSeen[editSeen.length - 1]).toBe(true);
  });

  it('comes with the EditProvider the renderer requires for it', async () => {
    // `edit` alone throws "FileDiff: EditContext is not attached" — the two are
    // one feature, so a test for either has to hold both.
    await renderSurface();

    expect(editProviderSeen).toBe(true);
  });

  it('reports what was typed, so the answer can carry it', async () => {
    // The edit is only worth enabling if it reaches resolve(). This is the hand-
    // off point: the renderer calls onChange, and we turn it into onEdit.
    const onEdit = vi.fn();
    const { default: ReviewDiffSurface } = await import('../ReviewDiffSurface');
    render(
      <ReviewDiffSurface preview={preview} proposedContents={after} onEdit={onEdit} />,
    );

    const options = lastProps?.editorOptions as {
      onChange: (file: { contents: string }, a: unknown, e: { changes: unknown[] }) => void;
    };
    options.onChange({ contents: 'const timeout = 12345;\n' }, null, { changes: [] });

    expect(onEdit).toHaveBeenCalledWith('const timeout = 12345;\n', []);
  });
});
