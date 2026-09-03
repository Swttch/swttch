import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskOutput } from '@/hooks/useBackgroundTaskOutput';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { mergeToolResults } from '@/pages/ChatPage/mergeToolResults';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';
import { StreamingIndicator } from '@/pages/ChatPage/StreamingIndicator';

interface Props {
  task: WorkflowTask;
  outputFile: string | undefined;
}

/** How close to the bottom (px) counts as "already at the bottom" for auto-scroll. */
const BOTTOM_THRESHOLD_PX = 24;

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
  const { task, outputFile } = props;
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
    return mergeToolResults(converted);
  }, [text]);

  // Same auto-scroll contract as the main chat and BackgroundTaskOutputBody:
  // follow new content while already at the bottom, stop the instant the
  // reader scrolls up to read something, and resume once they scroll back
  // down themselves (never yanked there by a push arriving mid-read).
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
  }, [text]);

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
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((message) => (
          <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
        ))}
        {/* Same cue the main chat shows below the latest bubble for the whole
            span of a turn — here, the whole span of the agent still running,
            regardless of whether its last parsed message already has text. */}
        {isRunning && <StreamingIndicator />}
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
