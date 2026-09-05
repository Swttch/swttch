import { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useApi } from '@/contexts/ApiContext';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { getTextContent, type LoadedMessageDto } from '../../types';
import { canRewindTo, isRecordedSend, recordedUuidOf } from './rewindTargets';
import type { SendActionsValue } from './SendActionsContext';

/**
 * Wires the ⋮ menu's per-send actions to the backend (issue #356).
 *
 * ## Forking creates the branch before it opens it
 *
 * The backend writes the branch's transcript and answers with its id, so by the
 * time the user arrives the shared history is already on disk. Opening it goes
 * through `addNewSession`, the same door every locally created session uses:
 * that is what registers the branch in the list, keeps `rootDir` on the URL, and
 * respects the host's history rule — JetBrains replaces rather than pushes, so a
 * second `navigate()` here would leave an extra entry behind in the IDE only.
 *
 * The send being forked from rides along as `promptText` and lands in the
 * composer. The branch stops just before it, so without it the user would have
 * to retype from memory the message they were trying to rework.
 *
 * ## Rewinding does not touch the conversation
 *
 * It changes files on disk and says so — that is what separates it from the two
 * fork entries.
 */
export function useSendActions(messages: LoadedMessageDto[]): SendActionsValue {
  const { t } = useTranslation('chat');
  const bridge = useBridgeContext();
  const { currentSessionId, workingDirectory, addNewSession, sessions } = useSessionContext();
  const api = useApi();

  // The menu identifies a send by the key the transcript is grouped on, which is
  // whatever `uuid` the entry carries — so every answer starts by finding it.
  const sendByKey = useCallback(
    (sendUuid: string) => messages.find((message) => message.uuid === sendUuid),
    [messages],
  );

  const canFork = useCallback(
    (sendUuid: string) => isRecordedSend(sendByKey(sendUuid)),
    [sendByKey],
  );

  const canRewind = useCallback(
    (sendUuid: string) => canRewindTo(messages, sendByKey(sendUuid)),
    [messages, sendByKey],
  );

  const openFork = useCallback(
    async (sendUuid: string) => {
      const send = sendByKey(sendUuid);
      const promptText = send ? getTextContent(send) : '';
      // The uuid the CLI knows this send by; a send still in flight has none, and
      // the menu does not offer the action for one.
      const recorded = recordedUuidOf(send);

      if (!recorded || !currentSessionId || !workingDirectory) {
        toast.error(t('sendActions.forkFailed'));
        return;
      }

      try {
        // The fork point is worked out by the backend, which holds the whole
        // transcript. Doing it here would only ever see the page on screen, and a
        // send near the top of a long conversation has its predecessor outside it.
        const response = await bridge.send<{ status?: string; error?: string; sessionId?: string }>(
          MessageType.FORK_SESSION,
          { sessionId: currentSessionId, sendUuid: recorded, workingDir: workingDirectory },
        );
        if (response?.status === 'error' || !response?.sessionId) {
          toast.error(response?.error || t('sendActions.forkFailed'));
          return;
        }
        /*
         * Registering the branch is also what opens it — `addNewSession`
         * navigates, because for a locally created session the URL change IS the
         * creation.
         *
         * Registering matters on its own too: `SessionLoader` redirects a URL
         * whose session is missing from the list it has loaded, and that list is
         * fetched asynchronously. The branch exists on disk but the webview has
         * not seen it yet, so the route bounced straight back to /sessions/new
         * until this call marked it as one of ours.
         */
        /*
         * The branch is listed under the name of the session it came from.
         *
         * That is what it will be called once the list is re-read anyway: a title
         * comes from the first summary or prompt in the transcript, and the branch
         * copied that part verbatim. Naming it after the forked send instead would
         * put a different name on the row for as long as the local entry lasts,
         * and for a send that reduces to nothing — a task notification, a bare
         * system tag — that name comes out as "No title".
         */
        const originTitle = sessions.find((s) => s.id === currentSessionId)?.title ?? promptText;
        addNewSession(response.sessionId, originTitle, { promptText });
        /*
         * Ask for the transcript explicitly.
         *
         * Registering the branch above is what stops `SessionLoader` from
         * redirecting a URL it cannot find in its list yet, but a locally created
         * session is also one it does not bother loading — it assumes there is
         * nothing on disk. Here there is: the branch was written before this ran.
         */
        void api.sessions.load(response.sessionId, workingDirectory);
        toast.success(t('sendActions.forkDone'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('sendActions.forkFailed'));
      }
    },
    [sendByKey, currentSessionId, workingDirectory, bridge, t, addNewSession, api, sessions],
  );

  const runRewind = useCallback(
    async (sendUuid: string): Promise<boolean> => {
      const recorded = recordedUuidOf(sendByKey(sendUuid));
      if (!recorded || !currentSessionId || !workingDirectory) {
        toast.error(t('sendActions.rewindFailed'));
        return false;
      }
      try {
        const response = await bridge.send<{ status?: string; error?: string; message?: string }>(
          MessageType.REWIND_CODE,
          { sessionId: currentSessionId, sendUuid: recorded, workingDir: workingDirectory },
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
    [bridge, sendByKey, currentSessionId, workingDirectory, t],
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
    () => ({ canFork, canRewind, rewindCode, forkConversation: openFork, forkAndRewind }),
    [canFork, canRewind, rewindCode, openFork, forkAndRewind],
  );
}
