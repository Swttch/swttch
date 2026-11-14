import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronRightIcon, ClipboardDocumentIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { openChatFile } from '@/utils/openChatFile';
import type { LoadedMessageDto } from '../../../types';
import type { WorkflowTask } from '@/shared';
import { ToolRenderer } from '../message-renderers/ToolRenderer';
import { toolResultText } from '../message-renderers/ToolRenderers/common/toolStatus';
import { HighlightedCode } from '../message-renderers/ToolRenderers/Mcp/Generic/HighlightedCode';
import { useTranscriptViewMode } from '../message-renderers/transcriptViewMode';
import { APP_EVENT_TOOL, type ToolCall } from './buildSegments';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useNow } from '@/hooks/useNow';
import { useOptionalWorkflowState } from '@/contexts/WorkflowStateContext';
import { ActivityGlyph, useActivityLabel, useFormatElapsed, useTurnSeconds } from './TranscriptActivity';
import type { WorkingActivity } from './WorkingMark';
import { runningActivity } from './streamingActivity';
import { FileChangeDetail } from './FileChangeDetail';
import { useDesktopSession } from '@/hooks/useDesktopSession';
import { DesktopSessionLink } from '../message-renderers/components/DesktopSessionLink';
import { StartedSessionLink, sessionLinkProps } from '../message-renderers/components/StartedSessionLink';
import { isCliSessionId, startedSessionOf } from '../message-renderers/utils/startedSessions';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { StreamingMessage } from '../StreamingMessage';
import { parseSessionDelivery } from '../message-renderers/ToolRenderers/SendMessageRenderer';
import './prose.css';
import { SessionGalleryViewer } from '@/components/SessionGalleryViewer';
import { stripImageNotes } from '../message-renderers/ToolRenderers/Mcp/Generic/formatMcpPayload';
import { toolResultPictureKeys } from '../message-renderers/ToolRenderers/common/toolResultImages';
import {
  browserToolOf,
  groupIntoRows,
  groupLabelParts,
  type GroupLabelParts,
  hasFailed,
  wasStopped,
  imagesOfResult,
  isExpandable,
  pathOf,
  renameOutcome,
  sentTo,
  rowLabel,
  sumLineStats,
  toolKindOf,
  type LineStats,
} from './toolSummary';

/**
 * The quiet grey of a summary line, measured off the desktop app (#9c9c9c), and the lighter grey it
 * takes on under the pointer. Neutral on purpose: the theme's own secondary text is tinted blue.
 */
const SUMMARY_TEXT = 'text-[var(--tr-muted)] hover:text-[var(--tr-hover)]';

/** The reply's own light grey, for the name of a file in a row: it stands out from the grey around it. */
const LINK_TEXT = 'text-[var(--tr-text)]';

/** Borders of a group's box and of the lines inside it: fainter than the theme's, as the desktop app draws them. */
const BOX_BORDER = 'border-border-default/70';

/** Lines put in (green) and taken out (red), shown after a file change's label; nothing when both are zero. */
function LineStatsView({ stats }: { stats: LineStats }) {
  if (stats.added === 0 && stats.removed === 0) return null;
  return (
    <span className="flex-shrink-0 font-mono text-[0.8461rem]">
      {stats.added > 0 && <span className="text-green-500">+{stats.added}</span>}
      {stats.removed > 0 && <span className="ms-2 text-red-500">−{stats.removed}</span>}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRightIcon
      className={`-ms-1.5 w-4 h-4 flex-shrink-0 transition-transform rtl:-scale-x-100 ${open ? 'rotate-90 rtl:-rotate-90' : ''}`}
    />
  );
}

/** The text a tool printed, without the list of open tabs the browser tools end it with. */
function withoutTabContext(output: string): string {
  const at = output.indexOf('\n\nTab Context:');
  return (at === -1 ? output : output.slice(0, at)).trim();
}

/** Under a code box whose call finished and printed nothing: a quiet line saying so, as the desktop app does. */
function NoOutput({ call, output }: { call: ToolCall; output: string }) {
  const { t } = useTranslation('chat');
  if (output.trim() !== '' || !call.toolUse.tool_result) return null;
  // A call the user stopped has no output to wait for: it was cut off, and the desktop app says that where the output would be.
  const text = wasStopped(call) ? t('transcript.tools.interruptedNote') : t('transcript.tools.noOutput');
  return <div className="px-1 pb-3 text-[0.9375rem] text-[var(--tr-muted)]">{text}</div>;
}

