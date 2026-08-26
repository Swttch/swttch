import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { getBridgeClient } from '@/api/bridge/BridgeClient';
import { MessageType } from '@/shared';
import type { DiffPreview } from '@/api/modules/ToolsApi';

/**
 * Watch for the file under this review changing on disk, and rebuild against it
 * on request (#359).
 *
 * Two things arrive on the same channel and mean slightly different things:
 *
 *  - The IDE reported a save while the reviewer was still reading. A warning:
 *    what is on screen describes a file that has moved.
 *  - The reviewer pressed approve and the backend refused to answer, because
 *    writing would have discarded whatever landed meanwhile. The approval did
 *    not happen and the request is still open.
 *
 * `blockedApproval` tells them apart, so the banner can say "this was held"
 * rather than only "this changed".
 */
export interface ReviewBaseChange {
  /** Whether an approval was refused, as opposed to a save merely noticed. */
  blockedApproval: boolean;
  /**
   * Why the review cannot simply be approved as it stands.
   *
   * 'changed'          — the file moved; a refresh restates the proposal.
   * 'unreadable'       — the file is gone; there is nothing to apply to.
   * 'no-longer-applies' — the file is there, but the edit no longer fits it:
   *                       the lines it meant to replace are not what it expected.
   *                       Distinct from 'unreadable' because the file is fine and
   *                       saying otherwise sends the reviewer looking for a
   *                       problem that does not exist (measured in QA).
   */
  reason: 'changed' | 'unreadable' | 'no-longer-applies';
  /** Whether the disk change lands under something the reviewer kept. */
  overlapsAccepted: boolean;
}

export interface UseReviewBaseChangedResult {
  /** The pending conflict, or null when the review is current. */
  change: ReviewBaseChange | null;
  /** Whether a rebuild is in flight. */
  refreshing: boolean;
  /**
   * Rebuild against the current file.
   *
   * Resolves to the refreshed preview, or null when the proposal can no longer
   * be stated against what is there — an Edit whose target line the user has
   * since deleted. The caller decides what to show for that; this does not
   * guess a diff.
   */
  refresh: () => Promise<DiffPreview | null>;
}

export function useReviewBaseChanged(
  toolUseId: string,
  onRefreshed: (preview: DiffPreview) => void,
): UseReviewBaseChangedResult {
  const api = useApi();
  const [change, setChange] = useState<ReviewBaseChange | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!toolUseId) return;
    // The bridge directly, as the permission prompts do: this is an unsolicited
    // event from the backend rather than the answer to a request, so it does
    // not belong on the request-shaped API surface.
    const bridge = getBridgeClient();
    return bridge.subscribe(MessageType.REVIEW_BASE_CHANGED, (message) => {
      const payload = message.payload as Record<string, unknown> | undefined;
      // Several reviews can be open at once, so a notice for another file's
      // request must not raise this one's banner.
      if (payload?.toolUseId !== toolUseId) return;

      setChange({
        blockedApproval: payload.blockedApproval === true,
        reason: payload.reason === 'unreadable' ? 'unreadable' : 'changed',
        // Absent reads as overlapping: the honest default when the backend did
        // not say is that the change may matter.
        overlapsAccepted: payload.overlapsAccepted !== false,
      });
    });
  }, [toolUseId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await api.tools.refreshDiffPreview(toolUseId);
      if (result.preview) {
        onRefreshed(result.preview);
        // Cleared only on success: leaving the banner up after a failed rebuild
        // would be the one case where the screen says "current" and is not.
        setChange(null);
        return result.preview;
      }
      // Unrebuildable. The banner stays, now carrying the backend's own reason,
      // because there is nothing to approve and the reviewer needs to know why.
      // The two reasons are NOT interchangeable: reporting a still-present file
      // as unreadable is what QA caught.
      const why = result.reason === 'unreadable' ? 'unreadable' : 'no-longer-applies';
      setChange((prev) => (prev ? { ...prev, reason: why } : prev));
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [api, toolUseId, onRefreshed]);

  return { change, refreshing, refresh };
}
