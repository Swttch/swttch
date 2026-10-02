import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskOutput } from '@/hooks/useBackgroundTaskOutput';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { parseAnsi } from '@/utils/ansi';
import { frontTrimKeptLength, frontTrimScrollTop, heightAfter } from '@/utils/frontTrim';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { DETAIL_STORAGE_KEY } from './detailScroll';

interface Props {
  task: WorkflowTask;
  outputFile: string | undefined;
}

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
 * shown instead of AgentTranscriptBody, since it has no agents to pick a
 * transcript from, only a raw stdout/stderr log (issue #347). `outputFile` is
 * resolved by the caller (useResolvedTaskOutputFile), not read off `task`
 * directly — see that hook for why the two can differ.
 */
export function BackgroundTaskOutputBody(props: Props) {
  const { task, outputFile } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';

  const { text, truncated, loading } = useBackgroundTaskOutput(outputFile);
  const segments = useMemo(() => parseAnsi(text), [text]);
  // The text as drawn, colour codes removed: the characters the pane holds.
  const shownText = useMemo(() => segments.map((segment) => segment.text).join(''), [segments]);

  // The same auto-scroll as the main chat; see useAutoScroll. The scrolling
  // area stays mounted through loading and an empty log, so no state here
  // takes its place.
  const { scrollRef, showScrollButton, scrollToBottom, prevScrollTopRef, lastScrollHeightRef, autoFollowRef } =
    useAutoScroll({
      resetKey: outputFile,
      storageKey: DETAIL_STORAGE_KEY,
      repositionOnRemount: true,
      hasContent: shownText.length > 0,
      isStreaming: isRunning,
      // A Bash task cannot be sent anything.
      rearmKey: null,
    });

  // Keep the reader on the line they were reading when the backend cuts the
  // log from the front (see frontTrim.ts). The counterpart of the main chat
  // holding its place when an older page is put in above: here text leaves
  // from above, so the view moves up by the height that left. Not needed while
  // following, which keeps the view at the bottom anyway.
  const preRef = useRef<HTMLPreElement>(null);
  const prevShownTextRef = useRef('');
  useLayoutEffect(() => {
    const prev = prevShownTextRef.current;
    prevShownTextRef.current = shownText;
    const el = scrollRef.current;
    const pre = preRef.current;
    if (!el || !pre || autoFollowRef.current) return;
    const kept = frontTrimKeptLength(prev, shownText);
    if (kept === null) return;
    const appended = heightAfter(pre, kept, shownText.length);
    if (appended === null) return;
    const top = frontTrimScrollTop({
      prevScrollTop: prevScrollTopRef.current,
      prevScrollHeight: lastScrollHeightRef.current,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      appendedHeight: appended,
    });
    if (top === null) return;
    el.scrollTop = top;
    // Sync scroll baselines
    prevScrollTopRef.current = el.scrollTop;
    lastScrollHeightRef.current = el.scrollHeight;
  }, [shownText, scrollRef, autoFollowRef, prevScrollTopRef, lastScrollHeightRef]);

  if (!outputFile) {
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
        <CommandLine outputFile={outputFile} isRunning={isRunning} />
      </div>

      {/* `flex-1 min-h-0`, not a slice of the viewport: `h-[60vh]` sized the
          pane against the window while the room it actually had was whatever
          the modal had left, and the two are not the same number. Measured at a
          640px window, the pane asked for 384px into a 367px gap and hung 16px
          past the modal, where `overflow-hidden` cut its bottom edge off. It
          got worse as the modal was dragged taller. Filling the leftover space
          is what the pane wanted all along. */}
      <div className="relative mt-3 flex-1 min-h-0">
        {/* absolute inset-0 instead of h-full: a percentage height on a flex
            item whose own height comes from flex-grow (not an explicit CSS
            height) does not reliably resolve through this many nested flex
            containers — it measured out to the content's full height instead
            of the 414px the parent actually renders at, so the scrollbar
            never engaged and the command box above got pushed off-screen by
            a "scrolling" pane that was actually just growing forever. */}
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              {t('backgroundTasks.transcriptModal.loading')}
            </div>
          ) : !text ? (
            // A command that has printed nothing yet still has a terminal, so
            // draw the same pane rather than a bare line on the modal's
            // background — an empty shell window reads as "nothing yet", while
            // an empty modal reads as a screen that failed to render.
            //
            // And it is not "starting": the task has been running for as long
            // as the card says (measured at 44s, and at seven hours for one
            // whose process had already been killed). Plenty of commands are
            // simply quiet — `sleep`, or anything that writes to a file.
            <pre className="min-h-full rounded-md bg-black/90 border border-border-subtle p-3 font-mono text-[0.8461rem] text-emerald-400/40 leading-relaxed">
              {isRunning
                ? t('backgroundTasks.transcriptModal.noOutputYet')
                : t('backgroundTasks.transcriptModal.noOutput')}
            </pre>
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
              <pre ref={preRef} className="min-h-full rounded-md bg-black/90 border border-border-subtle p-3 whitespace-pre-wrap break-words font-mono text-[0.8461rem] text-emerald-400/90 leading-relaxed">
                {/* Every tool a developer backgrounds writes colour, and as
                    plain text those codes bury the output they decorate. The
                    pane is dressed as a terminal, so it renders them. */}
                {segments.map((segment, i) =>
                  segment.className ? (
                    <span key={i} className={segment.className}>
                      {segment.text}
                    </span>
                  ) : (
                    segment.text
                  ),
                )}
              </pre>
            </>
          )}
        </div>

        {showScrollButton && (
          <ScrollToBottomButton onClick={scrollToBottom} placementClassName="bottom-3 start-1/2 -translate-x-1/2" />
        )}
      </div>
    </div>
  );
}