/** A copy button over a code box, in its top corner. */
function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation('chat');
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard.writeText(text).then(
          () => toast.success(t('sendActions.copyDone')),
          () => toast.error(t('sendActions.copyFailed')),
        );
      }}
      className="absolute end-2 top-2 rounded p-1 text-[var(--tr-muted)] hover:text-[var(--tr-text)] hover:bg-surface-hover"
      aria-label={t('sendActions.copyMessage')}
    >
      <ClipboardDocumentIcon className="w-4 h-4" />
    </button>
  );
}

/** What a tool printed. A command that failed starts it with "Exit code N": that line is drawn in red, in words. */
function OutputText({ output }: { output: string }) {
  const { t } = useTranslation('chat');
  const exit = /^Exit code (\d+)\n?/.exec(output);
  const rest = exit ? output.slice(exit[0].length) : output;
  if (!output) return null;
  return (
    <div className="px-3 pb-3 font-mono text-[0.8461rem] leading-[1.5]">
      {exit && <div className="text-red-400">{t('transcript.tools.exitCode', { code: exit[1] })}</div>}
      {rest && (
        <pre className="mt-2 whitespace-pre-wrap break-words text-[var(--tr-muted)] max-h-[24rem] overflow-y-auto">{rest}</pre>
      )}
    </div>
  );
}

/** A box titled with the tool's name, around code and what it printed. */
function CodeBox({ title, code, language, output }: { title: string; code: string; language: string; output: string }) {
  return (
    <div className={`relative mb-2 rounded-lg border ${BOX_BORDER} overflow-hidden`} data-transcript-code-box>
      <div className="px-3 pt-2 pb-1 text-[0.8461rem] text-[var(--tr-muted)]">{title}</div>
      <CopyButton text={code} />
      <pre className="mx-2 mb-2 max-h-[16rem] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-hover px-3 py-2 font-mono text-[0.8461rem] leading-[1.5] text-[var(--tr-text)]">
        {language === 'bash' && <span className="text-[var(--tr-muted)] select-none">$ </span>}
        <HighlightedCode text={code} language={language} />
      </pre>
      <OutputText output={output} />
    </div>
  );
}

/** The most thumbnails a line shows; the rest of its pictures are counted ("+3"). The desktop app shows three. */
const MAX_THUMBNAILS = 3;

/** What a strip does at its end when what it holds is wider than it is: the last 1.5rem fades out instead of being cut or ended with dots. */
const FADE_END =
  '[mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,black_calc(100%_-_1.5rem),transparent)]';

/**
 * The line over a group of calls: one line whose phrases fade out at its end when they do not fit. "Other actions" and the
 * count of failed calls are the tail, kept in view after the faded part. A file that was read is a link that opens it.
 */
function GroupSummaryText({ pieces, tail, tailIsParen }: GroupLabelParts) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const hasMain = pieces.length > 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return (
    <span className="flex min-w-0 items-baseline whitespace-nowrap">
      {hasMain && (
        <span ref={ref} className={`min-w-0 overflow-hidden ${overflowing ? FADE_END : ''}`}>
          {pieces.map((piece, index) => (
            <span key={index}>
              {index > 0 && ', '}
              {typeof piece === 'string' ? (
                piece
              ) : (
                <>
                  {piece.before}
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (piece.path) void openChatFile(piece.path);
                    }}
                    className={`${LINK_TEXT} cursor-pointer hover:underline`}
                  >
                    {piece.fileName}
                  </span>
                  {piece.after}
                </>
              )}
            </span>
          ))}
        </span>
      )}
      {tail && <span className="flex-shrink-0">{hasMain ? (tailIsParen ? ' ' : ', ') : ''}{tail}</span>}
    </span>
  );
}

/**
 * The pictures behind a line, as small thumbnails at its end, one for each. They are shown only while the line is
 * shut: once it is open the pictures themselves are under it.
 */
function Thumbnails({ pictures, onOpen }: { pictures: PictureRef[]; onOpen: (picture: PictureRef) => void }) {
  if (pictures.length === 0) return null;
  const shown = pictures.slice(0, MAX_THUMBNAILS);
  const more = pictures.length - shown.length;
  return (
    <span className="ms-auto flex flex-shrink-0 items-center gap-2">
      {/* The pictures that are not shown are counted before the ones that are, as the desktop app does. */}
      {more > 0 && <span className="whitespace-nowrap">+{more}</span>}
      <span data-transcript-thumbnails className="flex items-center gap-1.5">
        {shown.map((picture) => (
          // The line these sit in opens and shuts on a click; a click on a thumbnail opens the picture in the viewer instead and goes no further.
          <span
            key={`${picture.call.toolUse.id}:${picture.index}`}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(picture);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onOpen(picture);
            }}
            className="flex flex-shrink-0 cursor-zoom-in"
          >
            <img src={picture.src} alt="" className="h-7 w-auto max-w-[56px] rounded-[3px] border border-border-default/70 object-contain" />
          </span>
        ))}
      </span>
    </span>
  );
}

