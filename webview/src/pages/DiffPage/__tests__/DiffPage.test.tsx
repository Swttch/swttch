/**
 * Reviewing a proposed edit on the built-in surface.
 *
 * These are the decisions that write files — chiefly that Confirm carries the
 * reviewer's edit and Cancel never does — so they are asserted on what actually
 * goes over the wire rather than on what the screen shows.
 *
 * Carried over from the review that used to be drawn inside the approval panel:
 * the container changed, the contract did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DiffPage } from '..';
import { hunkToAcceptedRange, type Hunk } from '@/shared';

interface ResolveDiffCall {
  toolUseId: string;
  controlRequestId: string;
  sessionId: string;
  acceptedRanges: unknown[];
  editedContent?: string;
}

const getDiffPreview = vi.fn();
const resolveDiff = vi.fn(async (_params: ResolveDiffCall) => undefined);
// One stable object: the page refetches when `api` changes identity, so a fresh
// literal per render would reload forever.
const api = { tools: { getDiffPreview, resolveDiff } };
vi.mock('@/contexts/ApiContext', () => ({
  useApi: () => api,
}));

// The renderer itself is exercised by its own package; here it stands in as a
// surface that reports edits and exposes the per-hunk controls, so the decision
// logic is what gets tested.
vi.mock('../../ChatPage/ReviewDiffSurface', () => ({
  default: ({
    onEdit,
    selection,
  }: {
    onEdit: (contents: string) => void;
    selection?: { toggle: (i: number) => void; total: number };
  }) => (
    <>
      <button type="button" onClick={() => onEdit('edited by hand\n')}>
        simulate-edit
      </button>
      {/* One per hunk, so a test can drop exactly the one it means to. Absent
          when the page passes no selection, which is itself worth asserting. */}
      {selection
        ? Array.from({ length: selection.total }, (_, i) => (
            <button key={i} type="button" onClick={() => selection.toggle(i)}>
              {`toggle-hunk-${i}`}
            </button>
          ))
        : null}
    </>
  ),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The page reads its id from the route in production; passed in directly here so
// the tests do not need a router around every render.
vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
}));

const preview = {
  filePath: '/repo/src/cart.js',
  oldContent: 'before\n',
  newContent: 'after\n',
  toolName: 'Edit',
  hunks: [],
  sessionId: 'sess-1',
  controlRequestId: 'ctrl-1',
};

beforeEach(() => {
  getDiffPreview.mockReset();
  resolveDiff.mockReset();
  getDiffPreview.mockResolvedValue(preview);
  resolveDiff.mockResolvedValue(undefined);
});

/** What the one expected call to resolveDiff carried. */
function answer(): ResolveDiffCall {
  const call = resolveDiff.mock.calls[0];
  if (!call) throw new Error('resolveDiff was never called');
  return call[0];
}

