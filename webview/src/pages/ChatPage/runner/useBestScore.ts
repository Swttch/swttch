import { useCallback, useEffect, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

interface BestScoreResponse {
  best: number;
}

/**
 * The runner game's best score, kept in `profile.json` alongside the rest of
 * the user's settings rather than in localStorage — the webview's storage is
 * tied to the JCEF cache in the IDE and to the origin in a browser, so a score
 * saved there would be lost on a cache clear and would not follow the user
 * between the two.
 *
 * Reporting a score never lowers the record: the backend keeps it only if it
 * beats what is stored, so a finished run can be reported unconditionally.
 */
export const useBestScore = () => {
  const { send } = useBridgeContext();
  const [best, setBest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await send(MessageType.GET_RUNNER_BEST_SCORE, {})) as BestScoreResponse | null;
        if (!cancelled && res) setBest(res.best);
      } catch {
        // A missing score is not worth surfacing; the game still plays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [send]);

  const report = useCallback(
    async (score: number) => {
      // Show the new record straight away rather than waiting for the round trip.
      setBest((current) => Math.max(current, score));
      try {
        const res = (await send(MessageType.SET_RUNNER_BEST_SCORE, { score })) as BestScoreResponse | null;
        if (res) setBest(res.best);
      } catch {
        // Keep the optimistic value; the next run will try again.
      }
    },
    [send],
  );

  return { best, report };
};
