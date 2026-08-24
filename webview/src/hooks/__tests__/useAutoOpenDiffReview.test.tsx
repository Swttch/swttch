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
// Whether the user wants the review to arrive uninvited at all. Separate from
// where it opens, so every test states both.
const autoOpenEnabled = vi.fn();
vi.mock('../useIdeDiffAvailable', () => ({
  useResolvedDiffSurface: () => resolvedSurface(),
  useAutoOpenDiffEnabled: () => autoOpenEnabled(),
}));

// Whether the review will be drawn over the chat rather than in a window. The
// backend declines to open a tab in exactly that case, so it decides whether
// this hook has anything to do.
const opensAsOverlay = vi.fn();
vi.mock('../useDiffOverlayAllowed', () => ({
  useDiffOpensAsOverlay: () => opensAsOverlay(),
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
  // The case this hook exists for: a browser drawing the built-in page, in a
  // tab of its own.
  isJetBrains.mockReturnValue(false);
  resolvedSurface.mockReturnValue(DiffSurface.BUILT_IN);
  opensAsOverlay.mockReturnValue(false);
  autoOpenEnabled.mockReturnValue(true);
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

  /*
   * Turned off, nothing arrives uninvited (#349).
   *
   * The surface is the built-in one in a browser tab — the case this hook is
   * the only opener for — so an open here could not be anyone else standing in.
   * It must not even ask for the preview: that request is what claims the id,
   * and claiming it would block the click that is now the only way in.
   */
  it('opens nothing when the user turned the automatic open off', async () => {
    autoOpenEnabled.mockReturnValue(false);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await settle();
    expect(openDiffReview).not.toHaveBeenCalled();
    expect(getDiffPreview).not.toHaveBeenCalled();
  });

  // The overlay is the one surface the backend never opens, so if the setting
  // failed to reach this hook it would keep appearing with nothing to stop it.
  it('opens no overlay when the automatic open is off', async () => {
    autoOpenEnabled.mockReturnValue(false);
    opensAsOverlay.mockReturnValue(true);
    const onOverlay = vi.fn();

    renderHook(() => useAutoOpenDiffReview('toolu_1', onOverlay));

    await settle();
    expect(onOverlay).not.toHaveBeenCalled();
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
  it('leaves it to the backend when an IDE opens an editor tab', async () => {
    isJetBrains.mockReturnValue(true);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await settle();
    expect(openDiffReview).not.toHaveBeenCalled();
  });

  /*
   * An overlay is drawn over a screen the backend does not own, so it declines
   * to open a tab and leaves this to the webview — in an IDE as much as in a
   * browser. Skipping it here on the host alone left the reviewer with nothing
   * opening at all.
   */
  it('opens the overlay itself, even in an IDE', async () => {
    isJetBrains.mockReturnValue(true);
    opensAsOverlay.mockReturnValue(true);

    renderHook(() => useAutoOpenDiffReview('toolu_1', undefined));

    await waitFor(() => expect(openDiffReview).toHaveBeenCalledWith('toolu_1'));
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
