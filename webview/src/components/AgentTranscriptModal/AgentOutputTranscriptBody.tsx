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
import { findNewestUserUuid } from '@/pages/ChatPage/paging';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';
import { StreamingIndicator } from '@/pages/ChatPage/StreamingIndicator';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { agentRearmKey } from './agentRearmKey';
import { useGlideOnSend } from './useGlideOnSend';
import { DETAIL_STORAGE_KEY } from './detailScroll';

interface Props {
  task: WorkflowTask;
  outputFile: string | undefined;
  /**
   * How many messages the user has sent from this modal. Each one switches
   * following back on, the way sending in the main chat does.
   */
  sendCount: number;
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
  const { task, outputFile, sendCount } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';

  const { text, loading } = useBackgroundTaskOutput(outputFile);

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
          // A truncated leading line (the backend caps by character count,
          // which can cut a JSON line mid-way) or a stray non-JSON line —
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
  // the first entry: a push only ever brings the whole file as it is now, so
  // for one output file the text never goes back to loading or to empty.
  const newestUserUuid = useMemo(() => findNewestUserUuid(messages), [messages]);
  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
    resetKey: outputFile,
    storageKey: DETAIL_STORAGE_KEY,
    hasContent: messages.length > 0,
    isStreaming: isRunning,
    rearmKey: agentRearmKey(newestUserUuid, sendCount),
    repositionOnRemount: true,
  });
  useGlideOnSend(sendCount, scrollToBottom);

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
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((message) => (
          <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
        ))}
        {/* Same cue the main chat shows below the latest bubble for the whole
            span of a turn — here, the whole span of the agent still running,
            regardless of whether its last parsed message already has text. */}
        {isRunning && <StreamingIndicator />}
      </div>

      {showScrollButton && (
        <ScrollToBottomButton onClick={scrollToBottom} placementClassName="bottom-3 start-1/2 -translate-x-1/2" />
      )}
    </div>
  );
}
