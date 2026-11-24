import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
import { useNow } from '@/hooks/useNow';
import { useOptionalWorkflowState } from '@/contexts/WorkflowStateContext';
import { agentAddressOf } from '@/hooks/useSendToAgent';
import { ActivityGlyph, useActivityLabel, useFormatElapsed, useTurnSeconds } from './TranscriptActivity';
import { LiveActivityContext } from './LiveActivityContext';
import { MorphText } from './MorphText';
import { useSettledText } from './useSettledText';
import type { WorkingActivity } from './WorkingMark';
import { FileChangeDetail } from './FileChangeDetail';
import { useNavigate } from 'react-router-dom';
import { isJetBrains } from '@/config/environment';
import { SessionActivity } from '@/shared';
import { useBacklinkedSession, useBacklinkedSessionTitles } from '@/contexts/BacklinkedSessionsContext';
import { useSessionActivityLine } from '@/hooks/useSessionActivityLine';
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
  isAgentMessage,
  isExpandable,
  pathOf,
  renameOutcome,
  sentTo,
  rowLabel,
  sumLineStats,
  toolKindOf,
  type LineStats,
  withoutMessagingToolLoad,
  sessionTargetOf,
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
    <span className="flex-shrink-0 font-mono text-[0.7616rem]">
      {stats.added > 0 && <span className="text-green-500">+{stats.added}</span>}
      {stats.removed > 0 && <span className="ms-[0.45rem] text-red-500">−{stats.removed}</span>}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRightIcon
      className={`-ms-[0.3376rem] w-[0.9rem] h-[0.9rem] flex-shrink-0 transition-transform rtl:-scale-x-100 ${open ? 'rotate-90 rtl:-rotate-90' : ''}`}
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
  return <div className="px-[0.225rem] pb-[0.675rem] text-[0.8438rem] text-[var(--tr-muted)]">{text}</div>;
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
      className="absolute end-[0.45rem] top-[0.45rem] rounded-[0.225rem] p-[0.225rem] text-[var(--tr-muted)] hover:text-[var(--tr-text)] hover:bg-surface-hover"
      aria-label={t('sendActions.copyMessage')}
    >
      <ClipboardDocumentIcon className="w-[0.9rem] h-[0.9rem]" />
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
    <div className="px-[0.675rem] pb-[0.675rem] font-mono text-[0.7616rem] leading-[1.5]">
      {exit && <div className="text-red-400">{t('transcript.tools.exitCode', { code: exit[1] })}</div>}
      {rest && (
        <pre className="mt-[0.45rem] whitespace-pre-wrap break-words text-[var(--tr-muted)] max-h-[21.6rem] overflow-y-auto">{rest}</pre>
      )}
    </div>
  );
}

/** A box titled with the tool's name, around code and what it printed. */
function CodeBox({ title, code, language, output }: { title: string; code: string; language: string; output: string }) {
  return (
    <div className={`relative mb-[0.45rem] rounded-[0.45rem] border ${BOX_BORDER} overflow-hidden`} data-transcript-code-box>
      <div className="px-[0.675rem] pt-[0.45rem] pb-[0.225rem] text-[0.7616rem] text-[var(--tr-muted)]">{title}</div>
      <CopyButton text={code} />
      <pre className="mx-[0.45rem] mb-[0.45rem] max-h-[14.4rem] overflow-y-auto whitespace-pre-wrap break-words rounded-[0.3376rem] bg-surface-hover px-[0.675rem] py-[0.45rem] font-mono text-[0.7616rem] leading-[1.5] text-[var(--tr-text)]">
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
              ) : 'sessions' in piece ? (
                // The names of the sessions stand apart from the words, each a way into its session as in a row.
                <>
                  {piece.before}{' '}
                  {piece.sessions.map((session, at) => (
                    <span key={session.id || session.title}>
                      {at > 0 && ', '}
                      <SessionNameLink id={session.id} title={session.title} />
                    </span>
                  ))}
                </>
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
    <span className="ms-auto flex flex-shrink-0 items-center gap-[0.45rem]">
      {/* The pictures that are not shown are counted before the ones that are, as the desktop app does. */}
      {more > 0 && <span className="whitespace-nowrap">+{more}</span>}
      <span data-transcript-thumbnails className="flex items-center gap-[0.3376rem]">
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
            <img src={picture.src} alt="" className="h-[1.575rem] w-auto max-w-[3.15rem] rounded-[0.1688rem] border border-border-default/70 object-contain" />
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
    <div className="px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)] text-[var(--tr-muted)]">
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
        <button key={index} type="button" onClick={() => setViewing(index)} className="mt-[0.45rem] block max-w-full cursor-zoom-in">
          <img src={src} alt="" className="block h-auto max-w-md rounded-[0.3376rem]" />
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
function MarkdownDetail({ text, message, bare = false }: { text: string; message: LoadedMessageDto; bare?: boolean }) {
  // `bare` is for text that sits in a box which has its own padding: no sides or room below of its own.
  return (
    <div className={bare ? 'transcript-prose' : 'transcript-prose pb-3'}>
      <StreamingMessage plain content={text} isStreaming={false} className="text-sm leading-[var(--chat-line-height,1.6)]" message={message} />
    </div>
  );
}

/** A label in the quiet grey and the value beside it. */
function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-[1.35rem] py-[0.1126rem]">
      <span className="w-[4.05rem] flex-shrink-0 text-[var(--tr-muted)]">{label}</span>
      <span className="min-w-0 break-words text-[var(--tr-text)]">{value}</span>
    </div>
  );
}

