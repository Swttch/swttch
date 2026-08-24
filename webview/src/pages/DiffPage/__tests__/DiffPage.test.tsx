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
// The same two the page uses to work out what the reviewer is deciding on, so
// these tests expect what it will actually produce rather than a copy of it.
import { parseDiffFromFile } from '@pierre/diffs';
import { changeBlocksOf, blockToAcceptedRange } from '../changeBlocks';

/** A file of [rows], newline-terminated the way a real one is. */
function lines(rows: string[]): string {
  return rows.map((row) => `${row}\n`).join('');
}

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
    decisions,
  }: {
    onEdit: (contents: string, changes: readonly { range: unknown }[]) => void;
    decisions?: {
      keep: (i: number) => void;
      undo: (i: number) => void;
      reset: (i: number) => void;
      total: number;
    };
  }) => (
    <>
      {/* The editor reports the whole text plus the ranges it replaced; the
          range here covers hunk 0's lines so the page marks it as edited. */}
      <button
        type="button"
        onClick={() =>
          onEdit('edited by hand\n', [
            { range: { start: { line: 9, character: 0 }, end: { line: 13, character: 0 } } },
          ])
        }
      >
        simulate-edit
      </button>
      {/* Three per hunk, so a test can answer exactly the one it means to.
          Absent when the page passes no decisions, which is worth asserting. */}
      {decisions
        ? Array.from({ length: decisions.total }, (_, i) => (
            <span key={i}>
              <button type="button" onClick={() => decisions.keep(i)}>{`keep-${i}`}</button>
              <button type="button" onClick={() => decisions.undo(i)}>{`undo-${i}`}</button>
              <button type="button" onClick={() => decisions.reset(i)}>{`reset-${i}`}</button>
            </span>
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
  it('says which file is under review, and that it is a diff', async () => {
    // Named the way the tab is. Collapsed to a single strip above the approval
    // prompt, a bare file name does not say what the strip IS — the word is
    // what makes it read as a review rather than a second prompt.
    render(<DiffPage toolUseId="toolu_1" />);
    expect(await screen.findByText('Diff: cart.js')).toBeInTheDocument();
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
    /*
     * A change split in two, far enough apart that no grouping could merge them.
     *
     * Given as file CONTENT rather than as a hunk list because that is what the
     * page decides on: it diffs the two sides itself and attaches controls to
     * what the renderer draws, so a hunk list handed to it would decide nothing.
     */
    const oldContent = lines(['a', 'b', 'c', 'ORIGINAL ONE', 'e', 'f', 'g', 'h', 'i', 'ORIGINAL TWO', 'k']);
    const newContent = lines(['a', 'b', 'c', 'CHANGED ONE', 'e', 'f', 'g', 'h', 'i', 'CHANGED TWO', 'k']);

    // What the page will find in that content, derived the same way it derives
    // it — writing the ranges out by hand here would just be a second, unchecked
    // copy of changeBlocksOf.
    const blocks = changeBlocksOf(
      parseDiffFromFile({ name: 'cart.js', contents: oldContent }, { name: 'cart.js', contents: newContent }),
    );
    const rangeOf = (i: number) => blockToAcceptedRange(blocks[i]);

    beforeEach(() => {
      getDiffPreview.mockResolvedValue({ ...preview, oldContent, newContent });
    });

    // The rest of this block is meaningless if the content above collapses into
    // one change, and it would still "pass" for the wrong reason.
    it('is a change the page sees as two', () => {
      expect(blocks).toHaveLength(2);
    });

    it('writes every hunk when the reviewer answers none of them', async () => {
      // They are reading a proposal, not assembling one: an untouched hunk is
      // taken, which is what Confirm meant before any of this existed.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([rangeOf(0), rangeOf(1)]);
    });

    it('leaves out a hunk the reviewer undid', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('undo-0'));
      fireEvent.click(screen.getByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([rangeOf(1)]);
    });

    it('keeps a hunk the reviewer kept', async () => {
      // Keeping is the same outcome as leaving it alone; what changes is that
      // the hunk stops being drawn as an open question.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('keep-0'));
      fireEvent.click(screen.getByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([rangeOf(0), rangeOf(1)]);
    });

    // Reset is the whole reason the decisions are replayed onto an untouched
    // original rather than accumulated: an answered hunk has to be recoverable.
    it('puts an undone hunk back when it is reset', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('undo-0'));
      fireEvent.click(screen.getByText('reset-0'));
      fireEvent.click(screen.getByText('diffPage.confirm'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([rangeOf(0), rangeOf(1)]);
    });

    // Confirming with nothing left would answer "no" under a button that says
    // "Confirm". The reviewer has to say that with Cancel, which does say it.
    it('will not confirm once every hunk is undone', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('undo-0'));
      fireEvent.click(screen.getByText('undo-1'));

      const confirm = screen.getByText('diffPage.confirm');
      expect(confirm).toBeDisabled();

      fireEvent.click(confirm);
      expect(resolveDiff).not.toHaveBeenCalled();
    });

    it('confirms again once an undone hunk is reset', async () => {
      // The button must come back, not stay dead for the rest of the review.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('undo-0'));
      fireEvent.click(screen.getByText('undo-1'));
      fireEvent.click(screen.getByText('reset-0'));

      expect(screen.getByText('diffPage.confirm')).not.toBeDisabled();
    });

    it('ignores the picking when the reviewer cancels outright', async () => {
      // Cancel is not "write what is left" — it answers no to the request.
      render(<DiffPage toolUseId="toolu_1" />);
      fireEvent.click(await screen.findByText('keep-0'));
      fireEvent.click(screen.getByText('diffPage.cancel'));

      await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
      expect(answer().acceptedRanges).toEqual([]);
    });
  });

  /**
   * Folding the diff away without answering it.
   *
   * The same gesture the approval and question panels offer, and it has to mean
   * the same thing here: the request stays open, only the code stops taking the
   * screen.
   */
  describe('collapsing', () => {
    /** The chevron beside the file name, by the label it wears. */
    const toggle = () => screen.getByLabelText('promptPanel.collapse');

    /**
     * The page as an overlay, which is the only place folding means anything.
     *
     * A page filling a window of its own covers nothing, so there is nothing to
     * uncover — see the sibling describe, which asserts it does not offer to.
     */
    const renderOverlay = () => render(<DiffPage toolUseId="toolu_1" isOverlay />);

    it('hides the diff', async () => {
      renderOverlay();
      // Drawn by the surface, so its absence is the diff being gone rather than
      // some wrapper losing its height.
      expect(await screen.findByText('simulate-edit')).toBeInTheDocument();

      fireEvent.click(toggle());
      expect(screen.queryByText('simulate-edit')).not.toBeInTheDocument();
    });

    it('leaves the request open', async () => {
      // Folding the diff away is not answering it. The request stays up — on
      // the approval prompt this bar sits above, and here in the page itself,
      // which must not have resolved anything on its way to being collapsed.
      renderOverlay();
      await screen.findByText('diffPage.confirm');

      fireEvent.click(toggle());

      // Establishes that the page really did collapse; without it this would
      // pass against a page that ignores the chevron altogether.
      expect(screen.queryByText('simulate-edit')).not.toBeInTheDocument();
      expect(screen.getByText('Diff: cart.js')).toBeInTheDocument();
      expect(resolveDiff).not.toHaveBeenCalled();
    });

    it('brings the diff back', async () => {
      renderOverlay();
      await screen.findByText('simulate-edit');

      fireEvent.click(toggle());
      // Asserted on the way through, so this cannot pass by the diff never
      // having gone anywhere — which is exactly how it passed against a page
      // that had lost its collapse entirely.
      expect(screen.queryByText('simulate-edit')).not.toBeInTheDocument();

      // The label follows the state, so expanding is a different button to find.
      fireEvent.click(screen.getByLabelText('promptPanel.expand'));
      expect(screen.getByText('simulate-edit')).toBeInTheDocument();
    });

    /*
     * Collapsed, this bar sits directly on top of the approval prompt, which
     * asks the same question and has its own Yes/No. Showing Confirm, Cancel
     * and the hunk count there as well is one decision offered twice.
     */
    it('shows the file and nothing else to answer with', async () => {
      renderOverlay();
      const confirm = await screen.findByText('diffPage.confirm');
      const controls = confirm.parentElement;

      fireEvent.click(toggle());

      expect(screen.getByText('Diff: cart.js')).toBeInTheDocument();
      // Asserted as the class rather than with toBeVisible, which needs real
      // CSS to know that Tailwind's `hidden` means display:none — jsdom loads
      // none, so every element there reads as visible.
      expect(controls?.className).toContain('hidden');
    });

    // A one-line strip is a small thing to ask someone to aim at, and with the
    // controls hidden there is nothing else in it to hit by mistake.
    it('expands again when the bar itself is clicked', async () => {
      renderOverlay();
      await screen.findByText('simulate-edit');
      fireEvent.click(toggle());

      // The bar, not the chevron: same element the label is on now.
      fireEvent.click(screen.getByLabelText('promptPanel.expand'));

      expect(screen.getByText('simulate-edit')).toBeInTheDocument();
    });

    it('is reachable from the keyboard', async () => {
      // The bar is a div wearing role=button, so Enter and Space have to be
      // wired by hand — a real button would have had them.
      renderOverlay();
      await screen.findByText('simulate-edit');
      fireEvent.click(toggle());

      fireEvent.keyDown(screen.getByLabelText('promptPanel.expand'), { key: 'Enter' });

      expect(screen.getByText('simulate-edit')).toBeInTheDocument();
    });

    /*
     * The overlay sizes itself to this page, so a collapsed page that still
     * claims the full height leaves a full-screen box with nothing in it —
     * which is what shipped first, and hid the very conversation the collapse
     * was meant to uncover.
     */
    it('stops claiming the whole height once collapsed', async () => {
      const { container } = renderOverlay();
      await screen.findByText('diffPage.confirm');
      const page = container.firstElementChild as HTMLElement;
      expect(page.className).toContain('h-full');

      fireEvent.click(toggle());
      expect(page.className).not.toContain('h-full');
    });
  });

  /**
   * A page filling a window of its own — an editor tab, a browser tab.
   *
   * Folding is about uncovering what the review is drawn over, and here that is
   * nothing. Offered anyway, it emptied the window: a header on a blank screen,
   * the diff gone and nothing revealed in its place.
   */
  describe('in a window of its own', () => {
    it('does not offer to fold the diff away', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      await screen.findByText('diffPage.confirm');

      expect(screen.queryByLabelText('promptPanel.collapse')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('promptPanel.expand')).not.toBeInTheDocument();
    });

    it('keeps the diff and the decisions on screen', async () => {
      // The state the missing control protects: everything stays where it is.
      render(<DiffPage toolUseId="toolu_1" />);

      expect(await screen.findByText('simulate-edit')).toBeInTheDocument();
      expect(screen.getByText('diffPage.confirm')).toBeInTheDocument();
    });
  });

  /**
   * A proposal that changes nothing.
   *
   * The one case with no blocks to decide on. Every real change has at least
   * one — an addition and a deletion are both drawn as a block, so "no blocks"
   * means the two sides are identical, which is a proposal Claude can still
   * make. Answering it whole is the only thing left to do with it.
   */
  describe('a proposal that changes nothing', () => {
    const contents = lines(['a', 'b', 'c']);

    beforeEach(() => {
      getDiffPreview.mockResolvedValue({ ...preview, oldContent: contents, newContent: contents });
    });

    // Without this, the two below would pass just as happily against a change
    // that DOES split — and would then be asserting nothing they claim to.
    it('is a proposal the page finds no blocks in', () => {
      const blocks = changeBlocksOf(
        parseDiffFromFile({ name: 'cart.js', contents }, { name: 'cart.js', contents }),
      );
      expect(blocks).toHaveLength(0);
    });

    it('offers no per-hunk controls', async () => {
      render(<DiffPage toolUseId="toolu_1" />);
      await screen.findByText('diffPage.confirm');

      expect(screen.queryByText('keep-0')).not.toBeInTheDocument();
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

      // Matched loosely: the header renders the name with a prefix, and an exact
      // 'cart.js' would miss it and pass while the header was still on screen.
      expect(screen.queryByText(/cart\.js/)).not.toBeInTheDocument();
      expect(screen.queryByText('diffPage.confirm')).not.toBeInTheDocument();
    });
  });
});
