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
      {sections.map(section => (
        <div key={section.key}>
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
            <div
              className="sticky top-0 z-[1]"
              /*
                Content passing under the pinned message fades out instead of
                meeting a hard edge, the way Cursor's extension does it.

                A flat `bg-surface-base` cut the scrolled text off along a line
                that read as a seam. The gradient is opaque across the message
                itself and falls off below it, so text thins out as it travels
                under rather than disappearing at a boundary.

                `--surface-base-rgb` is the channel triplet the theme exposes
                for exactly this (Tailwind's own `bg-surface-base/80` is built
                on it), so the alpha goes straight into `rgb(... / a)` and the
                fade follows the IDE theme along with everything else.

                The falloff is squeezed into the last stretch (opaque to 88%,
                then 0.6 / 0.3 / 0) so it lands on the trailing edge rather
                than washing over the message box itself — the box keeps a
                solid backdrop and stays readable while text thins out below
                it. Raise 88% for an even later, sharper fade; spread the
                three tail stops apart for a softer one.
              */
              style={{
                background:
                  'linear-gradient(to bottom,' +
                  ' rgb(var(--surface-base-rgb)) 88%,' +
                  ' rgb(var(--surface-base-rgb) / 0.6) 90%,' +
                  ' rgb(var(--surface-base-rgb) / 0.3) 95%,' +
                  ' rgb(var(--surface-base-rgb) / 0) 100%)',
              }}
              onClick={() => {
                console.log(section.head, mergedMessages.indexOf(section.head!), mergedMessages); // NEVER REMOVE THIS LINE
              }}
            >
              <MessageBubble message={section.head} onRetry={onRetry} />
            </div>
          )}
          {section.body.map(message => (
            <div key={message.uuid} onClick={() => {
              console.log(message, mergedMessages.indexOf(message), mergedMessages); // NEVER REMOVE THIS LINE
            }}>
              <MessageBubble message={message} onRetry={onRetry} />
            </div>
          ))}
        </div>
      ))}
      {isStreaming && <StreamingIndicator />}
      <StreamErrorBanner />
    </div>
  );
}
