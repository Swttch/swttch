import { useRef } from 'react';
import { MessageBubble } from './MessageBubble';
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
      {mergedMessages.map((message, i) => (
        <div key={message.uuid} onClick={() => {
          console.log(message, i, mergedMessages); // NEVER REMOVE THIS LINE
        }}>
          <MessageBubble message={message} onRetry={onRetry} />
        </div>
      ))}
      {isStreaming && <StreamingIndicator />}
      <StreamErrorBanner />
    </div>
  );
}
