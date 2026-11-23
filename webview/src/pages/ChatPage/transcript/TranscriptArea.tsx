import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { withoutPeerSections } from './peerSections';
import type { LoadedMessageDto } from '../../../types';
import type { SessionSend } from '@/shared';
import type { SendSection } from '../groupIntoSendSections';
import { reuseSections } from '../reuseSections';
import { ProjectSelectorPage } from '@/pages/ProjectSelectorPage';
import { useSessionContext } from '../../../contexts/SessionContext';
import { useChatStreamContext } from '../../../contexts/ChatStreamContext';
import { StreamErrorBanner } from '../StreamErrorBanner';
import { TranscriptStreamingIndicator } from './TranscriptStreamingIndicator';
import { TranscriptExternalWorking } from './TranscriptExternalWorking';
import { TranscriptAwaitingInput } from './TranscriptAwaitingInput';
import { TranscriptHeldMessages } from './TranscriptHeldMessages';
import { TranscriptHeldWorking } from './TranscriptHeldWorking';
import { useReleaseHeldMessages } from '../../../hooks/useReleaseHeldMessages';
import { TranscriptPendingMessages } from './TranscriptPendingMessages';
import { isSameActivity, runningActivity, type StreamingActivity } from './streamingActivity';
import { replyStartedIn } from './replyStarted';
import { LiveActivityContext } from './LiveActivityContext';
import { EmptyState } from '../EmptyState';
import { isJetBrains } from '@/config/environment';
import { SectionFoldContext, SectionKeyContext } from '../SectionFoldContext';
import { SendActionsContext } from '../SendActionsContext';
import { LastEntryContext, lastEntryUuid } from '../LastEntryContext';
import { useSendActions } from '../useSendActions';
import { useSectionFold } from '../useSectionFold';
import { useTranslation } from '@/i18n';
import { ChatSearchBar } from '../chatSearch/ChatSearchBar';
import { SelectionReplyLayer } from '../SelectionReply/SelectionReplyLayer';
import { useChatSearch, type ChatSearchSource } from '../chatSearch/useChatSearch';
import { SEND_JUMP_SCROLL_MARGIN } from '../SendIndex/scrollToSend';
import { TranscriptUserMessage } from './TranscriptUserMessage';
import { TranscriptBody } from './TranscriptBody';
import { TranscriptWrapUp } from './TranscriptWrapUp';
import { WindowGapRow } from '../WindowGapRow';
import { entryMarker } from '../useScrollAnchor';
import './prose.css';
import '../streaming.css';

/** The find bar's source when the page offers none: it counts what is loaded. */
const LOADED_ONLY: ChatSearchSource = {
  sessionKey: null,
  searchSession: () => Promise.reject(new Error('No backend search')),
  isEntryLoaded: () => true,
  loadThrough: () => Promise.resolve(),
};

/** The same props as `ChatMessageArea`: `ChatPage` hands one of the two the same thing. */
export interface TranscriptAreaProps {
  isStreaming: boolean;
  /** A permission card waits for the person: while a turn runs and no call of its own holds it, the line says so. */
  awaitingInput?: boolean;
  /** Drawn last, in the conversation itself: the permission card, which scrolls away with the messages. */
  trailing?: ReactNode;
  /** Where the "Input needed" line goes: before the card (default), after it (a question), or nowhere (a plan). */
  awaitingInputLine?: 'before' | 'after' | 'none';
  /** Seconds left before a dropped connection ends the turn; null while connected. */
  disconnectCountdown?: number | null;
  /** The CLI's retry progress; null when not retrying. */
  apiRetry?: { attempt: number; max: number } | null;
  mergedMessages: LoadedMessageDto[];
  sections: SendSection[];
  /** Not drawn here: a reply whose send is not loaded gets no stand-in header in this view. */
  carriedSend: SessionSend | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** The index of the section the window's gap stands in front of; null when what is held is one run. */
  gapSectionIndex?: number | null;
  /** The page the gap is waiting for is on its way. */
  isLoadingGap?: boolean;
  findInChat?: ChatSearchSource;
}

