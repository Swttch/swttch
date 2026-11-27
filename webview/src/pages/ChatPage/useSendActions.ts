import { useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { getTextContent, type LoadedMessageDto } from '../../types';
import { canRewindTo, isRecordedSend, recordedUuidOf } from './rewindTargets';
import type { SendActionsValue } from './SendActionsContext';
import { commandSendText, typedSendText } from './sendText';
import { parseUserContent } from './message-renderers/utils/parseUserContent';
import { parseReplyBlocks, type ReplyCard } from './message-renderers/utils/replyBlocks';
import { hasVisibleGlyph } from './message-renderers/components/IfVisible';

/** What a fork puts back for a send: the words for the composer, and the cards for the row above it. */
interface Retyped {
  text: string;
  replies: ReplyCard[];
  /** The quotes of the cards with no comment. */
  excerpts: string[];
}

/**
 * What a fork from this card puts back, or null when nobody typed the card (#719).
 *
 * The CLI records some of its own output as `user` entries, and they head a section and get the fork button like a
 * send: `/compact` leaves "Compacted …" behind as `<local-command-stdout>`. There is nothing in one to retype, so the
 * branch keeps it, as a branch from a reply does, and the composer stays empty.
 *
 * Otherwise the answer is the send as the card reads, not as the transcript stores it. A slash command is stored as
 * `<command-name>` markup and comes back as `/compact`. A typed send comes back as `typedSendText` has it, the same
 * words Up recall brings back, and the reply cards it opened with are lifted out of the text: the composer cannot
 * draw a card from `<!-- reply -->` markup, but it can hold one, so they return to the row above it.
 */
function retypedSend(send: LoadedMessageDto): Retyped | null {
  const stored = getTextContent(send);
  const parsed = parseUserContent(stored);
  if (hasVisibleGlyph(parsed.commandName)) {
    return { text: commandSendText(parsed.commandName, parsed.text), replies: [], excerpts: [] };
  }
  const typed = typedSendText(stored);
  // Anchored, so a send that only quotes the tag further in is still a send.
  if (typed.startsWith('<local-command-stdout>')) return null;
  const cards = parseReplyBlocks(typed);
  if (!cards) return { text: typed, replies: [], excerpts: [] };
  return { text: cards.body.trim(), replies: cards.replies, excerpts: cards.excerpts };
}

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
 * to retype from memory the message they were trying to rework. A card the CLI
 * wrote is the exception: the branch keeps it and the composer stays empty (see
 * `retypedText`).
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

  // The messages are read when an action is asked about, not closed over. The value this hook returns is handed to
  // every row through a context, so one that changed with the messages made every row draw again for each word of a
  // streaming reply (#680).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // The session list is replaced whenever a title or a read time changes, which happens while a reply streams.
  // Only the fork's title lookup needs it, and that runs on a click, so it is read then.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // The menu identifies a send by the key the transcript is grouped on, which is
  // whatever `uuid` the entry carries — so every answer starts by finding it.
  const sendByKey = useCallback(
    (sendUuid: string) => messagesRef.current.find((message) => message.uuid === sendUuid),
    [],
  );

  const canFork = useCallback(
    (sendUuid: string) => isRecordedSend(sendByKey(sendUuid)),
    [sendByKey],
  );

  const canRewind = useCallback(
    (sendUuid: string) => canRewindTo(messagesRef.current, sendByKey(sendUuid)),
    [sendByKey],
  );

  const openFork = useCallback(
    async (sendUuid: string) => {
      const send = sendByKey(sendUuid);
      // The uuid the CLI knows this send by; a send still in flight has none, and
      // the menu does not offer the action for one.
      const recorded = recordedUuidOf(send);

      if (!send || !recorded || !currentSessionId || !workingDirectory) {
        toast.error(t('sendActions.forkFailed'));
        return;
      }

      const retyped = retypedSend(send);
      const promptText = retyped?.text ?? '';
      // Before a send, so it can be sent again; through a card the CLI wrote, which has nothing to send again.
      const cut = retyped === null ? { throughUuid: recorded } : { sendUuid: recorded };

      try {
        // The fork point is worked out by the backend, which holds the whole
        // transcript. Doing it here would only ever see the page on screen, and a
        // send near the top of a long conversation has its predecessor outside it.
        const response = await bridge.send<{ status?: string; error?: string; sessionId?: string }>(
          MessageType.FORK_SESSION,
          { sessionId: currentSessionId, ...cut, workingDir: workingDirectory },
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
         * The branch is handed over as a session that already has its transcript
         * (`hasTranscript`): it was written before this ran, so `SessionLoader`
         * clears the screen and reads it once the route has changed, as it does for
         * any session opened from the list. Marked as just created instead, it
         * kept the conversation of the session the fork came from on screen, and
         * a read asked for here could beat the navigation and be dropped as stale
         * (#719).
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
        const originTitle = sessionsRef.current.find((s) => s.id === currentSessionId)?.title ?? promptText;
        // The send goes to the composer of the branch, cards and all, not to the box of the session still on screen.
        const cards = [
          ...(retyped?.replies ?? []),
          ...(retyped?.excerpts ?? []).map((quote) => ({ quote, comment: '' })),
        ];
        addNewSession(response.sessionId, originTitle, { promptText, ...(cards.length > 0 ? { cards } : {}), hasTranscript: true });
        toast.success(t('sendActions.forkDone'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('sendActions.forkFailed'));
      }
    },
    [sendByKey, currentSessionId, workingDirectory, bridge, t, addNewSession],
  );

  const canForkReply = useCallback(
    (replyUuid: string) => {
      const reply = messagesRef.current.find((message) => message.uuid === replyUuid);
      return reply !== undefined && !reply.isStreaming && Boolean(currentSessionId);
    },
    [currentSessionId],
  );

  // The same branch as `openFork`, cut after the reply instead of before a send; nothing goes back into the composer.
  const forkAtReply = useCallback(
    async (replyUuid: string) => {
      if (!currentSessionId || !workingDirectory) {
        toast.error(t('sendActions.forkFailed'));
        return;
      }
      try {
        const response = await bridge.send<{ status?: string; error?: string; sessionId?: string }>(
          MessageType.FORK_SESSION,
          { sessionId: currentSessionId, throughUuid: replyUuid, workingDir: workingDirectory },
        );
        if (response?.status === 'error' || !response?.sessionId) {
          toast.error(response?.error || t('sendActions.forkFailed'));
          return;
        }
        const originTitle = sessionsRef.current.find((s) => s.id === currentSessionId)?.title ?? '';
        addNewSession(response.sessionId, originTitle, { promptText: '', hasTranscript: true });
        toast.success(t('sendActions.forkDone'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('sendActions.forkFailed'));
      }
    },
    [currentSessionId, workingDirectory, bridge, t, addNewSession],
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
    () => ({ canFork, canRewind, rewindCode, forkConversation: openFork, forkAndRewind, canForkReply, forkAtReply: (replyUuid: string) => void forkAtReply(replyUuid) }),
    [canFork, canRewind, rewindCode, openFork, forkAndRewind, canForkReply, forkAtReply],
  );
}
