import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronRightIcon, ClipboardDocumentIcon } from '@heroicons/react/20/solid';
import { getAdapter } from '@/adapters';
import { ClientEnv } from '@/shared';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '../../../types';
import { ToolRenderer } from '../message-renderers/ToolRenderer';
import { toolResultText } from '../message-renderers/ToolRenderers/common/toolStatus';
import { HighlightedCode } from '../message-renderers/ToolRenderers/Mcp/Generic/HighlightedCode';
import { useTranscriptViewMode } from '../message-renderers/transcriptViewMode';
import { APP_EVENT_TOOL, type ToolCall } from './buildSegments';
import { FileChangeDetail } from './FileChangeDetail';
import { useDesktopSession } from '@/hooks/useDesktopSession';
import { DesktopSessionLink } from '../message-renderers/components/DesktopSessionLink';
import { StreamingMessage } from '../StreamingMessage';
import { parseSessionDelivery } from '../message-renderers/ToolRenderers/SendMessageRenderer';
import './prose.css';
import { SessionGalleryViewer } from '@/components/SessionGalleryViewer';
import { stripImageNotes } from '../message-renderers/ToolRenderers/Mcp/Generic/formatMcpPayload';
import { toolResultPictureKeys } from '../message-renderers/ToolRenderers/common/toolResultImages';
import {
  browserToolOf,
  groupIntoRows,
  groupLabel,
  hasFailed,
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
const SUMMARY_TEXT = 'text-[#9c9c9c] hover:text-[#d4d4d4]';

/** The reply's own light grey, for the name of a file in a row: it stands out from the grey around it. */
const LINK_TEXT = 'text-[#efefef]';

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
      className={`w-4 h-4 flex-shrink-0 transition-transform rtl:-scale-x-100 ${open ? 'rotate-90 rtl:-rotate-90' : ''}`}
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
  return <div className="px-1 pb-3 text-[0.9375rem] text-[#9c9c9c]">{t('transcript.tools.noOutput')}</div>;
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
      className="absolute end-2 top-2 rounded p-1 text-[#9c9c9c] hover:text-[#efefef] hover:bg-surface-hover"
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
        <pre className="mt-2 whitespace-pre-wrap break-words text-[#9c9c9c] max-h-[24rem] overflow-y-auto">{rest}</pre>
      )}
    </div>
  );
}

/** A box titled with the tool's name, around code and what it printed. */
function CodeBox({ title, code, language, output }: { title: string; code: string; language: string; output: string }) {
  return (
    <div className={`relative mb-2 rounded-lg border ${BOX_BORDER} overflow-hidden`} data-transcript-code-box>
      <div className="px-3 pt-2 pb-1 text-[0.8461rem] text-[#9c9c9c]">{title}</div>
      <CopyButton text={code} />
      <pre className="mx-2 mb-2 max-h-[16rem] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-hover px-3 py-2 font-mono text-[0.8461rem] leading-[1.5] text-[#efefef]">
        {language === 'bash' && <span className="text-[#9c9c9c] select-none">$ </span>}
        <HighlightedCode text={code} language={language} />
      </pre>
      <OutputText output={output} />
    </div>
  );
}

/**
 * The pictures behind a line, as small thumbnails at its end, one for each. They are shown only while the line is
 * shut: once it is open the pictures themselves are under it.
 */
function Thumbnails({ srcs }: { srcs: string[] }) {
  if (srcs.length === 0) return null;
  return (
    <span className="ms-auto flex flex-shrink-0 items-center gap-1.5">
      {srcs.map((src, index) => (
        <img key={index} src={src} alt="" className="h-7 w-[22px] rounded-[3px] border border-border-default/70 object-cover" />
      ))}
    </span>
  );
}

/**
 * What a browser call shows once it is opened: what it printed, as plain text, and the picture it returned.
 * A click or a screenshot has no code to show, so there is no box, only its result.
 */
function PlainDetail({ call }: { call: ToolCall }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const result = call.toolUse.tool_result as LoadedMessageDto | undefined;
  const images = imagesOfResult(result);
  // The note that says where a picture was saved ("[Image: source: …]") is never shown, whether or not the picture itself came with the result.
  // The text parts are joined without a break, so the note can sit at the front of a line of text; it is cut out wherever it is.
  const text = toolKindOf(call) === 'capture' ? '' : stripImageNotes(toolResultText(result).replace(/\[Image: source: [^\]]*\]/g, '\n')).trim();
  return (
    <div className="px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[#9c9c9c]">
      {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
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
    </div>
  );
}

