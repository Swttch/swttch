import { createContext, useContext } from 'react';

/**
 * The per-send actions the ⋮ menu can offer, and whether each one applies to a
 * given send (issue #356).
 *
 * A context rather than props for the same reason `SectionFoldContext` is one:
 * the menu sits inside `UserMessageRenderer`, below the memoised `MessageBubble`,
 * and threading a prop through would re-render every kind of bubble that
 * component can produce for a value only the user bubble reads.
 *
 * `canRewind` is asked per send rather than computed once in the menu because
 * the answer comes from the whole transcript (the `file-history-snapshot` entry
 * belonging to that send), which the menu does not hold.
 */
export interface SendActionsValue {
  /** Whether the code can be restored to the state it had at this send. */
  canRewind: (sendUuid: string) => boolean;
  /** Restore the files this send edited, leaving the conversation alone. */
  rewindCode: (sendUuid: string) => void;
  /** Start a new session branched from just before this send. */
  forkConversation: (sendUuid: string) => void;
  /** Both, in that order: the files are restored, then the branch opens. */
  forkAndRewind: (sendUuid: string) => void;
}

export const SendActionsContext = createContext<SendActionsValue | null>(null);

/**
 * `null` when no provider is above. The renderers are used in tests and in
 * surfaces with no transcript behind them, and neither should have to install a
 * provider to draw a bubble — the menu hides the entries instead.
 */
export function useSendActionsValue(): SendActionsValue | null {
  return useContext(SendActionsContext);
}