/** What renaming a session changed: the title it had, and the one it has now. */
function RenameDetail({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const { before, after } = renameOutcome(call);
  return (
    <div className="px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)]">
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
    <div className="px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)]">
      <div className="pb-[0.225rem] text-[var(--tr-muted)]">{t('transcript.tools.inputHeading')}</div>
      {entries.map(([key, value]) => (
        <div key={key} className="pb-[0.3376rem]">
          <div className="text-[0.7616rem] text-[var(--tr-muted)]">{key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ').replace(/\b(id)\b/g, 'ID')}</div>
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
      {withPictures && <div className="px-[0.225rem] pb-[0.675rem]"><ResultPictures call={call} /></div>}
      {output && (
        <div className={`mx-[0.225rem] mb-[0.675rem] border-t ${BOX_BORDER} pt-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)]`}>
          <div className="pb-[0.225rem] text-[var(--tr-muted)]">{t('transcript.tools.outputHeading')}</div>
          <div className="whitespace-pre-wrap break-words text-[var(--tr-muted)]">{output}</div>
        </div>
      )}
    </>
  );
}

/** A message sent to another session: how it was delivered, and the message itself as the text it is. */
function SentMessageDetail({ call }: { call: ToolCall }) {
  const text = typeof call.toolUse.input?.message === 'string' ? (call.toolUse.input.message as string) : '';
  const delivery = parseSessionDelivery(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined)).delivery;
  const toAgent = isAgentMessage(call);
  // A message to a session that was delivered is drawn as a received one is: the text and nothing around it.
  if (!toAgent && (!delivery || delivery === 'delivered')) return <MarkdownDetail text={text} message={call.message} />;
  return (
    // A box goes to the row's own sides; the plain text of a message to a session keeps the small inset.
    <div className={toAgent ? 'pb-[0.675rem]' : 'px-[0.225rem] pb-[0.675rem]'}>
      {/* A delivered message is the normal case and says nothing; only a delivery that went another way is told. */}
      {delivery && delivery !== 'delivered' && <div className="pb-[0.45rem] text-[0.8438rem] text-[var(--tr-muted)]">{delivery}</div>}
      {/* What was said to an agent sits in a box of its own, as the desktop app draws it. */}
      {toAgent ? (
        <div className={`rounded-[0.675rem] border ${BOX_BORDER} px-4 py-[0.675rem]`} data-testid="agent-message-box">
          <MarkdownDetail text={text} message={call.message} bare />
        </div>
      ) : (
        <MarkdownDetail text={text} message={call.message} />
      )}
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
    <div className="px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)]">
      <div className="flex gap-[0.9rem] px-[0.45rem] py-[0.45rem] text-[var(--tr-muted)]">
        <span className="w-[5.4rem] flex-shrink-0">{t('transcript.tools.factField')}</span>
        <span>{t('transcript.tools.factValue')}</span>
      </div>
      {rows
        .filter((row): row is [string, string] => row[1] !== undefined)
        .map(([label, value]) => (
          <div key={label} className={`flex gap-[0.9rem] border-t ${BOX_BORDER} px-[0.45rem] py-[0.675rem]`}>
            <span className="w-[5.4rem] flex-shrink-0 text-[var(--tr-text)]">{label}</span>
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
      onClick={() => workflow.openRun(task.toolUseId)}
      className={`group mb-[0.45rem] flex w-full items-baseline gap-[0.45rem] rounded-[0.45rem] border ${BOX_BORDER} px-[0.675rem] py-[0.45rem] text-start text-[0.8438rem] ${SUMMARY_TEXT}`}
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
    return <div className="whitespace-pre-wrap break-words px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)] text-[var(--tr-muted)]">{output}</div>;
  }
  if ((kind === 'sessionArchive' || kind === 'sessionDelete') && typeof call.toolUse.input?.reason === 'string' && call.toolUse.input.reason) {
    // What archiving or deleting a session shows is the reason it was archived for, in the quiet grey, and nothing of what the call returned.
    return <div className="whitespace-pre-wrap break-words px-[0.225rem] pb-[0.675rem] text-[0.8438rem] leading-[var(--chat-line-height,1.6)] text-[var(--tr-muted)]">{call.toolUse.input.reason as string}</div>;
  }
  if (kind === 'sessionLookup') return <SessionFactsDetail call={call} />;
  if (kind === 'sessionRename') return <RenameDetail call={call} />;
  if (kind === 'toolLoad') return <InputDetail call={call} />;
  if (kind === 'skill' || kind === 'sessionRead') return <InputOutputDetail call={call} />;
  if (kind === 'messageSent' || kind === 'sessionMessage') return <SentMessageDetail call={call} />;
  if (call.toolUse.name === 'Edit' || call.toolUse.name === 'Write') return <FileChangeDetail calls={calls} inBox={withPictures} />;
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
  const kind = toolKindOf(call);
  const isSent = kind === 'messageSent';
  const to = typeof call.toolUse.input?.to === 'string' ? (call.toolUse.input.to as string) : '';
  const answered = isSent ? sentTo(call) : '';
  // Every call that deals with another session names that session: a message sent to it, one received from it, and the
  // calls of the session-management tools that name it by `session_id`.
  const target = sessionTargetOf(call);
  // The name the session has now comes first: a message sent to a session that was renamed since says the new name.
  const looked = useBacklinkedSession(target)?.title;
  const shown = isSent ? looked || answered || meta : looked || meta;
  // The agent a message went to is a way into that agent's run, as the agent's own line is, where the chat tracks it.
  const workflow = useOptionalWorkflowState();
  const agentTask = isSent && shown && isAgentMessage(call) ? workflow?.tasks.find((task) => agentAddressOf(task) === to) : undefined;
  if (!shown) return null;
  if (agentTask && workflow) {
    return (
      <button
        type="button"
        data-testid="agent-message-target"
        className={`ms-[0.45rem] ${LINK_TEXT} hover:underline`}
        // The row toggles open on a click; going to the agent is not that.
        onClick={(event) => {
          event.stopPropagation();
          workflow.openRun(agentTask.toolUseId);
        }}
      >
        {shown}
      </button>
    );
  }
  // The session a message came from, or went to, or a call dealt with, is a way into that session, named by the title it has now.
  const from = target;
  // The session-management MCP names the sender by its CLI session: a way in when this conversation started it.
  if (isCliSessionId(from)) {
    return (
      <span className={`ms-[0.45rem] ${LINK_TEXT}`}>
        <StartedSessionLink id={from} plain>{shown}</StartedSessionLink>
      </span>
    );
  }
  if (from.startsWith('local_')) {
    return (
      <span className={`ms-[0.45rem] ${LINK_TEXT}`}>
        <DesktopSessionLink id={from} plain>{shown}</DesktopSessionLink>
      </span>
    );
  }
  return <span className={`ms-[0.45rem] ${LINK_TEXT}`}>{shown}</span>;
}

/** The name of a session in the line over a group: a link to it when it is known by an id, as in the rows under the line. */
function SessionNameLink({ id, title }: { id: string; title: string }) {
  if (isCliSessionId(id)) return <span className={LINK_TEXT}><StartedSessionLink id={id} plain>{title}</StartedSessionLink></span>;
  if (id.startsWith('local_')) return <span className={LINK_TEXT}><DesktopSessionLink id={id} plain>{title}</DesktopSessionLink></span>;
  return <span className={LINK_TEXT}>{title}</span>;
}

/** A session Claude started: a card with its title, which goes to that session, as the desktop app draws it. */
export function StartedSessionCard({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const { t: tChat } = useTranslation('chatTools');
  const startedTitle = typeof call.toolUse.input?.title === 'string' ? (call.toolUse.input.title as string) : '';
  // The answer names the session it started. What the chat knows of that session (its name now, where it works,
  // what it is doing, whether it waits for the person or is archived) is one record, shared with every other place
  // that names it, so a rename or a change of state shows here at the moment it shows anywhere.
  const answer = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  const startedId = /session_id:\s*(local_[\w-]+)/.exec(answer)?.[1] ?? '';
  // The session-management MCP answers with the CLI session itself and the folder it runs in, so there is
  // nothing to look up. A session started without a folder of its own runs in this conversation's folder.
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  const own = startedId === '' ? startedSessionOf(answer, call.toolUse.input as Record<string, unknown> | undefined) : undefined;
  const session = useBacklinkedSession(startedId || own?.sessionId || '');
  const title = session?.title || startedTitle;
  const sessionId = session?.cliSessionId ?? own?.sessionId;
  const cwd = session?.cwd ?? own?.cwd ?? (own ? workingDirectory : undefined);
  const doing = session?.activity ?? SessionActivity.Idle;

  // The call has been made but the answer that names the session has not come: nothing to open yet.
  const starting = !call.toolUse.tool_result;
  const notStarted = hasFailed(call) || wasStopped(call);
  const settled = !starting && !notStarted;
  // The session was deleted: its transcript is gone. There is nowhere to go, and the card says so.
  const deleted = settled && session?.missing === true;
  const working = settled && !deleted && doing === SessionActivity.Running;
  const archived = settled && !deleted && session?.isArchived === true;
  const awaiting = settled && !deleted && !working && (session?.awaitingPerson === true || doing === SessionActivity.Awaiting);
  // It answered and the person has not looked at it since (kept by the backend, so it holds across a refresh and
  // another tab, and ends everywhere when the session is opened in any of them): a dot that stays, in the colour
  // of the label for a session waiting for the person, in the place of the dot of a session at work.
  const unread = settled && !deleted && !working && doing === SessionActivity.Done;
  // What the session is doing now, under its title, while it works and not after (the desktop app's card does the
  // same). Read from its record without opening it; nothing for a session that is not there or never started.
  const activityLine = useSessionActivityLine(working ? sessionId : undefined, cwd, doing);
  // While it works the second line is always there, so the card does not grow and shrink between two calls or before
  // the first one: when its record has no call to say yet, the line says only that work goes on ("Working..."). The
  // desktop app was not measured for this stretch; this is the product's own choice.
  const secondLine = working ? (activityLine ?? '') : undefined;

  // The card is a way into the session it names: a plain click goes there in this page, as it does in the desktop app;
  // a click made to open elsewhere (modifier key, middle button) keeps the browser's own way, and the IDE opens an editor tab.
  const { href, onClick: goTo } = sessionLinkProps(sessionId && !notStarted && !deleted ? { sessionId, cwd } : undefined);
  const navigate = useNavigate();
  const onClick = (event: MouseEvent) => {
    if (deleted) {
      // Nothing to open: the person is told so, and stays where they are.
      event.preventDefault();
      event.stopPropagation();
      toast.error(t('transcript.tools.sessionDeleted'));
      return;
    }
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (href && sessionId && plain) {
      event.preventDefault();
      event.stopPropagation();
      navigate(`/sessions/${sessionId}${cwd ? `?workingDir=${encodeURIComponent(cwd)}` : ''}`, { replace: isJetBrains() });
      return;
    }
    goTo(event);
  };

  const chip = notStarted
    ? { text: t('transcript.tools.sessionNotStarted'), className: 'text-state-error-fg' }
    : deleted
      ? { text: t('transcript.tools.sessionDeleted'), className: 'text-state-error-fg' }
      : awaiting
        ? { text: t('transcript.tools.needsInput'), className: 'text-[#d99a2b]' }
        : archived
          ? { text: tChat('sessionLink.archived'), className: 'text-[var(--tr-muted)]' }
          : undefined;
  const busy = starting || working;
  const state = notStarted ? 'not-started' : starting ? 'starting' : deleted ? 'deleted' : working ? 'working' : awaiting ? 'needs-input' : archived ? 'archived' : unread ? 'unread' : 'idle';
  return (
    <div data-transcript-started-session data-state={state}>
      <a
        href={href}
        rel="noreferrer"
        onClick={onClick}
        aria-disabled={href ? undefined : true}
        className={`flex w-fit min-w-[min(100%,27.5rem)] max-w-[max(75%,min(100%,27.5rem))] items-center gap-[0.45rem] rounded-[0.45rem] border ${BOX_BORDER} min-h-[2.1876rem] ps-[0.625rem] pe-[0.7874rem] py-[0.3813rem] text-start text-[0.8438rem] text-[var(--tr-text)] ${href || deleted ? 'cursor-pointer' : 'cursor-default'}${href ? ' hover:bg-[var(--tr-chip)]' : ''}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          {/* With a second line the two lines stand 1.3194rem apart and the card is 3.6111rem tall (measured on the desktop app's card). */}
          <span className={`min-w-0 truncate${secondLine !== undefined ? ' leading-[1.1876rem]' : ''}${busy ? ' transcript-shimmer transcript-card-shimmer' : ''}`}>{title || t('transcript.tools.startingSession')}</span>
          {/* `w-0 min-w-full`: the line fills the card but does not make it wider, so a long command is cut at the
              card's edge and the card keeps the width of one without a second line (as the desktop app's does). */}
          {secondLine !== undefined && (
            <span data-started-session-activity className="block w-0 min-w-full text-[0.7794rem] leading-[1.1876rem] text-[var(--tr-muted)]">
              {/* The line is replaced by the next one the way the summary line of a chat is: crossed, and growing or shrinking. */}
              <MorphText id={secondLine || 'working'}>
                {secondLine || (
                  <span data-started-session-working>
                    {t('transcript.streaming.activity.working')}
                    {/* One, two, three dots, one again. All three take their room from the start, so the line keeps its width. */}
                    <span aria-hidden="true">.</span>
                    <span aria-hidden="true" className="working-dots-2">.</span>
                    <span aria-hidden="true" className="working-dots-3">.</span>
                  </span>
                )}
              </MorphText>
            </span>
          )}
        </span>
        {chip && <span className={`me-[0.3966rem] flex-shrink-0 text-[0.7616rem] ${chip.className}`}>{chip.text}</span>}
        {busy && <span aria-hidden="true" className="transcript-card-dot me-[0.5382rem] h-[0.375rem] w-[0.375rem] flex-shrink-0 rounded-full bg-[var(--tr-muted)]" data-started-session-dot />}
        {!busy && !chip && unread && <span aria-hidden="true" className="me-[0.5382rem] h-[0.375rem] w-[0.375rem] flex-shrink-0 rounded-full bg-[#d99a2b]" data-started-session-unread />}
        <ChevronRightIcon className="h-[0.9rem] w-[0.9rem] flex-shrink-0 text-[var(--tr-muted)] rtl:-scale-x-100" />
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
function agentNameOf(call: ToolCall): string {
  const input = call.toolUse.input ?? {};
  const named = typeof input.description === 'string' && input.description.trim() ? input.description : input.subagent_type;
  return typeof named === 'string' ? named : '';
}

export function useRunningAgentLive(calls: ToolCall[]): { label: string; elapsed: string; mark: WorkingActivity } | undefined {
  const { t } = useTranslation('chat');
  const workflow = useOptionalWorkflowState();
  const formatElapsed = useFormatElapsed();
  // A backgrounded workflow works beside the chat the way an agent does, and its call says so the same way.
  const tracked = (call: ToolCall) => toolKindOf(call) === 'agent' || call.toolUse.name === 'Workflow';
  const running = calls
    .map((call) => ({ call, task: tracked(call) ? workflow?.getByToolUseId(call.toolUse.id) : undefined }))
    .find((entry) => entry.task?.status === 'running' && entry.task.startedAt > 0);
  const now = useNow(!!running);
  if (!running || !running.task) return undefined;
  return {
    // The name alone, in the moving light: "Ran agent" is for the line once the call is over. A workflow has no
    // description of its own to give, so it goes by the name its script gave it.
    label:
      (running.call.toolUse.name === 'Workflow' ? running.task.name : agentNameOf(running.call)) ||
      t('transcript.streaming.activity.agent'),
    elapsed: formatElapsed(Math.max(0, Math.floor((now - running.task.startedAt) / 1000))),
    mark: 'default',
  };
}

/**
 * The seconds the running turn has taken. Its own component, drawn only by the run that is the live one: the clock
 * ticks once a second, and a run that held it drew again every second for as long as the page was open, one clock
 * for each run on the screen (#680).
 */
function TurnElapsed() {
  const formatElapsed = useFormatElapsed();
  return <>{formatElapsed(useTurnSeconds())}</>;
}

/** One call: a line that opens to its details. */
/** What the CLI said about a workflow that was stopped or failed, with a way to the background tasks. */
function EndNote({ text, onOpen }: { text: string; onOpen: () => void }) {
  const { t } = useTranslation('chat');
  return (
    <div className="pb-[0.45rem] text-[0.8438rem] text-[var(--tr-muted)]" data-testid="end-note">
      <div className="line-clamp-3 whitespace-pre-wrap">{text}</div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-[0.45rem] rounded-[0.45rem] bg-surface-hover px-[0.675rem] py-[0.3376rem] text-[0.8438rem] text-[var(--tr-text)] transition-colors hover:bg-surface-pressed"
      >
        {t('transcript.tools.viewInBackgroundTasks')}
      </button>
    </div>
  );
}

function TranscriptToolRow({ calls, defaultOpen, inBox, live: turnLive, liveToolUseId }: { calls: ToolCall[]; defaultOpen: boolean; inBox: boolean; live?: { label: string; elapsed: ReactNode; mark: WorkingActivity }; liveToolUseId?: string }) {
  const { t } = useTranslation('chat');
  const call = calls[0];
  const runningAgentLive = useRunningAgentLive(calls);
  const liveNow = turnLive ?? runningAgentLive;
  // The words of what is running as they have settled: a description is written a few letters at a time (see useSettledText).
  const liveLabel = useSettledText(liveNow?.label ?? '');
  const live = liveNow ? { ...liveNow, label: liveLabel || liveNow.label } : liveNow;
  const [open, setOpen] = useState(defaultOpen);
  // A row already drawn follows the view it is drawn in: Verbose opens it, another view shuts it again.
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const running = !call.toolUse.tool_result && (call.message.isStreaming ?? false);
  // The call the turn is waiting on, drawn as a line inside an opened run: the light moves across its words, as it
  // does on the line over the run, so opening the run does not make the work look idle.
  const waitedOn = liveToolUseId !== undefined && calls.some((c) => c.toolUse.id === liveToolUseId);
  const path = pathOf(call);
  const workflowState = useOptionalWorkflowState();
  // A message to an agent by its id says the name the agent has, where the chat knows it.
  const baseLabel = rowLabel(call, t, (to) => workflowState?.tasks.find((task) => agentAddressOf(task) === to)?.name);
  // A background task that was launched fine and failed later (a command that exited with a code, an agent that
  // gave up) is marked failed on the call that started it, as the desktop app marks it. The call's own result only
  // says it was launched.
  const taskFailed = workflowState?.getByToolUseId(call.toolUse.id)?.status === 'failed';
  // An agent that was stopped never finished its run, so as in the desktop app its line still says it is running
  // ("Agent running x") and marks it stopped, where one that finished says "Ran agent x".
  const taskStopped = workflowState?.getByToolUseId(call.toolUse.id)?.status === 'stopped';
  const label = taskStopped && toolKindOf(call) === 'agent' ? { ...baseLabel, before: t('transcript.streaming.activity.agent') } : baseLabel;
  // An agent call opens to the card that leads to its run window. Where there is no window to lead to, there is
  // nothing to open, so the line does not fold open onto an empty space (#673).
  const agentWithoutWindow = !!workflowState && toolKindOf(call) === 'agent' && !openableAgentTask(workflowState, call);
  // A run that is over ("Ran agent x", "Ran workflow x") does not fold open: the name is the way into its window.
  const runTask =
    workflowState && (toolKindOf(call) === 'agent' || call.toolUse.name === 'Workflow') ? openableAgentTask(workflowState, call) : undefined;
  const overRun = runTask !== undefined && runTask.status !== 'running' && !!label.meta;
  // A workflow that was stopped or failed carries the CLI's own sentence about it once the notice has come: the line
  // opens to that sentence and a way to the background tasks, as in the desktop app.
  const endNote =
    call.toolUse.name === 'Workflow' && runTask && (runTask.status === 'stopped' || runTask.status === 'failed')
      ? (call.toolUse as { workflowNotification?: { summary?: string } }).workflowNotification?.summary?.trim() || undefined
      : undefined;
  const finishedRun = overRun && endNote === undefined;
  const expandable = (isExpandable(call) && !agentWithoutWindow && !finishedRun) || endNote !== undefined;
  const hasEndNote = endNote !== undefined;
  useEffect(() => {
    if (hasEndNote) setOpen(true);
  }, [hasEndNote]);
  const pictures = picturesOfCalls([call]);
  const [openPicture, thumbnailViewer] = useThumbnailViewer();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => expandable && setOpen((v) => !v)}
        className={`flex w-full items-center gap-[0.5624rem] ${inBox ? 'py-2.5 px-2.5' : 'pt-1 pb-1'} text-start leading-[0.9rem] text-[0.9375rem] transition-colors ${SUMMARY_TEXT} ${running && !waitedOn ? 'animate-pulse' : ''}`}
      >
        {live && <ActivityGlyph activity={live.mark} />}
        {/* One MorphText stays through what is running and what was done, as in the summary line over a group. */}
        <MorphText id={live ? `live:${live.label}` : `row:${JSON.stringify([label.before, label.fileName, label.after, label.emphasis])}`}>
          {live ? (
            <span className="transcript-shimmer">{live.label}</span>
          ) : (
            <span className={`${label.fileName ? 'flex min-w-0 items-baseline whitespace-nowrap' : 'whitespace-nowrap'}${waitedOn ? ' transcript-shimmer' : ''}`}>
              <span className={label.fileName ? 'me-[0.45rem] flex-shrink-0' : undefined}>{label.before}</span>
              {label.emphasis && <span className="text-[var(--tr-soft)]">{label.emphasis}</span>}
              {label.fileName && (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (path) void openChatFile(path);
                  }}
                  className={`${LINK_TEXT} min-w-0 cursor-pointer truncate transition-[filter] hover:brightness-[1.08]`}
                >
                  {label.fileName}
                </span>
              )}
              {label.after}
              {overRun && runTask ? (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    workflowState?.openRun(runTask.toolUseId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.stopPropagation();
                      workflowState?.openRun(runTask.toolUseId);
                    }
                  }}
                  data-testid="finished-run-link"
                  className={`ms-[0.45rem] min-w-0 cursor-pointer truncate ${LINK_TEXT} hover:underline`}
                >
                  {label.meta}
                </span>
              ) : (
                <RowMeta call={call} meta={label.meta} />
              )}
            </span>
          )}
        </MorphText>
        {live && live.elapsed && <span className="flex-shrink-0">{live.elapsed}</span>}
        {(hasFailed(call) || taskFailed) && toolKindOf(call) !== 'sessionStart' && <span className="flex-shrink-0 text-red-400">{t('transcript.tools.failedMark')}</span>}
        {(wasStopped(call) || taskStopped) && <span className="flex-shrink-0">{t('transcript.tools.stoppedMark')}</span>}
        <LineStatsView stats={sumLineStats(calls)} />
        {expandable && <Chevron open={open} />}
        {(!open && inBox) && <Thumbnails pictures={pictures} onOpen={openPicture} />}
      </button>
      {thumbnailViewer}
      {/* A call of its own that read a picture shows the picture under its line at its own size, as the desktop app does; in a run, the lines carry thumbnails and the picture is under the call once it is opened. */}
      {!inBox && pictures.length > 0 && <div className="pb-[0.45rem]"><ResultPictures call={call} /></div>}
      {open && expandable && (
        <div className={inBox ? (call.toolUse.name === 'Edit' || call.toolUse.name === 'Write' ? 'px-[0.75rem]' : 'px-[0.45rem]') : 'mt-3 mb-1'}>
          {endNote !== undefined && runTask ? (
            <EndNote text={endNote} onOpen={() => workflowState?.openPanel(runTask.toolUseId)} />
          ) : (
            <ToolDetail calls={calls} withPictures={inBox} />
          )}
        </div>
      )}
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
export function TranscriptToolRun({ calls: runCalls }: { calls: ToolCall[] }) {
  const calls = useMemo(() => withoutMessagingToolLoad(runCalls), [runCalls]);
  const { t } = useTranslation('chat');
  // The line over the group names the sessions its calls dealt with, as the rows under it do.
  const sessionTitles = useBacklinkedSessionTitles(useMemo(() => calls.map(sessionTargetOf), [calls]));
  const verbose = useTranscriptViewMode() === 'verbose';
  // The live run: the turn is running and the call it is waiting on is in this run. Its line then says what the
  // model is doing and for how long, as the working indicator, and its list stays shut unless the reader opens it.
  const live = useContext(LiveActivityContext);
  const active = live !== null && calls.some((call) => call.toolUse.id === live.toolUseId);
  // Shut unless the view is Verbose or the reader opened it: a run that is still going on is not opened for them,
  // and the line over it (the dots, what is running, the seconds) is what tells them it is working.
  // A run of file edits and new files is open from the start, while it goes on and after it ends: the desktop app
  // keeps the line for each file under the summary (measured on its recording of an edit to two files at once).
  const fileChanges = calls.every((call) => call.toolUse.name === 'Edit' || call.toolUse.name === 'Write');
  // While it goes on it is open; once it has ended it stays open when it is short and shuts when it is long (the desktop
  // app left an edit to two files open and shut the one that wrote twenty).
  const startsOpen = verbose || (fileChanges && (active || calls.length <= 3));
  const [open, setOpen] = useState(startsOpen);
  useEffect(() => setOpen(startsOpen), [startsOpen]);
  const toggle = () => setOpen((v) => !v);
  const label = useActivityLabel();
  const liveText = useSettledText(active && live ? label(live) : '');
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
      <div data-transcript-tool-run-single>
        <div className="text-[0.9375rem] text-[var(--tr-muted)]">{rowLabel(calls[0], t).before}</div>
        <PlainDetail call={calls[0]} />
      </div>
    );
  }

  if (calls.length === 1) {
    return (
      <div data-transcript-tool-run-single>
        <TranscriptToolRow
          calls={[calls[0]]}
          defaultOpen={verbose}
          inBox={false}
          live={active && live ? { label: label(live), elapsed: live.file ? '' : <TurnElapsed />, mark: live.mark } : undefined}
        />
      </div>
    );
  }

  const summaryParts = groupLabelParts(calls, t, (call) => sessionTitles.get(sessionTargetOf(call)));

  return (
    <div data-transcript-tool-run>
      {/* The line of a running call is set a little larger than the lines of finished ones: the desktop app draws "Running command 9s" at about 14.7px where its finished lines are 13.9px (measured by the width of the same words on its screen). */}
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={`flex w-full items-center gap-[0.225rem] pt-1 pb-1 text-start leading-[0.9rem] text-[0.9375rem] transition-colors ${SUMMARY_TEXT}`}
      >
        {/* One MorphText stays through the three states of the line (what is running, an agent that runs, what was done),
            so that the sentence is replaced the way the desktop app's is: crossed, and the line growing or shrinking. */}
        {active && live ? (
          <span className="me-[0.45rem] flex"><ActivityGlyph activity={live.mark} /></span>
        ) : runningAgentLive ? (
          <span className="me-[0.45rem] flex"><ActivityGlyph activity={runningAgentLive.mark} /></span>
        ) : null}
        {/* What was done has no seconds beside it as the running lines have, whose margin keeps the arrow off the text;
            the margin is given to it here so that the arrow does not sit against the last letter. */}
        <MorphText
          className={active && live || runningAgentLive ? '' : 'me-[0.3376rem]'}
          id={active && live ? `live:${liveText}` : runningAgentLive ? `agent:${runningAgentLive.label}` : `done:${JSON.stringify(summaryParts)}`}
        >
          {active && live ? (
            <span className="transcript-shimmer">{liveText}</span>
          ) : runningAgentLive ? (
            <span className="transcript-shimmer">{runningAgentLive.label}</span>
          ) : (
            <GroupSummaryText {...summaryParts} />
          )}
        </MorphText>
        {active && live ? (
          !live.file && <span className="ms-[0.45rem] me-[0.225rem] flex-shrink-0"><TurnElapsed /></span>
        ) : runningAgentLive ? (
          <span className="ms-[0.45rem] me-[0.225rem] flex-shrink-0">{runningAgentLive.elapsed}</span>
        ) : (
          <LineStatsView stats={sumLineStats(calls)} />
        )}
        <Chevron open={open} />
        {!open && <Thumbnails pictures={pictures} onOpen={openPicture} />}
      </button>
      {thumbnailViewer}
      {open && (
        <div className={`mt-3 mb-1 rounded-[0.45rem] border ${BOX_BORDER} divide-y divide-border-default/70 overflow-hidden`}>
          {groupIntoRows(calls).map((row) => (
            <TranscriptToolRow key={row[0].toolUse.id} calls={row} defaultOpen={verbose} inBox liveToolUseId={active ? live?.toolUseId : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
