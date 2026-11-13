import { useMemo, useRef, type ReactNode } from 'react';
import { withoutPeerSections } from './peerSections';
import type { LoadedMessageDto } from '../../../types';
import type { SessionSend } from '@/shared';
import type { SendSection } from '../groupIntoSendSections';
import { ProjectSelectorPage } from '@/pages/ProjectSelectorPage';
import { useSessionContext } from '../../../contexts/SessionContext';
import { useChatStreamContext } from '../../../contexts/ChatStreamContext';
import { StreamErrorBanner } from '../StreamErrorBanner';
import { TranscriptStreamingIndicator } from './TranscriptStreamingIndicator';
import { TranscriptAwaitingInput } from './TranscriptAwaitingInput';
import { TranscriptHeldMessages } from './TranscriptHeldMessages';
import { TranscriptBackgroundWorking, useBackgroundTaskStart } from './TranscriptBackgroundWorking';
import { PendingSentMessages } from '../PendingSentMessages';
import { runningActivity } from './streamingActivity';
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
export function TranscriptArea(props: TranscriptAreaProps) {
  const { t } = useTranslation('chat');
  const { isStreaming, awaitingInput = false, trailing = null, disconnectCountdown = null, apiRetry = null, mergedMessages, hasMore, isLoadingMore, onLoadMore, findInChat = LOADED_ONLY } = props;
  const sections = useMemo(() => withoutPeerSections(props.sections), [props.sections]);
  const { workingDirectory } = useSessionContext();
  const { retry: onRetry, messages: streamMessages, isStreaming: turnRunning } = useChatStreamContext();
  const waitedCall = useMemo(() => (isStreaming ? runningActivity(streamMessages) : null), [isStreaming, streamMessages]);
  const heldCall = useMemo(() => (awaitingInput && turnRunning ? runningActivity(streamMessages) : null), [awaitingInput, turnRunning, streamMessages]);
  const backgroundWorking = !isStreaming && !awaitingInput && useBackgroundTaskStart() !== null;
  const containerRef = useRef<HTMLDivElement>(null);

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
          <p className="text-text-tertiary text-sm">{t('chatMessageArea.loadingWorkingDirectory')}</p>
        </div>
      );
    }
    return <ProjectSelectorPage />;
  }

  if (isEmpty) return <EmptyState />;

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-[calc(var(--chat-column-max,70rem)_-_var(--chat-column-px,2rem))] mx-auto sm:px-4 text-xs antialiased">
      <ChatSearchBar search={search} />
      <SelectionReplyLayer containerRef={containerRef} />
      {(isLoadingMore || hasMore) && (
        <div className="flex justify-center py-4">
          {isLoadingMore ? (
            <span className="inline-flex items-center gap-2 text-xs text-text-tertiary">
              <span className="w-3.5 h-3.5 border-2 border-border-default border-t-text-secondary rounded-full animate-spin" />
              {t('chatMessageArea.loadingEarlierMessages')}
            </span>
          ) : (
            <button
              onClick={onLoadMore}
              className="px-4 py-1.5 bg-surface-raised border border-border-default rounded-full text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-200 shadow-sm"
            >
              {t('chatMessageArea.loadOlderMessages')}
            </button>
          )}
        </div>
      )}
      <SectionFoldContext.Provider value={fold}>
        <SendActionsContext.Provider value={sendActions}>
          <LastEntryContext.Provider value={lastEntryUuid(mergedMessages)}>
            {sections.map((section, sectionIndex) => (
              /*
                `data-send-section` and the sentinel are what the send index on the
                right reads to jump to a send and to know which one the reader is on
                (see SendIndex). They are the same attributes the classic chat
                carries, so the rail works the same on both.
              */
              <div key={section.key} data-send-section={section.key}>
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
                        onClick={() => {
                          console.log(section.head, mergedMessages.indexOf(section.head!), mergedMessages); // NEVER REMOVE THIS LINE
                        }}
                      >
                        <TranscriptUserMessage message={section.head} sectionKey={section.key} />
                      </div>
                    </SectionKeyContext.Provider>
                  </>
                )}
                {/* Sent while the card holds the turn: right after the latest message, above the calls still running, as in the desktop app. */}
                {awaitingInput && sectionIndex === sections.length - 1 && <TranscriptHeldMessages />}
                <div data-section-body data-after-send={section.head ? '' : undefined} className={`${sectionIndex < sections.length - 1 ? 'pb-[13px]' : isStreaming || awaitingInput || backgroundWorking ? 'pb-0' : 'pb-[54px]'}`}>
                  <TranscriptBody body={section.body} mergedMessages={mergedMessages} onRetry={onRetry} turnRunning={isStreaming && sectionIndex === sections.length - 1} />
                  {/* The turn's wrap-up is drawn here, after its last message, not where its call sits: a recap as text until the closing message begins, then the question and its answers. */}
                  <TranscriptWrapUp body={section.body} next={sections[sectionIndex + 1]?.head ?? null} />
                </div>
              </div>
            ))}
          </LastEntryContext.Provider>
        </SendActionsContext.Provider>
      </SectionFoldContext.Provider>
      <PendingSentMessages />
      {!isStreaming && <TranscriptBackgroundWorking hidden={awaitingInput} />}
      {/* While a call is being waited on, the run of calls that holds it is the working indicator (see TranscriptToolRun); this line is for the rest of the turn, when the model thinks or writes. A dropped connection and the CLI's retries still say so here. */}
      {isStreaming && (waitedCall === null || disconnectCountdown !== null || apiRetry !== null) && (
        <div>
          <TranscriptStreamingIndicator countdownSeconds={disconnectCountdown} apiRetry={apiRetry} />
        </div>
      )}
      {awaitingInput && turnRunning && heldCall === null && (
        <div>
          <TranscriptAwaitingInput />
        </div>
      )}
      {trailing}
      <StreamErrorBanner />
    </div>
  );
}
