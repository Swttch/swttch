import { useEffect, useRef } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { isJetBrains } from '@/config/environment';
import { useResolvedDiffSurface } from './useIdeDiffAvailable';
import { useDiffOpensAsOverlay } from './useDiffOverlayAllowed';
import { DiffSurface } from '@/types/settings';
import { useOpenDiffReview, type OpenDiffResult } from './useOpenDiffReview';

/*
 * The requests already opened.
 *
 * Module scope rather than a ref, because the thing it has to survive is a
 * REMOUNT. StrictMode mounts every component twice in development, and a ref
 * starts empty on the second mount — so a per-mount guard lets exactly the case
 * it was written for through, and the developer sees the review open twice.
 *
 * Never pruned. A session's worth of tool-call ids is a handful of strings, and
 * forgetting one is what would reopen a review the user had closed.
 */
const openedRequests = new Set<string>();

/** Test seam: forget what has been opened, so cases do not leak into each other. */
export function resetOpenedDiffReviews(): void {
  openedRequests.clear();
}

/**
 * Open the review as soon as a file-edit request arrives, without being asked.
 *
 * This is what the IDE already does: the backend opens a diff tab the moment the
 * permission prompt goes up (see openDiffTabForPermission), so an IDE user is
 * looking at the change while they answer. In a browser that same backend call
 * lands on a no-op bridge — the comment there says "the webview opens its own
 * tab or overlay", and this is that half, which had been missing. Until it
 * existed a browser user had to click the file name to see what they were
 * approving.
 *
 * Whether to open is not decided here. The hook asks for the change and opens
 * only if there is one, which is the same test the backend applies
 * (resolveDiffPreview returning null is what stops it there). Reading a tool
 * name list here instead would be a second copy of that rule, free to drift.
 */
export function useAutoOpenDiffReview(
  toolUseId: string | undefined,
  onOverlay: ((toolUseId: string) => void) | undefined,
): void {
  const api = useApi();
  const openDiffReview = useOpenDiffReview();
  const surface = useResolvedDiffSurface();
  const asOverlay = useDiffOpensAsOverlay();

  /*
   * Only where nobody else is already opening it.
   *
   * The backend opens the review itself when it goes to the IDE's own viewer or
   * to an editor tab — both from preparePermissionReview, as the prompt goes up.
   * Opening again from here would put the same change on screen twice.
   *
   * An overlay is the exception, in an IDE as much as in a browser: it is drawn
   * over a screen the backend does not own, so it has to come from here. That is
   * why this mirrors the backend's condition rather than checking the host — an
   * IDE showing an overlay gets no tab from the backend, and without this it
   * would get nothing at all.
   */
  const backendOpensIt = surface === DiffSurface.IDE || (isJetBrains() && !asOverlay);

  // Held in a ref so the effect below depends on the request alone. Both of
  // these change identity on renders that have nothing to do with a new
  // request, and depending on them would re-run the open.
  const latest = useRef<{
    open: (id: string) => Promise<OpenDiffResult>;
    onOverlay?: (id: string) => void;
  }>({ open: openDiffReview, onOverlay });
  latest.current = { open: openDiffReview, onOverlay };

  useEffect(() => {
    if (!toolUseId) return;
    if (backendOpensIt) return;
    if (openedRequests.has(toolUseId)) return;

    let cancelled = false;
    void (async () => {
      // No change to show means this is not a file edit — a command, a read, an
      // MCP call. Those get the prompt and nothing else.
      const preview = await api.tools.getDiffPreview(toolUseId).catch(() => null);
      if (cancelled || !preview) return;

      // Claimed only once we know we are opening, so a prompt that turns out to
      // have no diff does not mark itself done and block a later real one under
      // the same id.
      if (openedRequests.has(toolUseId)) return;
      openedRequests.add(toolUseId);

      const result = await latest.current.open(toolUseId);
      // The overlay is mounted by whoever owns the screen it covers, so it comes
      // back as something for the caller to do rather than something done.
      if (!cancelled && result.kind === 'overlay') {
        latest.current.onOverlay?.(result.toolUseId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, toolUseId, backendOpensIt]);
}
