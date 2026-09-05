import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { getTextContent, type LoadedMessageDto } from '../../types';
import { Route, routeToPath, withWorkingDir } from '@/router/routes';
import { forkPointFor, rewindableSendUuids } from './rewindTargets';
import type { SendActionsValue } from './SendActionsContext';

/** What a forked session needs to know before its first send goes out. */
export interface ForkHandoff {
  /** Passed to the backend on the first send; shapes the spawn that creates the fork. */
  forkFrom?: { sessionId: string; resumeSessionAt: string };
  /** The send being forked from, put back in the composer so it can be reworded. */
  promptText: string;
}

/**
 * Wires the ⋮ menu's per-send actions to the backend and the router (issue #356).
 *
 * ## Forking does not create the session here
 *
 * The new session id is minted by `ChatStreamContext` on the first send, and the
 * backend passes that id to `--session-id` alongside `--fork-session`. So a fork
 * is not an operation that runs now — it is a note carried to the new session
 * screen and spent when the user sends. Navigating with router state rather than
 * storing a "pending fork" somewhere keeps it that way: nothing to reset if the
 * user changes their mind and closes the tab.
 *
 * The send being forked from goes along as `promptText` and lands in the
 * composer. Forking excludes that send, so without it the user would have to
 * retype from memory the message they were trying to rework.
 *
 * A send with no fork point opens an empty session carrying the same prompt.
 * That is the honest outcome rather than an error: the send opens the
 * conversation, so a branch from before it has no shared history at all.
 *
 * ## Rewinding does run now
 *
 * It changes files on disk and says so, and it deliberately leaves the
 * conversation alone — that is what separates it from the fork entries.
 */
export function useSendActions(messages: LoadedMessageDto[]): SendActionsValue {
  const { t } = useTranslation('chat');
  const bridge = useBridgeContext();
  const { currentSessionId, workingDirectory } = useSessionContext();
  const navigate = useNavigate();

  // One pass over the transcript instead of one per rendered send.
  const rewindable = useMemo(() => rewindableSendUuids(messages), [messages]);

  const canRewind = useCallback((sendUuid: string) => rewindable.has(sendUuid), [rewindable]);

  const openFork = useCallback(
    (sendUuid: string) => {
      const send = messages.find((message) => message.uuid === sendUuid);
      const resumeSessionAt = forkPointFor(messages, sendUuid);
      const handoff: ForkHandoff = {
        forkFrom:
          currentSessionId && resumeSessionAt
            ? { sessionId: currentSessionId, resumeSessionAt }
            : undefined,
        promptText: send ? getTextContent(send) : '',
      };
      navigate(withWorkingDir(routeToPath(Route.NEW_SESSION), workingDirectory), {
        state: handoff,
      });
    },
    [messages, currentSessionId, workingDirectory, navigate],
  );

  const runRewind = useCallback(
    async (sendUuid: string): Promise<boolean> => {
      if (!currentSessionId || !workingDirectory) {
        toast.error(t('sendActions.rewindFailed'));
        return false;
      }
      try {
        const response = await bridge.send<{ status?: string; error?: string; message?: string }>(
          MessageType.REWIND_CODE,
          { sessionId: currentSessionId, sendUuid, workingDir: workingDirectory },
        );
        if (response?.status === 'error') {
          // The CLI's own sentence, relayed. It explains its refusals better than
          // a translated line of ours could, and it is what a terminal would say.
          toast.error(response.error || t('sendActions.rewindFailed'));
          return false;
        }
        toast.success(t('sendActions.rewindDone'));
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('sendActions.rewindFailed'));
        return false;
      }
    },
    [bridge, currentSessionId, workingDirectory, t],
  );

  const rewindCode = useCallback(
    (sendUuid: string) => {
      void runRewind(sendUuid);
    },
    [runRewind],
  );

  const forkAndRewind = useCallback(
    (sendUuid: string) => {
      // The files are restored first and the branch opens only if that worked.
      // Navigating first would leave the user in a new session looking at code
      // that was never put back, with the failure toast behind them.
      void runRewind(sendUuid).then((ok) => {
        if (ok) openFork(sendUuid);
      });
    },
    [runRewind, openFork],
  );

  return useMemo(
    () => ({ canRewind, rewindCode, forkConversation: openFork, forkAndRewind }),
    [canRewind, rewindCode, openFork, forkAndRewind],
  );
}
