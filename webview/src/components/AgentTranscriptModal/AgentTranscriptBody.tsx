import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent } from '@/shared';
import { useAgentTranscript } from '@/hooks/useAgentTranscript';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { mergeToolResults } from '@/pages/ChatPage/mergeToolResults';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';
import { StreamingIndicator } from '@/pages/ChatPage/StreamingIndicator';

interface Props {
  transcriptDir: string | undefined;
  agent: WorkflowAgent | undefined;
}

/** How close to the bottom (px) counts as "already at the bottom" for auto-scroll. */
const BOTTOM_THRESHOLD_PX = 24;

export function AgentTranscriptBody(props: Props) {
  const { transcriptDir, agent } = props;
  const { t } = useTranslation('chat');

  // Changes whenever the agent's live stats change, so a running agent's
  // transcript refetches as WORKFLOW_PROGRESS updates arrive (see useAgentTranscript).
  const fingerprint = agent ? `${agent.tokens}:${agent.tools}:${Math.floor(agent.durationMs / 2000)}` : undefined;

  const { data, isPending, isError } = useAgentTranscript(transcriptDir, agent?.agentId, fingerprint);

  const messages = useMemo(() => {
    if (!data) return [];
    const converted = data.entries.map((entry) => toInstance(LoadedMessageDto, entry));
    return mergeToolResults(converted);
  }, [data]);

  // Same auto-scroll contract as the main chat and AgentOutputTranscriptBody:
  // follow new content while already at the bottom, stop the instant the
  // reader scrolls up to read something, and resume once they scroll back
  // down themselves (never yanked there by a refetch landing mid-read).
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(true);
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
    wasAtBottomRef.current = atBottom;
    if (atBottom) setShowJumpToBottom(false);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasAtBottomRef.current = true;
    setShowJumpToBottom(false);
  };

  if (!agent) {
    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.noAgents')}</div>;
  }

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

  if (messages.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.empty')}</div>;
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-3 space-y-3">
        {data?.truncated && (
          <div className="text-[0.8461rem] text-text-primary/50 text-center pb-2">
            {t('backgroundTasks.transcriptModal.truncated', { count: messages.length })}
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
        ))}
        {/* Same cue the main chat shows below the latest bubble for the whole
            span of a turn — here, the whole span of this agent still running. */}
        {agent.status === 'running' && <StreamingIndicator />}
      </div>

      {showJumpToBottom && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 start-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-raised border border-border-default shadow-lg text-[0.8461rem] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <ArrowDownIcon className="w-3.5 h-3.5" />
          {t('backgroundTasks.transcriptModal.jumpToBottom')}
        </button>
      )}
    </div>
  );
}
