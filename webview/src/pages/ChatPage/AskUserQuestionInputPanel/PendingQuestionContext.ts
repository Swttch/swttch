import { createContext, useContext } from 'react';
import type { PendingAskUserQuestion } from '@/hooks/usePendingAskUserQuestion';

/**
 * The question that waits for its answer, handed to the transcript so that the card that asks it is drawn where the
 * `AskUserQuestion` call stands in the conversation and not under the whole of it. Null when no question waits.
 */
export interface PendingQuestion {
  toolUse: PendingAskUserQuestion['toolUse'];
  controlRequestId?: string;
  onDismiss: () => void;
}

export const PendingQuestionContext = createContext<PendingQuestion | null>(null);

export function usePendingQuestion(): PendingQuestion | null {
  return useContext(PendingQuestionContext);
}
