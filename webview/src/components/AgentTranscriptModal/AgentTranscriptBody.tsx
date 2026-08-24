import { useMemo } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent } from '@/shared';
import { useAgentTranscript } from '@/hooks/useAgentTranscript';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { mergeToolResults } from '@/pages/ChatPage/mergeToolResults';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';

interface Props {
  transcriptDir: string | undefined;
  agent: WorkflowAgent | undefined;
}

export function AgentTranscriptBody(props: Props) {
  const { transcriptDir, agent } = props;
  const { t } = useTranslation('chat');

  // Changes whenever the agent's live stats change, so a running agent's
  // transcript refetches as WORKFLOW_PROGRESS updates arrive (see useAgentTranscript).
  const fingerprint = agent ? `${agent.tokens}:${agent.tools}:${Math.floor(agent.durationMs / 2000)}` : undefined;

  const { data, isPending, isError, isFetching } = useAgentTranscript(transcriptDir, agent?.agentId, fingerprint);

  const messages = useMemo(() => {
    if (!data) return [];
    const converted = data.entries.map((entry) => toInstance(LoadedMessageDto, entry));
    return mergeToolResults(converted);
  }, [data]);

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
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {data?.truncated && (
        <div className="text-[0.8461rem] text-text-primary/50 text-center pb-2">
          {t('backgroundTasks.transcriptModal.truncated', { count: messages.length })}
        </div>
      )}
      {messages.map((message) => (
        <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
      ))}
      {/* Agent is still running and a background refetch is in flight — a
          small "live" cue rather than a jarring full-screen loader, since the
          messages above are still valid while the refresh lands (#347 follow-up). */}
      {agent.status === 'running' && isFetching && (
        <div className="flex items-center gap-1.5 text-[0.7692rem] text-text-tertiary pt-1">
          <ArrowPathIcon className="w-3 h-3 animate-spin" />
          {t('backgroundTasks.transcriptModal.updating')}
        </div>
      )}
    </div>
  );
}