/** Text that is written in markdown (a message from another session, one sent to it), in the quiet grey of a detail. */
function MarkdownDetail({ text, message }: { text: string; message: LoadedMessageDto }) {
  return (
    <div className="transcript-prose px-1 pb-3">
      <StreamingMessage plain content={text} isStreaming={false} className="text-[0.9375rem] leading-[1.5] text-[#c4c4c4]" message={message} />
    </div>
  );
}

/** A label in the quiet grey and the value beside it. */
function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-6 py-0.5">
      <span className="w-[4.5rem] flex-shrink-0 text-[#9c9c9c]">{label}</span>
      <span className="min-w-0 break-words text-[#efefef]">{value}</span>
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
      <div className="pb-1 text-[#9c9c9c]">{t('transcript.tools.inputHeading')}</div>
      {entries.map(([key, value]) => (
        <div key={key} className="pb-1.5">
          <div className="text-[0.8461rem] text-[#9c9c9c]">{key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ').replace(/\b(id)\b/g, 'ID')}</div>
          <div className="break-words text-[#efefef]">{typeof value === 'string' ? value : JSON.stringify(value)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * What a call was given, and what it printed: "Input" with its entries, a rule, and "Output" with the text that came
 * back. How the desktop app draws a skill that was started. The output is left out until there is one.
 */
function InputOutputDetail({ call }: { call: ToolCall }) {
  const { t } = useTranslation('chat');
  const output = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined).trim();
  return (
    <>
      <InputDetail call={call} />
      {output && (
        <div className={`mx-1 mb-3 border-t ${BOX_BORDER} pt-3 text-[0.9375rem] leading-[1.5]`}>
          <div className="pb-1 text-[#9c9c9c]">{t('transcript.tools.outputHeading')}</div>
          <div className="whitespace-pre-wrap break-words text-[#9c9c9c]">{output}</div>
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
      {delivery && <div className="pb-2 text-[0.9375rem] text-[#9c9c9c]">{delivery === 'delivered' ? t('sendMessage.delivered') : delivery}</div>}
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
      <div className="flex gap-4 px-2 py-2 text-[#9c9c9c]">
        <span className="w-[6rem] flex-shrink-0">{t('transcript.tools.factField')}</span>
        <span>{t('transcript.tools.factValue')}</span>
      </div>
      {rows
        .filter((row): row is [string, string] => row[1] !== undefined)
        .map(([label, value]) => (
          <div key={label} className={`flex gap-4 border-t ${BOX_BORDER} px-2 py-3`}>
            <span className="w-[6rem] flex-shrink-0 text-[#efefef]">{label}</span>
            <span className="min-w-0 break-words text-[#efefef]">{value}</span>
          </div>
        ))}
    </div>
  );
}

/** What a row shows once it is opened. */
function ToolDetail({ calls }: { calls: ToolCall[] }) {
  const call = calls[0];
  const kind = toolKindOf(call);
  // The CLI answers a command that printed nothing with a sentence saying so; the desktop app shows its own line for it.
  const printed = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
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
    return <div className="whitespace-pre-wrap break-words px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[#9c9c9c]">{output}</div>;
  }
  if (kind === 'sessionArchive' &&typeof call.toolUse.input?.reason === 'string' && call.toolUse.input.reason) {
    // What archiving a session shows is the reason it was archived for, in the quiet grey, and nothing of what the call returned.
    return <div className="whitespace-pre-wrap break-words px-1 pb-3 text-[0.9375rem] leading-[1.5] text-[#9c9c9c]">{call.toolUse.input.reason as string}</div>;
  }
  if (kind === 'sessionLookup') return <SessionFactsDetail call={call} />;
  if (kind === 'sessionRename') return <RenameDetail call={call} />;
  if (kind === 'toolLoad') return <InputDetail call={call} />;
  if (kind === 'skill' || kind === 'sessionRead') return <InputOutputDetail call={call} />;
  if (kind === 'messageSent') return <SentMessageDetail call={call} />;
  if (call.toolUse.name === 'Edit' || call.toolUse.name === 'Write') return <FileChangeDetail calls={calls} />;
  if (browserToolOf(call.toolUse.name) !== '') return <PlainDetail call={call} />;
  // The other kinds keep the card the classic chat draws for them: their details are not a command and its output.
  return <ToolRenderer toolUse={call.toolUse} message={call.message} />;
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
  const startedId = /session_id:\s*(local_[\w-]+)/.exec(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined))?.[1] ?? '';
  const session = useDesktopSession(startedId, startedId !== '');
  const awaiting = session?.awaitingPerson === true;
  const sessionId = session?.cliSessionId;
  const href = sessionId ? `${window.location.origin}/sessions/${sessionId}${session?.cwd ? `?workingDir=${encodeURIComponent(session.cwd)}` : ''}` : undefined;
  // The card is a way into the session it names: in a browser a link that opens it in a new tab, in the IDE the adapter opens it.
  const goTo = (event: React.MouseEvent) => {
    if (!sessionId) return;
    const adapter = getAdapter();
    if (adapter.type === ClientEnv.BROWSER) return;
    event.preventDefault();
    adapter.openSession(sessionId, session?.cwd).catch(() => toast.error(t('transcript.tools.openSessionFailed')));
  };
  return (
    <div className="px-4 py-[11px]" data-transcript-started-session>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={goTo}
        className={`flex w-full items-center gap-2 rounded-lg border ${BOX_BORDER} px-3.5 py-[13px] text-start text-[0.9375rem] text-[#efefef] hover:bg-[#2b2b2b] ${href ? 'cursor-pointer' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {awaiting && <span className="flex-shrink-0 text-[0.8461rem] text-[#d99a2b]">{t('transcript.tools.needsInput')}</span>}
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-[#9c9c9c] rtl:-scale-x-100" />
      </a>
    </div>
  );
}

/** The request for a report under the message it asks about: shut, except in Verbose, which opens every call. */
function NestedRequestRow({ call }: { call: ToolCall }) {
  const verbose = useTranscriptViewMode() === 'verbose';
  return <TranscriptToolRow calls={[call]} defaultOpen={verbose} inBox={false} />;
}

/** One call: a line that opens to its details. */
function TranscriptToolRow({ calls, defaultOpen, inBox }: { calls: ToolCall[]; defaultOpen: boolean; inBox: boolean }) {
  const { t } = useTranslation('chat');
  const call = calls[0];
  const [open, setOpen] = useState(defaultOpen);
  // A row already drawn follows the view it is drawn in: Verbose opens it, another view shuts it again.
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const running = !call.toolUse.tool_result && (call.message.isStreaming ?? false);
  const label = rowLabel(call, t);
  const path = pathOf(call);
  const expandable = isExpandable(call);
  const pictures = imagesOfResult(call.toolUse.tool_result as LoadedMessageDto | undefined);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => expandable && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 ${inBox ? 'px-3' : ''} py-[10px] text-start text-[0.9375rem] transition-colors ${SUMMARY_TEXT} ${running ? 'animate-pulse' : ''}`}
      >
        <span className="min-w-0 truncate">
          {label.before}
          {label.fileName && (
            <span
              role="link"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (path) getAdapter().openFile(path);
              }}
              className={`${LINK_TEXT} cursor-pointer hover:underline`}
            >
              {label.fileName}
            </span>
          )}
          {label.after}
          <RowMeta call={call} meta={label.meta} />
        </span>
        {hasFailed(call) && toolKindOf(call) !== 'sessionStart' && <span className="flex-shrink-0 text-red-400">{t('transcript.tools.failedMark')}</span>}
        <LineStatsView stats={sumLineStats(calls)} />
        {expandable && <Chevron open={open} />}
        {!open && <Thumbnails srcs={pictures} />}
      </button>
      {open && expandable && <div className={inBox ? 'px-2' : ''}><ToolDetail calls={calls} /></div>}
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
  const [open, setOpen] = useState(verbose);
  // Switching the view while the run is on screen opens or shuts it as well, not only runs drawn after the switch.
  useEffect(() => setOpen(verbose), [verbose]);
  const pictures = calls.flatMap((call) => imagesOfResult(call.toolUse.tool_result as LoadedMessageDto | undefined));

  if (calls.length === 1 && toolKindOf(calls[0]) === 'sessionStart' && !hasFailed(calls[0])) {
    return <StartedSessionCard call={calls[0]} />;
  }

  if (calls.length === 1 && toolKindOf(calls[0]) === 'capture') {
    // A capture on its own is shown open, as the desktop app shows it: its line has nothing to fold and no thumbnail,
    // since the picture itself is right under it.
    return (
      <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run-single>
        <div className="py-[10px] text-[0.9375rem] text-[#9c9c9c]">{rowLabel(calls[0], t).before}</div>
        <PlainDetail call={calls[0]} />
      </div>
    );
  }

  if (calls.length === 1) {
    return (
      <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run-single>
        <TranscriptToolRow calls={[calls[0]]} defaultOpen={verbose} inBox={false} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-[11px]" data-transcript-tool-run>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-1 py-2 text-start text-[0.9375rem] transition-colors ${SUMMARY_TEXT}`}
      >
        <span>{groupLabel(calls, t)}</span>
        <LineStatsView stats={sumLineStats(calls)} />
        <Chevron open={open} />
        {!open && <Thumbnails srcs={pictures} />}
      </button>
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
