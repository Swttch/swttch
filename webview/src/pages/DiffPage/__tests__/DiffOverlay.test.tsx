/**
 * The review drawn over the conversation it is about.
 *
 * What is asserted here is what the overlay does that a window does not: cover
 * the chat, and stop covering it when the reviewer folds the diff away. The
 * decisions themselves belong to DiffPage and are tested there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiffOverlay } from '../DiffOverlay';
import { CHAT_FOOTER_ID } from '../../ChatPage/chatFooter';

const getDiffPreview = vi.fn();
const resolveDiff = vi.fn();
const api = { tools: { getDiffPreview, resolveDiff } };
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => api }));

// Stands in for the renderer, whose own package tests it. Its presence here is
// how a test tells "the diff is on screen" from "only the header is".
vi.mock('../../ChatPage/ReviewDiffSurface', () => ({
  default: () => <div>diff-body</div>,
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
  getDiffPreview.mockReset().mockResolvedValue(preview);
  resolveDiff.mockReset().mockResolvedValue(undefined);
});

/** The full-screen layer between the chat and the review. */
function scrim(container: HTMLElement): HTMLElement {
  const el = container.ownerDocument.body.querySelector('.fixed.inset-0');
  if (!el) throw new Error('no scrim rendered');
  return el as HTMLElement;
}

const collapseToggle = () => screen.getByLabelText('promptPanel.collapse');

describe('DiffOverlay', () => {
  it('shows the review over the chat', async () => {
    const { container } = render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);

    expect(await screen.findByText('diff-body')).toBeInTheDocument();
    expect(scrim(container).className).not.toContain('pointer-events-none');
  });

  it('closes on a click outside the review', async () => {
    const onClose = vi.fn();
    const { container } = render(<DiffOverlay toolUseId="toolu_1" onClose={onClose} />);
    await screen.findByText('diff-body');

    fireEvent.click(scrim(container));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<DiffOverlay toolUseId="toolu_1" onClose={onClose} />);
    await screen.findByText('diff-body');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  /*
   * The reason the collapse exists at all.
   *
   * Folded away, the reviewer wants to read and scroll the turn the change is
   * about. A full-screen layer that keeps taking the mouse swallows exactly
   * that, which made collapsing pointless here — the diff was gone and the chat
   * was still unreachable.
   */
  describe('collapsed', () => {
    it('lets the mouse through to the conversation', async () => {
      const { container } = render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
      await screen.findByText('diff-body');

      fireEvent.click(collapseToggle());

      await waitFor(() =>
        expect(scrim(container).className).toContain('pointer-events-none'),
      );
    });

    it('folds the diff away and brings it back', async () => {
      render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
      await screen.findByText('diff-body');

      fireEvent.click(collapseToggle());
      expect(screen.queryByText('diff-body')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('promptPanel.expand'));
      expect(screen.getByText('diff-body')).toBeInTheDocument();
    });

    /*
     * The layer gives up the mouse, so the panel has to take it back — without
     * that the chevron which expands the diff again would be dead too.
     *
     * Asserted as a class rather than by clicking, because jsdom does not
     * implement pointer-events: a click there lands on an element the browser
     * would never have delivered it to. Removing pointer-events-auto passes
     * every behavioural test in this file, which is why this one reads the
     * class instead.
     */
    it('keeps the panel itself taking the mouse', async () => {
      render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
      const panel = (await screen.findByText('diff-body')).closest(
        '.pointer-events-auto',
      );

      expect(panel).not.toBeNull();
    });

    /*
     * The bar and the approval prompt below it are two halves of one question,
     * so they line up: same measure, same gutters. Left full-width it ran past
     * the prompt on both sides and read as an unrelated thing that happened to
     * be nearby.
     */
    it('lines up with the prompt below it', async () => {
      render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
      const panel = (await screen.findByText('diff-body')).closest(
        '.pointer-events-auto',
      ) as HTMLElement;
      expect(panel.style.maxWidth).toBe('');

      fireEvent.click(collapseToggle());

      await waitFor(() => expect(panel.style.maxWidth).toBe('42rem'));
    });

    /*
     * The prompt this review belongs to lives at the bottom of the chat, which
     * is where a collapsed bar wants to be too. Stacked without allowance for it
     * the bar covered the prompt's own options and its "tell Claude" box.
     */
    it('sits clear of whatever the chat has at its bottom', async () => {
      const footer = document.createElement('div');
      footer.id = CHAT_FOOTER_ID;
      // jsdom lays nothing out, so the height has to be stated rather than
      // produced — what is under test is that the bar uses it, not that a
      // browser can measure a div.
      footer.getBoundingClientRect = () => ({ height: 180 }) as DOMRect;
      document.body.appendChild(footer);

      try {
        const { container } = render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
        await screen.findByText('diff-body');
        expect(scrim(container).style.paddingBottom).toBe('');

        fireEvent.click(collapseToggle());

        await waitFor(() => expect(scrim(container).style.paddingBottom).toBe('180px'));
      } finally {
        footer.remove();
      }
    });

    it('takes the mouse back once the diff is open again', async () => {
      const { container } = render(<DiffOverlay toolUseId="toolu_1" onClose={vi.fn()} />);
      await screen.findByText('diff-body');

      fireEvent.click(collapseToggle());
      await waitFor(() =>
        expect(scrim(container).className).toContain('pointer-events-none'),
      );

      fireEvent.click(screen.getByLabelText('promptPanel.expand'));

      await waitFor(() =>
        expect(scrim(container).className).not.toContain('pointer-events-none'),
      );
    });
  });
});