/**
 * The chat transcript of the Transcript view modes (Normal, Thinking, Verbose).
 *
 * It is a codebase of its own, not the classic `ChatMessageArea` with switches in
 * it: `ChatPage` picks one or the other from the view mode, and nothing here
 * changes what the classic chat draws. What the two share is only what is not a
 * look: the data they are given, the contexts the leaf components read, the find
 * bar and the selection-reply layer.
 *
 * What this view leaves out of the classic one is the send's fold arrow, its
 * pinning to the top of the chat, and the collapsing of a reply, so there is no
 * `StickySendHeader`, `SendFoldToggle` or `CollapsedReplyNotice` here. The
 * provider of `SectionFoldContext` stays, because the find bar and the leaf
 * components read it; nothing ever collapses.
 */
/**
 * One send and its reply, drawn as the transcript draws it.
 *
 * Its own component, and a memoised one: a long conversation is hundreds of these, and a word of a streaming reply
 * used to make the area build the elements of every one of them again (several each) only to find that all but the
 * last had nothing new. Given the same props, a section is not looked at again (#680).
 */
const TranscriptSection = memo(function TranscriptSection({
  section,
  nextHead,
  showGap,
  isLoadingGap,
  isLast,
  streaming,
  awaitingInput,
  lastBodyRef,
  mergedMessagesRef,
  onRetry,
}: {
  section: SendSection;
  /** The send after this section, whose text tells whether a wrap-up question was answered. */
  nextHead: LoadedMessageDto | null;
  /** The window's gap stands in front of this section. */
  showGap: boolean;
  isLoadingGap: boolean;
  isLast: boolean;
  /** The turn is running and this is the section it writes into (false for every other section). */
  streaming: boolean;
  awaitingInput: boolean;
  lastBodyRef: MutableRefObject<HTMLDivElement | null> | null;
  /** All the messages drawn, read only when an entry is clicked, for the console line. */
  mergedMessagesRef: RefObject<LoadedMessageDto[]>;
  onRetry: (messageId: string) => void;
}) {
  return (
    /*
      `data-send-section` and the sentinel are what the send index on the
      right reads to jump to a send and to know which one the reader is on
      (see SendIndex). They are the same attributes the classic chat
      carries, so the rail works the same on both.
    */
    <div data-send-section={section.key}>
      {showGap && <WindowGapRow isLoading={isLoadingGap} />}
      {section.head && (
        <>
          <div
            data-send-sentinel
            aria-hidden
            className="h-0"
            style={{ scrollMarginTop: SEND_JUMP_SCROLL_MARGIN }}
          />
          <SectionKeyContext.Provider value={section.key}>
            <div
              {...entryMarker(section.head.uuid)}
              onClick={() => {
                const mergedMessages = mergedMessagesRef.current ?? [];
                console.log(section.head, mergedMessages.indexOf(section.head!), mergedMessages); // NEVER REMOVE THIS LINE
              }}
            >
              <TranscriptUserMessage message={section.head} sectionKey={section.key} />
            </div>
          </SectionKeyContext.Provider>
        </>
      )}
      {/* Sent while the card holds the turn: right after the latest message, above the calls still running, as in the desktop app. */}
      {awaitingInput && <TranscriptHeldMessages />}
      <div ref={lastBodyRef ?? undefined} data-section-body data-after-send={section.head ? '' : undefined} className={`${section.body.length > 0 || (isLast && streaming) ? 'pt-[0.1688rem] ' : ''}${!isLast ? (section.body.length > 0 ? 'pb-[1.9969rem]' : 'pb-[0.7313rem]') : streaming || awaitingInput ? 'pb-0' : 'pb-[3.0376rem]'}`}>
        <TranscriptBody body={section.body} mergedMessagesRef={mergedMessagesRef} onRetry={onRetry} turnRunning={streaming} sectionKey={section.key} waiting={isLast ? <TranscriptPendingMessages /> : undefined} />
        {/* The turn's wrap-up is drawn here, after its last message, not where its call sits: a recap as text until the closing message begins, then the question and its answers. */}
        <TranscriptWrapUp body={section.body} next={nextHead} />
      </div>
    </div>
  );
});