/** One picture a call's result carries: which call, its place among that result's pictures, and its source. */
interface PictureRef {
  call: ToolCall;
  index: number;
  src: string;
}

function picturesOfCalls(calls: ToolCall[]): PictureRef[] {
  return calls.flatMap((call) => imagesOfResult(call.toolUse.tool_result as LoadedMessageDto | undefined).map((src, index) => ({ call, index, src })));
}

/** The viewer for a thumbnail that was clicked. The element goes beside the line, not inside it, so a click in the viewer never reaches the line's own click. */
function useThumbnailViewer() {
  const [viewing, setViewing] = useState<PictureRef | null>(null);
  const result = viewing?.call.toolUse.tool_result as LoadedMessageDto | undefined;
  const viewer = viewing ? (
    <SessionGalleryViewer
      entryUuid={result?.uuid}
      localSrcs={imagesOfResult(result)}
      localKeys={toolResultPictureKeys(result, viewing.call.toolUse.id)}
      openedIndex={viewing.index}
      onClose={() => setViewing(null)}
    />
  ) : null;
  return [setViewing, viewer] as const;
}

/**
 * What a browser call shows once it is opened: what it printed, as plain text, and the picture it returned.
 * A click or a screenshot has no code to show, so there is no box, only its result.
 */
function PlainDetail({ call }: { call: ToolCall }) {
  const result = call.toolUse.tool_result as LoadedMessageDto | undefined;
  // The note that says where a picture was saved ("[Image: source: …]") is never shown, whether or not the picture itself came with the result.
  // The text parts are joined without a break, so the note can sit at the front of a line of text; it is cut out wherever it is.
  const text = toolKindOf(call) === 'capture' ? '' : stripImageNotes(toolResultText(result).replace(/\[Image: source: [^\]]*\]/g, '\n')).trim();
  return (
    <div className="px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[var(--tr-muted)]">
      {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
      <ResultPictures call={call} />
    </div>
  );
}

