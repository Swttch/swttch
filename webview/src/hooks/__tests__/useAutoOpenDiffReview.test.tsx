/**
 * Showing the review without being asked.
 *
 * The rules that matter here are about NOT opening: not twice for one request,
 * not for a prompt with no change in it, and not where the backend is already
 * opening it. A second window over the same question is worse than none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DiffSurface } from '@/types/settings';

const getDiffPreview = vi.fn();
const api = { tools: { getDiffPreview } };
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => api }));

const openDiffReview = vi.fn();
vi.mock('../useOpenDiffReview', () => ({ useOpenDiffReview: () => openDiffReview }));

// Both of these decide whether anyone ELSE is already opening the review, so
// every test states which host and surface it is speaking for.
const isJetBrains = vi.fn();
vi.mock('@/config/environment', () => ({ isJetBrains: () => isJetBrains() }));

const resolvedSurface = vi.fn();
vi.mock('../useIdeDiffAvailable', () => ({
  useResolvedDiffSurface: () => resolvedSurface(),
}));

import { useAutoOpenDiffReview, resetOpenedDiffReviews } from '../useAutoOpenDiffReview';

/** A change exists for this request — the shape is irrelevant, its presence is not. */
const SOME_PREVIEW = { filePath: '/repo/cart.js' };

/**
 * Let the hook's open finish.
 *
 * It awaits the preview before deciding, so a single microtask tick returns
 * while the open is still pending — asserting "did not open" at that point
 * passes against a hook that is about to. A macrotask clears the whole chain.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  getDiffPreview.mockReset().mockResolvedValue(SOME_PREVIEW);
  openDiffReview.mockReset().mockResolvedValue({ kind: 'opened' });
  // The case this hook exists for: a browser drawing the built-in page.
  isJetBrains.mockReturnValue(false);
  resolvedSurface.mockReturnValue(DiffSurface.BUILT_IN);
  // The guard outlives a mount by design, so it has to be cleared between cases
  // or the first test's id suppresses every later one.
  resetOpenedDiffReviews();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAutoOpenDiffReview', () => {
  it('opens the review for a file edit', async () => {
    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await waitFor(() => expect(openDiffReview).toHaveBeenCalledWith('toolu_1'));
  });

  it('hands an overlay back to the caller to mount', async () => {
    openDiffReview.mockResolvedValue({ kind: 'overlay', toolUseId: 'toolu_1' });
    const onOverlay = vi.fn();

    renderHook(() => useAutoOpenDiffReview('toolu_1', onOverlay));

    await waitFor(() => expect(onOverlay).toHaveBeenCalledWith('toolu_1'));
  });

  // A command, a read, an MCP call. The prompt is the whole interaction.
  it('opens nothing when the request has no change to show', async () => {
    getDiffPreview.mockResolvedValue(null);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await waitFor(() => expect(getDiffPreview).toHaveBeenCalled());
    expect(openDiffReview).not.toHaveBeenCalled();
  });

  it('opens once however often it re-renders', async () => {
    // A new callback identity every render — what a parent that does not
    // memoize hands down, and what would re-run the effect if it were a
    // dependency.
    const { rerender } = renderHook(() =>
      useAutoOpenDiffReview('toolu_1', () => {}),
    );
    await waitFor(() => expect(openDiffReview).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    await settle();
    expect(openDiffReview).toHaveBeenCalledTimes(1);
  });

  /*
   * StrictMode mounts, unmounts and mounts again in development, so the effect
   * runs twice for one request. This is the case a per-mount guard cannot catch
   * — it starts empty on the second mount — and the reason the set of opened
   * requests lives at module scope.
   */
  it('opens once when the effect runs twice for the same request', async () => {
    const { unmount } = renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));
    await waitFor(() => expect(openDiffReview).toHaveBeenCalledTimes(1));
    unmount();

    // Same id again. Only a guard keyed by request can tell this from a genuine
    // second prompt.
    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await settle();
    expect(openDiffReview).toHaveBeenCalledTimes(1);
  });

  it('opens again for the next request', async () => {
    const { rerender } = renderHook(({ id }) => useAutoOpenDiffReview(id, undefined), {
      initialProps: { id: 'toolu_1' },
    });
    await waitFor(() => expect(openDiffReview).toHaveBeenCalledTimes(1));

    rerender({ id: 'toolu_2' });

    await waitFor(() => expect(openDiffReview).toHaveBeenCalledWith('toolu_2'));
  });

  /*
   * The backend opens the review itself for these two, when the prompt goes up.
   * Opening from here as well is how the same change ends up on screen twice.
   */
  it('leaves it to the backend in an IDE', async () => {
    isJetBrains.mockReturnValue(true);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await settle();
    expect(openDiffReview).not.toHaveBeenCalled();
  });

  it("leaves it to the backend when the IDE's own viewer draws it", async () => {
    resolvedSurface.mockReturnValue(DiffSurface.IDE);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await settle();
    expect(openDiffReview).not.toHaveBeenCalled();
  });

  it('opens nothing before a request arrives', async () => {
    renderHook(() => useAutoOpenDiffReview(undefined, undefined));

    await settle();
    expect(getDiffPreview).not.toHaveBeenCalled();
  });
});
