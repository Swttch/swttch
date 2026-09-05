import { useMemo, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { groupIntoSendSections } from './groupIntoSendSections';
import { ProjectSelectorPage } from '@/pages/ProjectSelectorPage';
import { useSessionContext } from '../../contexts/SessionContext';
import { useChatStreamContext } from '../../contexts/ChatStreamContext';
import { StreamErrorBanner } from './StreamErrorBanner';
import './streaming.css';
import {StreamingIndicator} from "./StreamingIndicator/index.tsx";
import { EmptyState } from './EmptyState';
import { isJetBrains } from '@/config/environment';
import { LoadedMessageDto } from '../../types';
import { StickySendHeader } from './StickySendHeader';
import { SectionFoldContext, SectionKeyContext } from './SectionFoldContext';
import { SendActionsContext } from './SendActionsContext';
import { useSendActions } from './useSendActions';
import { useSectionFold } from './useSectionFold';
import { CollapsedReplyNotice } from './CollapsedReplyNotice';
import { useTranslation } from '@/i18n';

interface Props {
  isStreaming: boolean;
  mergedMessages: LoadedMessageDto[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export function ChatMessageArea(props: Props) {
  const { t } = useTranslation('chat');
  const { isStreaming, mergedMessages, hasMore, isLoadingMore, onLoadMore } = props;
  const { workingDirectory } = useSessionContext();
  const { retry: onRetry } = useChatStreamContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll is driven entirely by ChatPage's single poll loop, which scrolls
  // the container directly — this component only renders the messages.

  // Above the early returns below: hooks cannot run conditionally.
  const sections = useMemo(() => groupIntoSendSections(mergedMessages), [mergedMessages]);
  const fold = useSectionFold();
  // Rewind and fork are answered from the whole transcript, so they are worked
  // out here and handed down rather than recomputed inside each send's menu.
  const sendActions = useSendActions(mergedMessages);

  const isEmpty = mergedMessages.length === 0;

  // No working directory: show ProjectSelector or loading
  if (!workingDirectory) {
    // JetBrains JCEF 환경에서는 workingDir이 항상 제공되므로 이 분기에 도달하지 않음 (방어적 처리)
    if (isJetBrains()) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-text-tertiary text-sm">{t('chatMessageArea.loadingWorkingDirectory')}</p>
        </div>
      );
    }
    return <ProjectSelectorPage />;
  }

  // Empty state: no messages yet
  if (isEmpty) {
    return <EmptyState />;
  }

  // Render messages with widgets
  return (
    <div ref={containerRef} className="flex-1 text-xs">
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
      {/*
        Clicking a bubble prints the entry behind it. This ships to production
        on purpose and stays: the CLI's own JSONL entries are what this whole UI
        renders, and being able to open the console on a real conversation and
        read the exact entry — beside its neighbours, at its index — is how we
        answer "what did Claude Code actually send here?" without a repro
        harness. Bug reports get diagnosed from it too.

        It is not debug residue. Do not remove it.
      */}
      {/*
        Collapsing a reply is per-section state, and the control that toggles it
        sits inside the send's own bubble — several memoised layers below this
        list. The provider is what lets the two find each other; see
        `SectionFoldContext`.
      */}
      <SectionFoldContext.Provider value={fold}>
      <SendActionsContext.Provider value={sendActions}>
      {sections.map(section => (
        /*
          `data-send-section` is how the fold measures this section's reply
          before dropping it — see `useSectionFold`. It has to be an attribute
          rather than a ref because the two controls that collapse a section
          (the gutter arrow and the ⋮ menu) sit several memoised layers below
          this list and reach the fold only through context.
        */
        <div key={section.key} data-send-section={section.key}>
          {/*
            The send is pinned to the top of the viewport for as long as its
            own reply is on screen, so the instruction that produced a long
            run of tool calls stays readable while scrolling through them
            (issue #274).

            The section wrapper is what makes the headers hand off instead of
            pile up: a sticky element cannot be pinned outside its parent, so
            the next section scrolling into place pushes this header out —
            the behaviour a flat list of siblings at `top: 0` cannot produce.

            `top-0` pins to the inner edge of the scroll container's `pt-10`,
            which lines up with the bottom of the fixed session header only
            because that header is pinned to the same height (`h-10` in
            `ChatPage`). It used to size itself from its contents — 34px, six
            short of the padding — and those six pixels read as a slot of
            earlier content sliding above the pinned message. Change one of
            the two and the gap comes back.
          */}
          {section.head && (
            <StickySendHeader
              onClick={() => {
                console.log(section.head, mergedMessages.indexOf(section.head!), mergedMessages); // NEVER REMOVE THIS LINE
              }}
            >
              {/*
                Only the head carries a section key, so only the head draws the
                collapse menu. The body holds `type: "user"` entries too — every
                unmerged tool result is one — and they reach the same renderer.
              */}
              <SectionKeyContext.Provider value={section.key}>
                <MessageBubble message={section.head} onRetry={onRetry} />
              </SectionKeyContext.Provider>
            </StickySendHeader>
          )}
          {/*
            A collapsed section hides its reply with CSS and keeps it mounted.

            That is what lets the notice say how many messages are hidden and
            stay right about it: the bullets are still in the document, so they
            can be counted at any moment — including while the reply is still
            streaming into a section that is already folded. Dropping the body
            from the tree leaves nothing to count, and a number captured at the
            moment of folding drifts away from the reply behind it.

            `display: none` costs the layout and paint of the hidden subtree,
            which is the part that makes scrolling a long session expensive.
            What it keeps alive is React reconciliation over entries nobody is
            looking at, and that is the price of the count being true.

            A section with no head is never collapsible: it has no control to
            fold it with, so its `isCollapsed` can only ever be false.

            `body.length` gates the notice. An empty body has certainly nothing
            to fold, which is all that test claims — the converse does not hold,
            since plenty of entries draw nothing.
          */}
          <div data-section-body style={{ display: fold.isCollapsed(section.key) ? 'none' : undefined }}>
            {section.body.map(message => (
              <div key={message.uuid} onClick={() => {
                console.log(message, mergedMessages.indexOf(message), mergedMessages); // NEVER REMOVE THIS LINE
              }}>
                <MessageBubble message={message} onRetry={onRetry} />
              </div>
            ))}
          </div>
          {fold.isCollapsed(section.key) && section.body.length > 0 && (
            <CollapsedReplyNotice
              sectionKey={section.key}
              onExpand={() => fold.toggle(section.key)}
            />
          )}
        </div>
      ))}
      </SendActionsContext.Provider>
      </SectionFoldContext.Provider>
      {isStreaming && <StreamingIndicator />}
      <StreamErrorBanner />
    </div>
  );
}