/** The pictures a call's result carries, drawn under it at their own size (no wider than the chat); a click opens the viewer. */
function ResultPictures({ call }: { call: ToolCall }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const result = call.toolUse.tool_result as LoadedMessageDto | undefined;
  const images = imagesOfResult(result);
  if (images.length === 0) return null;
  return (
    <>
      {images.map((src, index) => (
        <button key={index} type="button" onClick={() => setViewing(index)} className="mt-2 block max-w-full cursor-zoom-in">
          <img src={src} alt="" className="block max-w-full rounded-md" />
        </button>
      ))}
      {viewing !== null && (
        <SessionGalleryViewer
          entryUuid={result?.uuid}
          localSrcs={images}
          localKeys={toolResultPictureKeys(result, call.toolUse.id)}
          openedIndex={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

/** Text that is written in markdown (a message from another session, one sent to it), in the quiet grey of a detail. */
function MarkdownDetail({ text, message }: { text: string; message: LoadedMessageDto }) {
  return (
    <div className="transcript-prose px-1 pb-3">
      <StreamingMessage plain content={text} isStreaming={false} className="text-[0.9375rem] leading-[1.5] text-[var(--tr-soft)]" message={message} />
    </div>
  );
}

/** A label in the quiet grey and the value beside it. */
function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-6 py-0.5">
      <span className="w-[4.5rem] flex-shrink-0 text-[var(--tr-muted)]">{label}</span>
      <span className="min-w-0 break-words text-[var(--tr-text)]">{value}</span>
    </div>
  );
}

/** What renaming a session changed: the title it had, and the one it has now. */
function RenameDetail({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const { before, after } = renameOutcome(call);
  return (
    <div className="px-1 pb-3 text-[0.9375rem] leading-[1.5]">
      {before && <DetailPair label={t('transcript.tools.titleBefore')} value={before} />}
      <DetailPair label={t('transcript.tools.titleAfter')} value={after} />
    </div>
  );
}

/** What a call was given, one entry to a line under "Input": the key in words and its value. Nothing of what came back. */
function InputDetail({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const entries = Object.entries(call.toolUse.input ?? {});
  return (
    <div className="px-1 pb-3 text-[0.9375rem] leading-[1.5]">
      <div className="pb-1 text-[var(--tr-muted)]">{t('transcript.tools.inputHeading')}</div>
      {entries.map(([key, value]) => (
        <div key={key} className="pb-1.5">
          <div className="text-[0.8461rem] text-[var(--tr-muted)]">{key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ').replace(/\b(id)\b/g, 'ID')}</div>
          <div className="break-words text-[var(--tr-text)]">{typeof value === 'string' ? value : JSON.stringify(value)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * What a call was given, and what it printed: "Input" with its entries, a rule, and "Output" with the text that came
 * back. How the desktop app draws a skill that was started. The output is left out until there is one.
 */
function InputOutputDetail({ call, withPictures = true }: { call: ToolCall; withPictures?: boolean }) {
  const { t } = useTranslation('chat');
  const output = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined).trim();
  return (
    <>
      <InputDetail call={call} />
      {withPictures && <div className="px-1 pb-3"><ResultPictures call={call} /></div>}
      {output && (
        <div className={`mx-1 mb-3 border-t ${BOX_BORDER} pt-3 text-[0.9375rem] leading-[1.5]`}>
          <div className="pb-1 text-[var(--tr-muted)]">{t('transcript.tools.outputHeading')}</div>
          <div className="whitespace-pre-wrap break-words text-[var(--tr-muted)]">{output}</div>
        </div>
      )}
    </>
  );
}

/** A message sent to another session: how it was delivered, and the message itself as the text it is. */
function SentMessageDetail({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chatTools');
  const text = typeof call.toolUse.input?.message === 'string' ? (call.toolUse.input.message as string) : '';
  const delivery = parseSessionDelivery(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined)).delivery;
  return (
    <div className="px-1 pb-3">
      {delivery && <div className="pb-2 text-[0.9375rem] text-[var(--tr-muted)]">{delivery === 'delivered' ? t('sendMessage.delivered') : delivery}</div>}
      <MarkdownDetail text={text} message={call.message} />
    </div>
  );
}

/** `claude-sonnet-5-5` as `Sonnet 5.5`: the family and its version, without the date a model id may end in. */
function modelLabel(id: string): string {
  const parts = id.replace(/^claude-/, '').split('-').filter((part) => !/^\d{8}$/.test(part));
  const family = parts.filter((part) => !/^\d+$/.test(part));
  const version = parts.filter((part) => /^\d+$/.test(part)).join('.');
  const name = family.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  return [name, version].filter(Boolean).join(' ') || id;
}

/** What looking a session up found: its title, state, folder, model and last activity, as a table, as the desktop app draws it. */
function SessionFactsDetail({ call }: { call: ToolCall }) {
  const { t, i18n } = useTranslation('chat');
  let facts: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined));
    facts = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    facts = undefined;
  }
  if (!facts) return <ToolRenderer toolUse={call.toolUse} message={call.message} />;
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  const lastActivity = text(facts.lastActivityAt) ? Date.parse(facts.lastActivityAt as string) : NaN;
  const rows: Array<[string, string | undefined]> = [
    [t('transcript.tools.factTitle'), text(facts.title)],
    [t('transcript.tools.factStatus'), typeof facts.isRunning === 'boolean' ? t(facts.isRunning ? 'transcript.tools.factRunning' : 'transcript.tools.factIdle') : undefined],
    [t('transcript.tools.factFolder'), text(facts.cwd)],
    [t('transcript.tools.factModel'), text(facts.model) ? modelLabel(facts.model as string) : undefined],
    [t('transcript.tools.factEffort'), text(facts.effort)],
    [
      t('transcript.tools.factLastActivity'),
      Number.isNaN(lastActivity) ? undefined : new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(lastActivity),
    ],
  ];
  return (
    <div className="px-1 pb-3 text-[0.9375rem] leading-[1.5]">
      <div className="flex gap-4 px-2 py-2 text-[var(--tr-muted)]">
        <span className="w-[6rem] flex-shrink-0">{t('transcript.tools.factField')}</span>
        <span>{t('transcript.tools.factValue')}</span>
      </div>
      {rows
        .filter((row): row is [string, string] => row[1] !== undefined)
        .map(([label, value]) => (
          <div key={label} className={`flex gap-4 border-t ${BOX_BORDER} px-2 py-3`}>
            <span className="w-[6rem] flex-shrink-0 text-[var(--tr-text)]">{label}</span>
            <span className="min-w-0 break-words text-[var(--tr-text)]">{value}</span>
          </div>
        ))}
    </div>
  );
}

/**
 * The task behind an agent call whose run window can be opened: one the app tracks that has an id to look its
 * transcript up by, or the transcript's file itself. A cancelled agent's result names no agent id, so a reload
 * rebuilds it with neither, and there is nothing for a window to show (#673).
 */
function openableAgentTask(
  workflow: ReturnType<typeof useOptionalWorkflowState>,
  call: ToolCall,
): WorkflowTask | undefined {
  const task = workflow?.getByToolUseId(call.toolUse.id);
  return task && (task.taskId || task.outputFile) ? task : undefined;
}

/**
 * The way into a subagent's own run window, as a line over the call's detail: what the agent is doing, and a click
 * opens the window where everything it did inside, the commands it ran included, can be read (#673). Drawn only
 * when the call is a task the app is tracking and the window can be opened here; otherwise nothing.
 */
export function AgentRunLink({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const workflow = useOptionalWorkflowState();
  const task = openableAgentTask(workflow, call);
  if (!workflow || !task) return null;
  const given = call.toolUse.input?.description;
  const text = (typeof given === 'string' && given.trim()) || task.description || task.name;
  const running = task.status === 'running';
  return (
    <button
      type="button"
      data-testid="agent-run-link"
      onClick={() => workflow.openTranscript(task.toolUseId)}
      className={`group mb-2 flex w-full items-baseline gap-2 rounded-lg border ${BOX_BORDER} px-3 py-2 text-start text-[0.9375rem] ${SUMMARY_TEXT}`}
    >
      {/* While the agent works the words carry the same moving light as the working line. */}
      <span className={`flex-shrink-0${running ? ' transcript-shimmer' : ''}`}>{running ? t('transcript.streaming.activity.agent') : t('transcript.tools.ranAgent')}</span>
      <span className={`min-w-0 truncate ${LINK_TEXT} group-hover:underline`}>{text}</span>
    </button>
  );
}

/**
 * What an agent call shows once opened: the card that leads to its run window and nothing else, since the window is
 * where its prompt, what it did and what it returned are read. A call the app is not tracking (a reloaded chat's
 * foreground agent) has no window to lead to, so it keeps the plain input and output instead of showing an empty row.
 */
function AgentDetail({ call, withPictures }: { call: ToolCall; withPictures: boolean }) {
  const workflow = useOptionalWorkflowState();
  // Where the app tracks tasks, the card is all an agent call shows, and a call with no window to lead to is not
  // opened at all (see TranscriptToolRow). Without that, the plain input and output.
  if (workflow) return <AgentRunLink call={call} />;
  return <InputOutputDetail call={call} withPictures={withPictures} />;
}

/** What a row shows once it is opened. */
function ToolDetail({ calls, withPictures = true }: { calls: ToolCall[]; withPictures?: boolean }) {
  const call = calls[0];
  const kind = toolKindOf(call);
  // The CLI answers a command that printed nothing with a sentence saying so; the desktop app shows its own line for it.
  const printed = wasStopped(call) ? '' : toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  const output = /^\(Bash completed with no output\)$/.test(printed.trim()) ? '' : printed;
  if (kind === 'command') {
    const command = typeof call.toolUse.input?.command === 'string' ? (call.toolUse.input.command as string) : '';
    return (
      <>
        <CodeBox title={call.toolUse.name} code={command} language="bash" output={output} />
        <NoOutput call={call} output={output} />
      </>
    );
  }
  if (kind === 'pageScript') {
    const script = typeof call.toolUse.input?.text === 'string' ? (call.toolUse.input.text as string) : '';
    return (
      <>
        <CodeBox title="JavaScript" code={script} language="javascript" output={withoutTabContext(output)} />
        <NoOutput call={call} output={withoutTabContext(output)} />
      </>
    );
  }
  if (kind === 'receivedMessage') {
    const body = typeof call.toolUse.input?.body === 'string' ? (call.toolUse.input.body as string) : '';
    const request = typeof call.toolUse.input?.request === 'string' ? (call.toolUse.input.request as string) : undefined;
    if (request === undefined) return <MarkdownDetail text={body} message={call.message} />;
    // The app's request for a report rides with the message it asks about: a shut line under the message, as in the desktop app.
    const requestCall: ToolCall = {
      toolUse: { type: 'tool_use', id: `${call.toolUse.id}-request`, name: APP_EVENT_TOOL, input: { body: request } } as unknown as ToolCall['toolUse'],
      message: call.message,
    };
    return (
      <>
        <MarkdownDetail text={body} message={call.message} />
        <NestedRequestRow call={requestCall} />
      </>
    );
  }
  if (kind === 'appRequest') {
    const body = typeof call.toolUse.input?.body === 'string' ? (call.toolUse.input.body as string) : '';
    return <MarkdownDetail text={body} message={call.message} />;
  }
  if (kind === 'sessionStart' && hasFailed(call)) {
    // A start the app refused shows what it said, in the quiet grey (the classic card paints it red), and not what was asked for.
    return <div className="whitespace-pre-wrap break-words px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[var(--tr-muted)]">{output}</div>;
  }
  if ((kind === 'sessionArchive' || kind === 'sessionDelete') && typeof call.toolUse.input?.reason === 'string' && call.toolUse.input.reason) {
    // What archiving or deleting a session shows is the reason it was archived for, in the quiet grey, and nothing of what the call returned.
    return <div className="whitespace-pre-wrap break-words px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[var(--tr-muted)]">{call.toolUse.input.reason as string}</div>;
  }
  if (kind === 'sessionLookup') return <SessionFactsDetail call={call} />;
  if (kind === 'sessionRename') return <RenameDetail call={call} />;
  if (kind === 'toolLoad') return <InputDetail call={call} />;
  if (kind === 'skill' || kind === 'sessionRead') return <InputOutputDetail call={call} />;
  if (kind === 'messageSent') return <SentMessageDetail call={call} />;
  if (call.toolUse.name === 'Edit' || call.toolUse.name === 'Write') return <FileChangeDetail calls={calls} />;
  if (browserToolOf(call.toolUse.name) !== '') return <PlainDetail call={call} />;
  if (kind === 'agent') return <AgentDetail call={call} withPictures={withPictures} />;
  // Every other call, as the desktop app draws the ones it has no design of their own for: what the call was given,
  // and what it printed.
  return <InputOutputDetail call={call} withPictures={withPictures} />;
}

/**
 * What a row's call was about, after its text. A message sent to another session names that session by its title:
 * when the answer to the call did not, Desktop's own session file does, as the classic chat looks it up.
 */
function RowMeta({ call, meta }: { call: ToolCall; meta?: string }) {
  const isSent = toolKindOf(call) === 'messageSent';
  const to = typeof call.toolUse.input?.to === 'string' ? (call.toolUse.input.to as string) : '';
  const answered = isSent ? sentTo(call) : '';
  const looked = useDesktopSession(isSent ? to : '', isSent && answered === '')?.title;
  const shown = isSent ? answered || looked || meta : meta;
  if (!shown) return null;
  // The session a message came from is a way into that session, named by the title it has now.
  const fromInput = call.toolUse.input?.from;
  const from = toolKindOf(call) === 'receivedMessage' && typeof fromInput === 'string' ? fromInput : '';
  // The session-management MCP names the sender by its CLI session: a way in when this conversation started it.
  if (isCliSessionId(from)) {
    return (
      <span className={`ms-2 ${LINK_TEXT}`}>
        <StartedSessionLink id={from} plain>{shown}</StartedSessionLink>
      </span>
    );
  }
  if (from.startsWith('local_')) {
    return (
      <span className={`ms-2 ${LINK_TEXT}`}>
        <DesktopSessionLink id={from} plain>{shown}</DesktopSessionLink>
      </span>
    );
  }
  return <span className={`ms-2 ${LINK_TEXT}`}>{shown}</span>;
}

/** A session Claude started: a card with its title, which goes to that session, as the desktop app draws it. */
function StartedSessionCard({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const title = typeof call.toolUse.input?.title === 'string' ? (call.toolUse.input.title as string) : '';
  // The answer names the session it started; Desktop's own file for it says whether it is waiting for the person.
  const answer = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  const startedId = /session_id:\s*(local_[\w-]+)/.exec(answer)?.[1] ?? '';
  const session = useDesktopSession(startedId, startedId !== '');
  // The session-management MCP answers with the CLI session itself and the folder it runs in, so there is
  // nothing to look up. A session started without a folder of its own runs in this conversation's folder.
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  const own = startedId === '' ? startedSessionOf(answer, call.toolUse.input as Record<string, unknown> | undefined) : undefined;
  const awaiting = session?.awaitingPerson === true;
  const sessionId = session?.cliSessionId ?? own?.sessionId;
  const cwd = session?.cwd ?? own?.cwd ?? (own ? workingDirectory : undefined);
  // The card is a way into the session it names: in a browser a link that opens it in a new tab, in the IDE the adapter opens it.
  const { href, onClick: goTo } = sessionLinkProps(sessionId ? { sessionId, cwd } : undefined);
  return (
    <div className="px-4 py-[11px]" data-transcript-started-session>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={goTo}
        className={`flex w-full items-center gap-2 rounded-lg border ${BOX_BORDER} px-3.5 py-[13px] text-start text-[0.9375rem] text-[var(--tr-text)] hover:bg-[var(--tr-chip)] ${href ? 'cursor-pointer' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {awaiting && <span className="flex-shrink-0 text-[0.8461rem] text-[#d99a2b]">{t('transcript.tools.needsInput')}</span>}
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-[var(--tr-muted)] rtl:-scale-x-100" />
      </a>
    </div>
  );
}

/** The request for a report under the message it asks about: shut, except in Verbose, which opens every call. */
function NestedRequestRow({ call }: { call: ToolCall }) {
  const verbose = useTranscriptViewMode() === 'verbose';
  return <TranscriptToolRow calls={[call]} defaultOpen={verbose} inBox={false} />;
}

/**
 * The working indicator of an agent call whose task is running, for a chat that does not know its turn is running:
 * one that was reloaded in the middle of it. The turn's own state is not restored on a reload, so the line over the
 * call would sit still and look stopped, until the agent's answer arrived and "Thinking" started again. The task is
 * running whether or not this screen watched it start, so the line says so the same way it did before the reload:
 * the moving dots, the agent's name in the moving light, and the time it has been going (#673).
 */
export function useRunningAgentLive(calls: ToolCall[]): { label: string; elapsed: string; mark: WorkingActivity } | undefined {
  const { t } = useTranslation('chat');
  const workflow = useOptionalWorkflowState();
  const formatElapsed = useFormatElapsed();
  const running = calls
    .map((call) => ({ call, task: toolKindOf(call) === 'agent' ? workflow?.getByToolUseId(call.toolUse.id) : undefined }))
    .find((entry) => entry.task?.status === 'running' && entry.task.startedAt > 0);
  const now = useNow(!!running);
  if (!running || !running.task) return undefined;
  return {
    label: rowLabel(running.call, t).before || t('transcript.streaming.activity.agent'),
    elapsed: formatElapsed(Math.max(0, Math.floor((now - running.task.startedAt) / 1000))),
    mark: 'default',
  };
}

/** One call: a line that opens to its details. */
function TranscriptToolRow({ calls, defaultOpen, inBox, live: turnLive }: { calls: ToolCall[]; defaultOpen: boolean; inBox: boolean; live?: { label: string; elapsed: string; mark: WorkingActivity } }) {
  const { t } = useTranslation('chat');
  const call = calls[0];
  const runningAgentLive = useRunningAgentLive(calls);
  const live = turnLive ?? runningAgentLive;
  const [open, setOpen] = useState(defaultOpen);
  // A row already drawn follows the view it is drawn in: Verbose opens it, another view shuts it again.
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const running = !call.toolUse.tool_result && (call.message.isStreaming ?? false);
  const label = rowLabel(call, t);
  const path = pathOf(call);
  const workflowState = useOptionalWorkflowState();
  // An agent call opens to the card that leads to its run window. Where there is no window to lead to, there is
  // nothing to open, so the line does not fold open onto an empty space (#673).
  const agentWithoutWindow = !!workflowState && toolKindOf(call) === 'agent' && !openableAgentTask(workflowState, call);
  const expandable = isExpandable(call) && !agentWithoutWindow;
  const pictures = picturesOfCalls([call]);
  const [openPicture, thumbnailViewer] = useThumbnailViewer();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => expandable && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 ${inBox ? 'px-3' : ''} py-[10px] text-start text-[0.9656rem] transition-colors ${SUMMARY_TEXT} ${running ? 'animate-pulse' : ''}`}
      >
        {live ? (
          <>
            <ActivityGlyph activity={live.mark} />
            <span className="min-w-0 truncate transcript-shimmer">{live.label}</span>
            <span className="flex-shrink-0">{live.elapsed}</span>
          </>
        ) : (
        <span className={label.fileName ? 'flex min-w-0 items-baseline whitespace-nowrap' : 'min-w-0 truncate'}>
          <span className={label.fileName ? 'me-2 flex-shrink-0' : undefined}>{label.before}</span>
          {label.fileName && (
            <span
              role="link"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (path) void openChatFile(path);
              }}
              className={`${LINK_TEXT} min-w-0 cursor-pointer truncate hover:underline`}
            >
              {label.fileName}
            </span>
          )}
          {label.after}
          <RowMeta call={call} meta={label.meta} />
        </span>
        )}
        {hasFailed(call) && toolKindOf(call) !== 'sessionStart' && <span className="flex-shrink-0 text-red-400">{t('transcript.tools.failedMark')}</span>}
        {wasStopped(call) && <span className="flex-shrink-0">{t('transcript.tools.stoppedMark')}</span>}
        <LineStatsView stats={sumLineStats(calls)} />
        {expandable && <Chevron open={open} />}
        {(!open && inBox) && <Thumbnails pictures={pictures} onOpen={openPicture} />}
      </button>
      {thumbnailViewer}
      {/* A call of its own that read a picture shows the picture under its line at its own size, as the desktop app does; in a run, the lines carry thumbnails and the picture is under the call once it is opened. */}
      {!inBox && pictures.length > 0 && <div className="pb-2"><ResultPictures call={call} /></div>}
      {open && expandable && <div className={inBox ? 'px-2' : ''}><ToolDetail calls={calls} withPictures={inBox} /></div>}
    </div>
  );
}

/**
 * A run of calls, the way the desktop app's Transcript view draws it.
 *
 * One call is its own line. Several are one line over all of them ("Ran 3
 * commands ›") that opens to a line for each, and each of those opens to what the
 * call did. Verbose opens all of it from the start; Normal and Thinking leave it
 * shut, since the answer is what the reader came for and the work is a click away.
 */
export function TranscriptToolRun({ calls }: { calls: ToolCall[] }) {
  const { t } = useTranslation('chat');
  const verbose = useTranscriptViewMode() === 'verbose';
  // The live run: the turn is running and the call it is waiting on is in this run. Its line then says what the
  // model is doing and for how long, as the working indicator, and its list stays shut unless the reader opens it.
  const { isStreaming, messages } = useChatStreamContext();
  const live = useMemo(() => (isStreaming ? runningActivity(messages) : null), [isStreaming, messages]);
  const active = live !== null && calls.some((call) => call.toolUse.id === live.toolUseId);
  // Shut unless the view is Verbose or the reader opened it: a run that is still going on is not opened for them,
  // and the line over it (the dots, what is running, the seconds) is what tells them it is working.
  // A run of file edits and new files is open from the start, while it goes on and after it ends: the desktop app
  // keeps the line for each file under the summary (measured on its recording of an edit to two files at once).
  const fileChanges = calls.every((call) => call.toolUse.name === 'Edit' || call.toolUse.name === 'Write');
  const startsOpen = verbose || fileChanges;
  const [open, setOpen] = useState(startsOpen);
  useEffect(() => setOpen(startsOpen), [startsOpen]);
  const toggle = () => setOpen((v) => !v);
  const label = useActivityLabel();
  const formatElapsed = useFormatElapsed();
  const seconds = useTurnSeconds();
  const runningAgentLive = useRunningAgentLive(calls);
  const pictures = picturesOfCalls(calls);
  const [openPicture, thumbnailViewer] = useThumbnailViewer();

  if (calls.length === 1 && toolKindOf(calls[0]) === 'sessionStart' && !hasFailed(calls[0])) {
    return <StartedSessionCard call={calls[0]} />;
  }

  if (calls.length === 1 && toolKindOf(calls[0]) === 'capture') {
    // A capture on its own is shown open, as the desktop app shows it: its line has nothing to fold and no thumbnail,
    // since the picture itself is right under it.
    return (
      <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run-single>
        <div className="py-[10px] text-[0.9375rem] text-[var(--tr-muted)]">{rowLabel(calls[0], t).before}</div>
        <PlainDetail call={calls[0]} />
      </div>
    );
  }

  if (calls.length === 1) {
    return (
      <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run-single>
        <TranscriptToolRow
          calls={[calls[0]]}
          defaultOpen={verbose}
          inBox={false}
          live={active && live ? { label: label(live), elapsed: formatElapsed(seconds), mark: live.mark } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={`flex w-full items-center gap-1 py-2 text-start text-[0.9656rem] transition-colors ${SUMMARY_TEXT}`}
      >
        {active && live ? (
          <>
            <span className="me-2 flex"><ActivityGlyph activity={live.mark} /></span>
            <span className="min-w-0 truncate transcript-shimmer">{label(live)}</span>
            <span className="ms-2 me-1 flex-shrink-0">{formatElapsed(seconds)}</span>
          </>
        ) : runningAgentLive ? (
          <>
            <span className="me-2 flex"><ActivityGlyph activity={runningAgentLive.mark} /></span>
            <span className="min-w-0 truncate transcript-shimmer">{runningAgentLive.label}</span>
            <span className="ms-2 me-1 flex-shrink-0">{runningAgentLive.elapsed}</span>
          </>
        ) : (
          <>
            <GroupSummaryText {...groupLabelParts(calls, t)} />
            <LineStatsView stats={sumLineStats(calls)} />
          </>
        )}
        <Chevron open={open} />
        {!open && <Thumbnails pictures={pictures} onOpen={openPicture} />}
      </button>
      {thumbnailViewer}
      {open && (
        <div className={`mt-3 rounded-lg border ${BOX_BORDER} divide-y divide-border-default/70 overflow-hidden`}>
          {groupIntoRows(calls).map((row) => (
            <TranscriptToolRow key={row[0].toolUse.id} calls={row} defaultOpen={verbose} inBox />
          ))}
        </div>
      )}
    </div>
  );
}
