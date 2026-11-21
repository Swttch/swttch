import { useMemo } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskOutput } from '@/hooks/useBackgroundTaskOutput';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { mergeToolResults } from '@/pages/ChatPage/mergeToolResults';
import { mergeSplitThinkingMessages } from '@/pages/ChatPage/mergeSplitThinkingMessages';
import { useAgentRearmKey } from './agentRearmKey';
import { useGlideOnSend } from './useGlideOnSend';
import { DETAIL_STORAGE_KEY } from './detailScroll';
import { AgentTranscriptView } from './AgentTranscriptView';
import { runFactsOfTask } from './AgentDetailHeader';

interface Props {
  task: WorkflowTask;
  outputFile: string | undefined;
  /** The lookup came to nothing for a task that is over: there is no file to wait for. */
  unavailable?: boolean;
  /**
   * How many messages the user has sent from this modal. Each one switches
   * following back on, the way sending in the main chat does.
   */
  sendCount: number;
  /** Tighter sides, for the side panel. */
  compact?: boolean;
}

/**
 * Detail body for a single backgrounded Agent/Task call (task_type
 * 'local_agent'). Its output file is its own JSONL transcript — the same
 * shape as a workflow agent's `agent-<id>.jsonl` — so this parses it the same
 * way AgentTranscriptBody does, rather than dumping it as raw text the way
 * BackgroundTaskOutputBody does for a plain Bash task's actual shell log
 * (issue #383).
 *
 * Sourced from the push-based live-watch text (`useBackgroundTaskOutput`,
 * already built for the Bash case) rather than a poll-based structured-entry
 * fetch: the backend has no notion of "this file is JSONL", it just watches
 * bytes, so parsing the pushed text into entries is a frontend-only concern.
 */
export function AgentOutputTranscriptBody(props: Props) {
  const { task, outputFile, unavailable = false, sendCount, compact } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';

  const { text, loading, truncated, loadEarlier, loadingEarlier } = useBackgroundTaskOutput(outputFile);

  const messages = useMemo(() => {
    if (!text) return [];
    const entries = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          // A stray non-JSON line, or the half-written last line of a record that is still being written —
          // skip it rather than let one bad line blank the whole transcript.
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    const converted = entries.map((entry) => toInstance(LoadedMessageDto, entry));
    return mergeToolResults(mergeSplitThinkingMessages(converted));
  }, [text]);

  // The same auto-scroll as the main chat; see useAutoScroll.
  //
  // The placeholders below take the scrolling area's place, but only before
  // the first entry: a push only ever brings the whole window as it is now, so
  // for one output file the text never goes back to loading or to empty.
  const rearmKey = useAgentRearmKey(messages, sendCount);
  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
    resetKey: outputFile,
    storageKey: DETAIL_STORAGE_KEY,
    hasContent: messages.length > 0,
    isStreaming: isRunning,
    rearmKey,
    repositionOnRemount: true,
  });
  useGlideOnSend(sendCount, scrollToBottom);

  if (!outputFile && unavailable) {
    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.empty')}</div>;
  }

  if (!outputFile || loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        {t('backgroundTasks.transcriptModal.starting')}
      </div>
    );
  }

  if (messages.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-text-primary/50 text-[0.9230rem]">{t('backgroundTasks.transcriptModal.empty')}</div>;
  }

  return (
    <AgentTranscriptView
      compact={compact}
      endStatus={task.status === 'running' ? undefined : task.status === 'failed' || task.status === 'stopped' ? task.status : 'completed'}
      messages={messages}
      isRunning={isRunning}
      hasEarlier={truncated}
      loadingEarlier={loadingEarlier}
      onLoadEarlier={loadEarlier}
      scroll={{ scrollRef, showScrollButton, scrollToBottom }}
      runFacts={runFactsOfTask(task, t)}
    />
  );
}
