import { createContext, useContext } from 'react';
import type { PendingPlanApproval } from '../../../hooks/usePendingPlanApproval';

/**
 * The plan that waits for its answer, and how it is answered, handed to the transcript so that the card that asks
 * about it is drawn where the `ExitPlanMode` call stands in the conversation and not under the whole of it.
 * Null when no plan waits.
 */
export interface PendingPlan {
  pending: PendingPlanApproval;
  onApprove: (controlRequestId: string) => void;
  onDeny: (controlRequestId: string, reason?: string) => void;
}

export const PendingPlanContext = createContext<PendingPlan | null>(null);

export function usePendingPlan(): PendingPlan | null {
  return useContext(PendingPlanContext);
}
