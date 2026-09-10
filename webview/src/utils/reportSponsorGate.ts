import { getBridge } from '@/api/bridge/Bridge';
import { MessageType, type SponsorGate, type SponsorGateStep, type SponsorGateSurface } from '@/shared';

interface SponsorGateProps {
  /** Which surface raised the offer. Rides in properties, not in the event name. */
  from?: SponsorGateSurface;
  /** How many items were out of reach when the gate was shown, where that applies. */
  lockedCount?: number;
}

/**
 * Tell the backend that a feature offered sponsorship, or that the offer was
 * followed, so it can be measured.
 *
 * Both moments happen entirely in the webview, so without this report the
 * backend has no way to learn they occurred at all. Same fire-and-forget shape
 * as reportAssetActivity: nothing ACKs it, and a lost ping matters far less than
 * getting in the way of what the user is doing.
 *
 * Carries enum values and counts only. Never anything the user typed.
 */
export function reportSponsorGate(
  gate: SponsorGate,
  step: SponsorGateStep,
  props: SponsorGateProps = {},
): void {
  try {
    getBridge().sendRaw({
      type: MessageType.SPONSOR_GATE_ACTIVITY,
      payload: { gate, step, ...props },
      timestamp: Date.now(),
    });
  } catch {
    // Socket not open yet. Measurement must never surface to the user.
  }
}
