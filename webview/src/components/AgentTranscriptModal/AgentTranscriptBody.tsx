import { useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent, WorkflowStatus } from '@/shared';
import { agentDisplayStatus } from '@/utils/workflowFormat';
import { useAgentTranscript, type AgentTranscriptData } from '@/hooks/useAgentTranscript';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { mergeToolResults } from '@/pages/ChatPage/mergeToolResults';
import { mergeSplitThinkingMessages } from '@/pages/ChatPage/mergeSplitThinkingMessages';
import { findNewestUserUuid } from '@/pages/ChatPage/paging';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';
import { StreamingIndicator } from '@/pages/ChatPage/StreamingIndicator';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { agentRearmKey } from './agentRearmKey';
import { useGlideOnSend } from './useGlideOnSend';
import { DETAIL_STORAGE_KEY } from './detailScroll';

interface Props {
  transcriptDir: string | undefined;
  agent: WorkflowAgent | undefined;
  taskStatus: WorkflowStatus;
  /**
   * How many messages the user has sent from this modal. Each one switches
   * following back on, the way sending in the main chat does.
   */
  sendCount: number;
}

/**
 * One workflow agent's transcript.
 *
 * Meant to be mounted once per agent (the modal keys it by agent id), so the
 * scroll state of one agent is never carried over to the next one picked.
 */
export function AgentTranscriptBody(props: Props) {
  const { transcriptDir, agent, taskStatus, sendCount } = props;
  const { t } = useTranslation('chat');

  // Changes whenever the agent's live stats change, so a running agent's
  // transcript refetches as WORKFLOW_PROGRESS updates arrive (see useAgentTranscript).
  const fingerprint = agent
    ? `${agent.tokens ?? 0}:${agent.toolCalls ?? 0}:${Math.floor((agent.durationMs ?? 0) / 2000)}`
    : undefined;

  const { data, isPending, isError } = useAgentTranscript(transcriptDir, agent?.agentId, fingerprint);

  // The fingerprint is part of the query key, so every refetch is a new query
  // that starts out with no data. Showing that literally swapped the transcript
  // for a spinner and back on every tool call, and the scrolling area came back
  // at the top each time (issue #511). The transcript already on screen stays
  // until the next one is in, and through a failed refetch as well.
  const [lastLoaded, setLastLoaded] = useState<AgentTranscriptData | undefined>(undefined);
  useEffect(() => {
    if (data) setLastLoaded(data);
  }, [data]);
  const shown = data ?? lastLoaded;

  // Keeping the old transcript through a failed refetch must not pass it off as
  // current: a refetch that keeps failing would leave a frozen transcript that
  // looks live. Raised by a failure, cleared only by the next success, so the
  // retry that follows each progress tick does not make it blink.
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => {
    if (data) setRefreshFailed(false);
    else if (isError) setRefreshFailed(true);
  }, [data, isError]);

  const messages = useMemo(() => {
    if (!shown) return [];
    const converted = shown.entries.map((entry) => toInstance(LoadedMessageDto, entry));
    return mergeToolResults(mergeSplitThinkingMessages(converted));
  }, [shown]);

  const isRunning = agent ? agentDisplayStatus(agent.state, taskStatus) === 'running' : false;
  const newestUserUuid = useMemo(() => findNewestUserUuid(messages), [messages]);
  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
    resetKey: agent?.agentId,
    storageKey: DETAIL_STORAGE_KEY,
    repositionOnRemount: true,
    hasContent: messages.length > 0,
    isStreaming: isRunning,
    rearmKey: agentRearmKey(newestUserUuid, sendCount),
  });
  useGlideOnSend(sendCount, scrollToBottom);

  if (!agent) {
    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.noAgents')}</div>;
  }

  if (messages.length === 0) {
    if (isPending) {
      return (
        <div className="flex-1 flex items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
          <ArrowPathIcon className="w-4 h-4 animate-spin" />
          {t('backgroundTasks.transcriptModal.loading')}
        </div>
      );
    }

    if (isError) {
      return <div className="flex-1 flex items-center justify-center text-red-500 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.error')}</div>;
    }

    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.empty')}</div>;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="relative flex-1 min-h-0">
        {/* absolute inset-0 rather than h-full, for the reason given in
            BackgroundTaskOutputBody: a percentage height inside a flex item
            sized by flex-grow does not reliably resolve. */}
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-4 py-3 space-y-3">
          {shown?.truncated && (
            <div className="text-[0.8461rem] text-text-primary/50 text-center pb-2">
              {t('backgroundTasks.transcriptModal.truncated', { count: messages.length })}
            </div>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
          ))}
          {/* Same cue the main chat shows below the latest bubble for the whole
              span of a turn — here, the whole span of this agent still running. */}
          {isRunning && <StreamingIndicator />}
        </div>

        {showScrollButton && (
          <ScrollToBottomButton onClick={scrollToBottom} placementClassName="bottom-3 start-1/2 -translate-x-1/2" />
        )}
      </div>

      {/* A sibling below the scrolling area, never inside it and never in its
          place, so showing or hiding it does not replace the scrolling element.
          Below rather than above: the area gives up its height at the bottom,
          so the lines the reader is looking at stay where they are on screen. */}
      {refreshFailed && (
        <div role="status" className="shrink-0 px-4 py-1.5 border-t border-border-subtle bg-state-warning-bg text-state-warning-fg text-[0.8461rem]">
          {t('backgroundTasks.transcriptModal.refreshFailed')}
        </div>
      )}
    </div>
  );
}
