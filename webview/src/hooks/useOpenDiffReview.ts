import { useCallback } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { getAdapter } from '@/adapters';
import { isJetBrains } from '@/config/environment';
import { ReviewTarget } from '@/shared';

/** How a caller should present the review, once the backend has chosen a surface. */
export type OpenDiffResult =
  | { kind: 'opened' }
  | { kind: 'overlay'; toolUseId: string };

/**
 * Open the review for a pending file-edit request, wherever it belongs.
 *
 * This hook no longer decides where the review goes. It asks the backend to
 * open one and reports back what the caller still has to do.
 *
 * Deciding here as well is what put two reviews of the same edit on screen at
 * once: the backend chose from settings merged for the session's working
 * directory while this hook chose from settings the webview had loaded without
 * one, so a project asking for the IDE's viewer got the built-in page from the
 * file-name link and the IDE's viewer from the unprompted open (#359). Reading
 * the same setting in both places was tried and did not fix it, because the two
 * sides were reading it for different directories. Only the backend knows which
 * session a review belongs to, so only the backend can answer.
 *
 * Returns what the caller still has to do. Only the overlay needs anything: the
 * webview owns the screen it covers, so the backend cannot mount it.
 */
export function useOpenDiffReview(): (toolUseId: string) => Promise<OpenDiffResult> {
  const api = useApi();

  return useCallback(
    async (toolUseId: string): Promise<OpenDiffResult> => {
      const { target } = await api.tools.openReview(toolUseId);

      if (target === ReviewTarget.BUILT_IN_OVERLAY) {
        return { kind: 'overlay', toolUseId };
      }

      /*
       * A browser window is ours to open too: outside an IDE there is no host to
       * ask, so the adapter opens the page itself. Inside one the backend has
       * already opened whatever it chose, and there is nothing left to do.
       */
      if (target === ReviewTarget.BUILT_IN_WINDOW && !isJetBrains()) {
        await getAdapter().openDiff(toolUseId);
      }

      return { kind: 'opened' };
    },
    [api],
  );
}