describe('DiffPage', () => {
  it('shows the file under review', async () => {
    render(<DiffPage toolUseId="toolu_1" />);
    expect(await screen.findByText('cart.js')).toBeInTheDocument();
  });

  it('applies without an edit when the reviewer only looked', async () => {
    // No editedContent means the backend lets Claude's own call through, which
    // is what an untouched review must do.
    render(<DiffPage toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('diffPage.confirm'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    expect(answer().editedContent).toBeUndefined();
    expect(answer().acceptedRanges.length).toBe(1);
  });

  it('sends the reviewer text when they edited the proposal (#305)', async () => {
    render(<DiffPage toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('simulate-edit'));
    fireEvent.click(screen.getByText('diffPage.confirm'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    expect(answer().editedContent).toBe('edited by hand\n');
  });

  it('discards the edit when the reviewer cancels', async () => {
    // Refusing a change is not a way to write a different one.
    render(<DiffPage toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('simulate-edit'));
    fireEvent.click(screen.getByText('diffPage.cancel'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    const sent = answer();
    expect(sent.editedContent).toBeUndefined();
    expect(sent.acceptedRanges).toEqual([]);
  });

  it('quotes the ids the CLI is waiting on', async () => {
    render(<DiffPage toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('diffPage.confirm'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    const sent = answer();
    expect(sent.toolUseId).toBe('toolu_1');
    expect(sent.controlRequestId).toBe('ctrl-1');
    expect(sent.sessionId).toBe('sess-1');
  });

  // The page fills a window of its own, so an answered request must not leave it
  // sitting there. Inside the chat this did not matter — the panel closed with
  // the prompt.
  it('dismisses the window once the request is answered', async () => {
    const onClose = vi.fn();
    render(<DiffPage toolUseId="toolu_1" onClose={onClose} />);
    fireEvent.click(await screen.findByText('diffPage.confirm'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  /**
   * Picking parts of a proposal.
   *
   * The ranges sent here are what the backend rebuilds the file from, so these
   * assert the wire payload rather than the screen.
   */
  describe('per-hunk picking', () => {
    // A change split in two, far enough apart to be unmistakable in a range list.
    const hunks: Hunk[] = [
      { index: 0, oldStart: 10, oldLines: 3, newStart: 10, newLines: 5, lines: [] },
      { index: 1, oldStart: 40, oldLines: 2, newStart: 42, newLines: 2, lines: [] },
    ];

    beforeEach(() => {
      getDiffPreview.mockResolvedValue({ ...preview, hunks });
    });

    it('keeps every hunk unless the reviewer says otherwise', async () => {
      // They are reading a proposal, not assembling one.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual(hunks.map(hunkToAcceptedRange));
    });

    it('leaves out the hunk the reviewer dropped', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('toggle-hunk-0'));
      fireEvent.click(screen.getByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([hunkToAcceptedRange(hunks[1])]);
    });

    // Confirming with nothing ticked would answer "no" under a button that says
    // "Confirm". The reviewer has to say that with Cancel, which does say it.
    it('will not confirm once every hunk is dropped', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('toggle-hunk-0'));
      fireEvent.click(screen.getByText('toggle-hunk-1'));

      const confirm = screen.getByText('diffPage.confirm');
      expect(confirm).toBeDisabled();

      fireEvent.click(confirm);
      expect(resolveDiff).not.toHaveBeenCalled();
    });

    it('confirms again once a hunk is put back', async () => {
      // The button must come back, not stay dead for the rest of the review.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('toggle-hunk-0'));
      fireEvent.click(screen.getByText('toggle-hunk-1'));
      fireEvent.click(screen.getByText('toggle-hunk-0'));

      expect(screen.getByText('diffPage.confirm')).not.toBeDisabled();
    });

    it('ignores the picking when the reviewer cancels outright', async () => {
      // Cancel is not "write what is ticked" — it answers no to the request.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('diffPage.cancel'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([]);
    });
  });

  /**
   * A change the backend could not split — computeHunks answers null for one too
   * large to diff, and stores an empty list. There is nothing to tick, so the
   * decision is whole-file and no controls are offered.
   */
  describe('a change with no hunks', () => {
    it('offers no per-hunk controls', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      await screen.findByText('diffPage.confirm');

      expect(screen.queryByText('toggle-hunk-0')).not.toBeInTheDocument();
    });

    it('applies the whole proposal', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toHaveLength(1);
      expect(answer().acceptedRanges[0]).toMatchObject({ oldStart: 0, newStart: 0 });
    });
  });

  describe('a request that is no longer pending', () => {
    beforeEach(() => {
      getDiffPreview.mockResolvedValue(null);
    });

    // Answered from the chat, opened twice, or reloaded long after. An empty
    // window would read as broken rather than finished.
    it('says so rather than showing an empty window', async () => {
      render(<DiffPage toolUseId="toolu_1" />);

      expect(await screen.findByText('diffPage.unavailable.title')).toBeInTheDocument();
      expect(screen.getByText('diffPage.unavailable.description')).toBeInTheDocument();
    });

    it('offers a way to close the window', async () => {
      const onClose = vi.fn();
      render(<DiffPage toolUseId="toolu_1" onClose={onClose} />);

      fireEvent.click(await screen.findByText('diffPage.close'));
      expect(onClose).toHaveBeenCalled();
    });

    it('does not show the file or the decisions', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      await screen.findByText('diffPage.unavailable.title');

      expect(screen.queryByText('cart.js')).not.toBeInTheDocument();
      expect(screen.queryByText('diffPage.confirm')).not.toBeInTheDocument();
    });
  });
});
