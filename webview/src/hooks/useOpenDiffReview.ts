import { useCallback } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useResolvedDiffSurface } from '@/hooks/useIdeDiffAvailable';
import { useDiffOverlayAllowed } from '@/hooks/useDiffOverlayAllowed';
import { getAdapter } from '@/adapters';
import { isJetBrains } from '@/config/environment';
import { SettingKey, DiffSurface, BrowserDiffPresentation } from '@/types/settings';

/** How a caller should present the built-in diff, once it has decided to open one. */
export type OpenDiffResult =
  | { kind: 'opened' }
  | { kind: 'overlay'; toolUseId: string };

/**
 * Open the review for a pending file-edit request, wherever it belongs.
 *
 * One place decides, because the same review is reached three ways — the
 * permission prompt's file link, the backend opening it unprompted, and a
 * reopen after the user closed it — and they must all land on the surface the
 * setting names. Splitting the decision is how two of them end up disagreeing.
 *
 * Returns what the caller still has to do. Only the overlay needs anything: it
 * is mounted by whoever owns the screen it covers, which this hook is not.
 */
export function useOpenDiffReview(): (toolUseId: string) => Promise<OpenDiffResult> {
  const api = useApi();
  // Merged, not the scope the settings screen is showing — see
  // useResolvedDiffSurface for what that difference cost (#359).
  const { settings } = useSettings();
  const surface = useResolvedDiffSurface();
  const overlayAllowed = useDiffOverlayAllowed();

  return useCallback(
    async (toolUseId: string): Promise<OpenDiffResult> => {
      if (surface === DiffSurface.IDE) {
        // The IDE draws it. Looking at the change is not answering the question:
        // the request stays open and the turn keeps running.
        await api.tools.openDiffForRequest(toolUseId);
        return { kind: 'opened' };
      }

      const presentation =
        (settings[SettingKey.BROWSER_DIFF_PRESENTATION] as BrowserDiffPresentation | undefined) ??
        BrowserDiffPresentation.NEW_TAB;

      // Asked for and available. In an IDE that means the chat is in an editor
      // tab, which has the room to be drawn over; a sidebar chat does not, so
      // overlayAllowed is false there and the request falls through to a tab.
      if (presentation === BrowserDiffPresentation.OVERLAY && overlayAllowed) {
        return { kind: 'overlay', toolUseId };
      }

      // Inside an IDE the built-in page gets an editor tab, which only the IDE
      // side can open — so it goes through the backend, the same way the
      // unprompted open does.
      if (isJetBrains()) {
        await api.tools.openDiffTab(toolUseId);
        return { kind: 'opened' };
      }

      await getAdapter().openDiff(toolUseId);
      return { kind: 'opened' };
    },
    [api, settings, surface, overlayAllowed],
  );
}
