/**
 * Reviewing a proposed edit without an IDE.
 *
 * This is the whole review on hosts where `BrowserBridge.openDiff` is a no-op,
 * so the decisions it sends are the ones that write files — chiefly that Apply
 * carries the reviewer's edit and Reject never does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReviewDiff } from '../ReviewDiff';

interface ResolveDiffCall {
  toolUseId: string;
  controlRequestId: string;
  sessionId: string;
  acceptedRanges: unknown[];
  editedContent?: string;
}

const getDiffPreview = vi.fn();
const resolveDiff = vi.fn(async (_params: ResolveDiffCall) => undefined);
// One stable object: the component refetches when `api` changes identity, so a
// fresh literal per render would reload forever.
const api = { tools: { getDiffPreview, resolveDiff } };
vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => api,
}));

// The renderer itself is exercised by its own package; here it stands in as a
// surface that reports edits, so the decision logic is what gets tested.
vi.mock('../ReviewDiffSurface', () => ({
  default: ({ onEdit }: { onEdit: (contents: string) => void }) => (
    <button type="button" onClick={() => onEdit('edited by hand\n')}>
      simulate-edit
    </button>
  ),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('ReviewDiff', () => {
  it('shows the file under review', async () => {
    render(<ReviewDiff toolUseId="toolu_1" />);
    expect(await screen.findByText('cart.js')).toBeInTheDocument();
  });

  it('draws nothing for a request that was already answered', async () => {
    // The fetch lost a race with the decision; an empty panel is right, an
    // error is not.
    getDiffPreview.mockResolvedValue(null);
    const { container } = render(<ReviewDiff toolUseId="toolu_1" />);
    await waitFor(() => expect(getDiffPreview).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).not.toContain('cart.js'));
  });

  it('applies without an edit when the reviewer only looked', async () => {
    // No editedContent means the backend lets Claude's own call through, which
    // is what an untouched review must do.
    render(<ReviewDiff toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('reviewDiff.apply'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    expect(answer().editedContent).toBeUndefined();
    expect(answer().acceptedRanges.length).toBe(1);
  });

  it('sends the reviewer text when they edited the proposal (#305)', async () => {
    render(<ReviewDiff toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('simulate-edit'));
    fireEvent.click(screen.getByText('reviewDiff.apply'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    expect(answer().editedContent).toBe('edited by hand\n');
  });

  it('discards the edit when the reviewer rejects', async () => {
    // Refusing a change is not a way to write a different one.
    render(<ReviewDiff toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('simulate-edit'));
    fireEvent.click(screen.getByText('reviewDiff.reject'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    const sent = answer();
    expect(sent.editedContent).toBeUndefined();
    expect(sent.acceptedRanges).toEqual([]);
  });

  it('quotes the ids the CLI is waiting on', async () => {
    render(<ReviewDiff toolUseId="toolu_1" />);
    fireEvent.click(await screen.findByText('reviewDiff.apply'));

    await waitFor(() => expect(resolveDiff).toHaveBeenCalled());
    const sent = answer();
    expect(sent.toolUseId).toBe('toolu_1');
    expect(sent.controlRequestId).toBe('ctrl-1');
    expect(sent.sessionId).toBe('sess-1');
  });
});