export function TranscriptArea(props: TranscriptAreaProps) {
  const { t } = useTranslation('chat');
  const { isStreaming, awaitingInput = false, trailing = null, awaitingInputLine = 'before', disconnectCountdown = null, apiRetry = null, mergedMessages, hasMore, isLoadingMore, onLoadMore, gapSectionIndex = null, isLoadingGap = false, findInChat = LOADED_ONLY } = props;
  // Folding a message from another session into the section before it makes that section a new object each time;
  // the ones that did not change are kept, so that they are not drawn again for every word of a streaming reply (#680).
  const drawnSectionsRef = useRef<SendSection[]>([]);
  const sections = useMemo(() => {
    const reused = reuseSections(drawnSectionsRef.current, withoutPeerSections(props.sections));
    drawnSectionsRef.current = reused;
    return reused;
  }, [props.sections]);
  const mergedMessagesRef = useRef(mergedMessages);
  mergedMessagesRef.current = mergedMessages;
  const { workingDirectory, currentSessionId } = useSessionContext();
  const { retry: onRetry, messages: streamMessages, isStreaming: turnRunning } = useChatStreamContext();
  // What the runs of calls read to tell whether one of theirs is the call being waited on: the same object while the
  // call is the same, however many words arrive (#680).
  const liveRef = useRef<StreamingActivity | null>(null);
  const liveActivity = useMemo(() => {
    const next = turnRunning ? runningActivity(streamMessages) : null;
    const before = liveRef.current;
    const same = isSameActivity(next, before);
    if (!same) liveRef.current = next;
    return liveRef.current;
  }, [turnRunning, streamMessages]);
  const waitedCall = useMemo(() => (isStreaming ? runningActivity(streamMessages) : null), [isStreaming, streamMessages]);
  // Held under a card, they are handed over once the card is answered AND the call it held has finished (a denial
  // hands them over with the answer, in ChatPage): the desktop app keeps them held, with "Send now", while the
  // allowed command runs.
  const { releaseHeldMessages, dropReleasedHeldMessages, heldMessages } = useChatStreamContext();
  // A call is still running until its result has come back: in the stream the result is a message of its own after the
  // call, not yet folded into the call.
  // The model has begun writing its answer after the calls: the newest entry is its text.
  // A question answered by a message typed in the chat also starts the line's time at once, before the CLI has said
  // anything (questionRepliedTurn); the entries it writes after that keep the time on (replyStartedIn).
  const { questionRepliedTurn } = useChatStreamContext();
  const replyStarted = useMemo(() => questionRepliedTurn || replyStartedIn(streamMessages), [questionRepliedTurn, streamMessages]);
  const callRunning = useMemo(() => {
    const activity = runningActivity(streamMessages);
    if (!activity) return false;
    return !streamMessages.some((message) => {
      const content = message.message?.content;
      return (
        Array.isArray(content) &&
        content.some((block) => (block as { type?: string }).type === 'tool_result' && (block as { tool_use_id?: string }).tool_use_id === activity.toolUseId)
      );
    });
  }, [streamMessages]);
  const settleHeldMessages = useCallback(async () => {
    await releaseHeldMessages();
    dropReleasedHeldMessages();
  }, [releaseHeldMessages, dropReleasedHeldMessages]);
  useReleaseHeldMessages(awaitingInput || callRunning, settleHeldMessages);
  const heldCall = useMemo(() => (awaitingInput && turnRunning ? runningActivity(streamMessages) : null), [awaitingInput, turnRunning, streamMessages]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Whether the newest message's section has drawn nothing under it yet, so that the working line stands right under
  // a message bubble (it is then 15px closer, as the desktop app's is). Read from the screen: what a section has
  // drawn is not told by its entries, an entry can draw nothing.
  const lastBodyRef = useRef<HTMLDivElement | null>(null);
  const [afterBubble, setAfterBubble] = useState(false);
  useLayoutEffect(() => {
    const el = lastBodyRef.current;
    if (!el) {
      setAfterBubble(false);
      return;
    }
    const measure = () => setAfterBubble((el.textContent ?? '').trim() === '' && !el.querySelector('img, svg, pre, table'));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  const fold = useSectionFold();
  const sendActions = useSendActions(mergedMessages);
  const isEmpty = mergedMessages.length === 0;

  const search = useChatSearch({
    rootRef: containerRef,
    enabled: Boolean(workingDirectory) && !isEmpty,
    contentVersion: mergedMessages,
    fold,
    ...findInChat,
  });

  if (!workingDirectory) {
    if (isJetBrains()) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-text-tertiary text-[0.7874rem] leading-[1.125rem]">{t('chatMessageArea.loadingWorkingDirectory')}</p>
        </div>
      );
    }
    return <ProjectSelectorPage />;
  }

  if (isEmpty) return <EmptyState />;

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-[calc(var(--chat-column-max,70rem)_-_var(--chat-column-px,2rem))] mx-auto sm:px-4 antialiased">
      <ChatSearchBar search={search} />
      <SelectionReplyLayer containerRef={containerRef} />
      {(isLoadingMore || hasMore) && (
        <div className="flex justify-center py-[0.9rem]">
          {isLoadingMore ? (
            <span className="inline-flex items-center gap-[0.45rem] text-[0.675rem] leading-[0.9rem] text-text-tertiary">
              <span className="w-[0.7874rem] h-[0.7874rem] border-2 border-border-default border-t-text-secondary rounded-full animate-spin" />
              {t('chatMessageArea.loadingEarlierMessages')}
            </span>
          ) : (
            <button
              onClick={onLoadMore}
              className="px-4 py-[0.3376rem] bg-surface-raised border border-border-default rounded-full text-[0.675rem] leading-[0.9rem] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-200 shadow-sm"
            >
              {t('chatMessageArea.loadOlderMessages')}
            </button>
          )}
        </div>
      )}
      <SectionFoldContext.Provider value={fold}>
        <SendActionsContext.Provider value={sendActions}>
          <LastEntryContext.Provider value={lastEntryUuid(mergedMessages)}>
            <LiveActivityContext.Provider value={liveActivity}>
            {sections.map((section, sectionIndex) => {
              const isLast = sectionIndex === sections.length - 1;
              // What only the last section needs is told to it alone, so that the others are given the same props
              // for every word of a streaming reply and are not drawn again for it (#680).
              return (
                <TranscriptSection
                  key={section.key}
                  section={section}
                  nextHead={sections[sectionIndex + 1]?.head ?? null}
                  showGap={gapSectionIndex === sectionIndex}
                  isLoadingGap={isLoadingGap}
                  isLast={isLast}
                  streaming={isLast && isStreaming}
                  awaitingInput={isLast && awaitingInput}
                  lastBodyRef={isLast ? lastBodyRef : null}
                  mergedMessagesRef={mergedMessagesRef}
                  onRetry={onRetry}
                />
              );
            })}
            </LiveActivityContext.Provider>
          </LastEntryContext.Provider>
        </SendActionsContext.Provider>
      </SectionFoldContext.Provider>
      {!awaitingInput && <TranscriptHeldMessages atEnd />}
      {/* The allowed command is running while its answer's messages are still drawn here: the line says what it is for. */}
      {!awaitingInput && waitedCall !== null && heldMessages.some((held) => held.released) && (
        <div>
          <TranscriptHeldWorking activity={waitedCall} />
        </div>
      )}
      {/* A program this screen does not run works on the session (its turn is not streamed here): the session says so. */}
      {!isStreaming && <TranscriptExternalWorking sessionId={currentSessionId} />}
      {/* While a call is being waited on, the run of calls that holds it is the working indicator (see TranscriptToolRun); this line is for the rest of the turn, when the model thinks or writes. A dropped connection and the CLI's retries still say so here. */}
      {isStreaming && (waitedCall === null || disconnectCountdown !== null || apiRetry !== null) && (
        <div>
          <TranscriptStreamingIndicator countdownSeconds={disconnectCountdown} apiRetry={apiRetry} replyStarted={replyStarted} afterBubble={afterBubble} />
        </div>
      )}
      {awaitingInput && awaitingInputLine === 'before' && turnRunning && heldCall === null && (
        <div>
          <TranscriptAwaitingInput />
        </div>
      )}
      {trailing}
      {awaitingInput && awaitingInputLine === 'after' && turnRunning && heldCall === null && (
        <div>
          <TranscriptAwaitingInput />
        </div>
      )}
      <StreamErrorBanner />
    </div>
  );
}
