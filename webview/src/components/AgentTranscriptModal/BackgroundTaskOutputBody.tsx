import { useEffect, useRef, useState } from 'react';
import { ArrowPathIcon, ArrowDownIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskOutput } from '@/hooks/useBackgroundTaskOutput';

interface Props {
  task: WorkflowTask;
}

/** How close to the bottom (px) counts as "already at the bottom" for auto-scroll. */
const BOTTOM_THRESHOLD_PX = 24;

/**
 * A copy-to-run shell command for the task's own output file: `tail -f` while
 * running (this modal is effectively doing that watching itself already — this
 * lets the user watch it in their own terminal too), `cat` once finished
 * (tailing a file nothing will ever append to again is a command that just
 * hangs, so switching commands here isn't cosmetic — a running tail left
 * open past completion is a resource that never lets go).
 */
function CommandLine(props: { outputFile: string; isRunning: boolean }) {
  const { outputFile, isRunning } = props;
  const { t } = useTranslation('chat');
  const [copied, setCopied] = useState(false);
  const command = isRunning ? `tail -f -n +1 ${outputFile}` : `cat ${outputFile}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-surface-base border border-border-subtle px-2.5 py-1.5">
      <code className="flex-1 min-w-0 truncate font-mono text-[0.8461rem] text-text-primary/80">{command}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 rounded hover:bg-surface-hover transition-colors"
        title={t('backgroundTasks.transcriptModal.copyCommand')}
      >
        {copied ? (
          <ClipboardDocumentCheckIcon className="w-4 h-4 text-state-success-fg" />
        ) : (
          <ClipboardDocumentIcon className="w-4 h-4 text-text-tertiary" />
        )}
      </button>
    </div>
  );
}

/**
 * Detail body for a plain background Bash task (task_type 'local_bash') —
 * shown instead of AgentTranscriptBody, since these have no agents to pick a
 * transcript from, only a raw stdout/stderr log (issue #347).
 */
export function BackgroundTaskOutputBody(props: Props) {
  const { task } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';

  const { text, truncated, loading } = useBackgroundTaskOutput(task.outputFile);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user was already at (or near) the bottom right before this
  // render's text landed — decided once per text change, not tracked as its
  // own piece of state, so a manual scroll-up during a live tail isn't
  // fought by an effect re-pulling the view back down.
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

  if (!task.outputFile) {
    // The command just started — its immediate tool_result (which carries the
    // output file path) hasn't landed yet. Distinct from "loading" below: this
    // is "nothing to fetch yet", not "fetching and waiting".
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        {t('backgroundTasks.transcriptModal.starting')}
      </div>
    );
  }

  return (
    // The command box stays fixed (shrink-0); only the terminal pane below it
    // scrolls. Both used to share one overflow-y-auto container, so scrolling
    // the log also scrolled the command box off-screen — a detail view isn't
    // supposed to hide the very thing it's showing detail about.
    <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
      <div className="shrink-0">
        <CommandLine outputFile={task.outputFile} isRunning={isRunning} />
      </div>

      <div className="relative mt-3 h-[60vh] shrink-0">
        {/* absolute inset-0 instead of h-full: a percentage height on a flex
            item whose own height comes from flex-grow (not an explicit CSS
            height) does not reliably resolve through this many nested flex
            containers — it measured out to the content's full height instead
            of the 414px the parent actually renders at, so the scrollbar
            never engaged and the command box above got pushed off-screen by
            a "scrolling" pane that was actually just growing forever. */}
        <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              {t('backgroundTasks.transcriptModal.loading')}
            </div>
          ) : !text ? (
            <div className="h-full flex items-center justify-center text-text-primary/50 text-[0.9230rem]">
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  {t('backgroundTasks.transcriptModal.starting')}
                </span>
              ) : (
                t('backgroundTasks.transcriptModal.empty')
              )}
            </div>
          ) : (
            <>
              {truncated && (
                <div className="text-[0.8461rem] text-text-primary/50 text-center pb-2">
                  {t('backgroundTasks.transcriptModal.truncated', { count: text.length })}
                </div>
              )}
              {/* Terminal styling (near-black bg, green-on-black text) so this
                  reads as a shell output pane, not a chat message — the same
                  cue the CommandLine box above sets up. min-h-full: a short
                  log (e.g. 5 lines) would otherwise leave the terminal box
                  only as tall as its text, with a stretch of plain modal
                  background below it that reads as a rendering glitch rather
                  than "empty terminal" — filling the pane makes it look like
                  what it is, a shell window with a few lines in it. */}
              <pre className="min-h-full rounded-md bg-black/90 border border-border-subtle p-3 whitespace-pre-wrap break-words font-mono text-[0.8461rem] text-emerald-400/90 leading-relaxed">
                {text}
              </pre>
            </>
          )}
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
    </div>
  );
}
