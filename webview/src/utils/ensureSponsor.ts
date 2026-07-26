import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { showSponsorGatedToast } from './showSponsorGatedToast';

/**
 * Fresh (non-cached) sponsor check for actions whose side-effect happens on the
 * FRONTEND — a plain chat message, a local setting change — and therefore can't
 * be gated by a backend request the way SCHEDULE_MESSAGE is. Query the backend
 * right before running: on a sponsor, return true (caller proceeds); otherwise
 * show the invite toast and return false (caller aborts). This is the "pattern
 * B" counterpart to the global IPC error interceptor (pattern A).
 *
 * Querying at call time means it reflects the latest server state, avoiding the
 * stale-cache pitfall of reading a pre-fetched isSponsor.
 */
export async function ensureSponsor(): Promise<boolean> {
  try {
    const res = await getBridge().request<{ status?: string; isSponsor?: boolean }>(
      MessageType.GET_SPONSOR_STATUS,
    );
    if (res?.isSponsor === true) return true;
  } catch {
    /* treat any failure as not-a-sponsor and fall through to the gated path */
  }
  showSponsorGatedToast();
  return false;
}
