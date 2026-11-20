import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useTranslation } from '@/i18n';
import { LoadedMessageDto } from '@/types';
import { isUserSend } from '@/pages/ChatPage/paging';
import { MessageBubble } from '@/pages/ChatPage/MessageBubble';
import { groupIntoSendSections } from '@/pages/ChatPage/groupIntoSendSections';
import { useTranscriptViewMode } from '@/pages/ChatPage/message-renderers/transcriptViewMode';
import { TranscriptUserMessage } from '@/pages/ChatPage/transcript/TranscriptUserMessage';
import { TranscriptBody } from '@/pages/ChatPage/transcript/TranscriptBody';
import { WorkingMark } from '@/pages/ChatPage/transcript/WorkingMark';
import { buildSegments } from '@/pages/ChatPage/transcript/buildSegments';
import { groupLabel } from '@/pages/ChatPage/transcript/toolSummary';
import { LiveActivityContext } from '@/pages/ChatPage/transcript/LiveActivityContext';
import { TurnClockContext } from '@/pages/ChatPage/transcript/TurnClockContext';
import { isSameActivity, runningActivity, type StreamingActivity } from '@/pages/ChatPage/transcript/streamingActivity';
import '@/pages/ChatPage/transcript/prose.css';
import '@/pages/ChatPage/streaming.css';
import { StreamingIndicator } from '@/pages/ChatPage/StreamingIndicator';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { shortModelName } from './AgentDetailHeader';

/**
 * A note the CLI slips in beside a turn for the model ("Your previous response had no visible output..."). It is in the
 * record as a user entry, marked `isMeta` and `turnCompanion`, but nobody sent it, so the transcript does not draw it.
 */
function isNoteForClaude(message: LoadedMessageDto): boolean {
  return message.isMeta === true && (message as { turnCompanion?: unknown }).turnCompanion === true;
}

/**
 * A workflow gives its agent the prompt inside a frame of its own: a heading line, a paragraph on who wrote the text
 * that follows, and the text itself indented two spaces. What the agent was asked is the text, so that is what the
 * Transcript view shows in the prompt's bubble (the frame is the harness's, and filled most of it).
 */
const HARNESS_FRAME = /^\[Workflow harness[^\]]*\][\s\S]*?(?:follows|wins):\n([\s\S]+)$/;

function unframedText(text: string): string | null {
  const match = HARNESS_FRAME.exec(text);
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^ {2}/, ''))
    .join('\n')
    .trim();
}

/** The message with its harness frame taken off, or the message itself when it has none. Drawn only, never stored. */
export function withoutHarnessFrame(message: LoadedMessageDto): LoadedMessageDto {
  if (message.type !== 'user' || !message.message) return message;
  const content = message.message.content as unknown;
  let next: unknown;
  if (typeof content === 'string') {
    const text = unframedText(content);
    if (text === null) return message;
    next = text;
  } else if (Array.isArray(content)) {
    let changed = false;
    next = content.map((block) => {
      const b = block as { type?: string; text?: unknown };
      if (b?.type !== 'text' || typeof b.text !== 'string') return block;
      const text = unframedText(b.text);
      if (text === null) return block;
      changed = true;
      return { ...b, text };
    });
    if (!changed) return message;
  } else {
    return message;
  }
  const copy = Object.assign(Object.create(Object.getPrototypeOf(message)), message) as LoadedMessageDto;
  copy.message = Object.assign(Object.create(Object.getPrototypeOf(message.message)), message.message, { content: next });
  return copy;
}

/**
 * What the CLI writes into an agent's record when a message is sent to it while it works: the message in a frame of the
 * harness's ("The coordinator sent a message while you were working: ... Address this before completing your current
 * task."), marked `isMeta`, since the model is the reader. The person did send the text inside it, so it is drawn as a
 * sent message with only that text.
 */
const COORDINATOR_FRAME =
  /^The coordinator sent a message while you were working:\n([\s\S]*?)\n*Address this before completing your current task\.\s*$/;

/** The message as one that was sent, with its frame off, or the message itself when it is not that. Drawn only, never stored. */
export function asSentMessage(message: LoadedMessageDto): LoadedMessageDto {
  if (message.type !== 'user' || message.isMeta !== true || !message.message) return message;
  const content = message.message.content as unknown;
  if (typeof content !== 'string') return message;
  const match = COORDINATOR_FRAME.exec(content);
  if (!match) return message;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(message)), message) as LoadedMessageDto;
  copy.isMeta = false;
  copy.message = Object.assign(Object.create(Object.getPrototypeOf(message.message)), message.message, {
    content: match[1].trim(),
  });
  return copy;
}

/**
 * The model the agent ran on, as its own record says it (the first reply carries the full id), written the way the
 * desktop app writes it under the prompt: "Haiku 5.5". Null until the agent has answered once.
 */
export function modelOfRecord(messages: LoadedMessageDto[]): string | null {
  for (const message of messages) {
    const model = message.type === 'assistant' ? message.message?.model : undefined;
    if (typeof model === 'string' && model !== '' && !model.startsWith('<')) {
      const short = shortModelName(model);
      return short.charAt(0).toUpperCase() + short.slice(1);
    }
  }
  return null;
}

/** What the scrolling area of an agent's record needs from `useAutoScroll`, which the body that owns the record calls. */
export interface AgentTranscriptScroll {
  scrollRef: RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

interface Props {
  /** The agent's own record, tool results already merged into their calls. */
  messages: LoadedMessageDto[];
  isRunning: boolean;
  /** Pages of the record before the first message are not loaded yet. */
  hasEarlier: boolean;
  /** The page asked for has not arrived. */
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  scroll: AgentTranscriptScroll;
  /** How the agent ran (tool calls, wait, tokens), said beside the model when there is something to say. */
  runFacts?: string[];
  /** Tighter sides, for the side panel: the same 0.5rem the title row has. */
  compact?: boolean;
  /** How the task ended, when it is over: what the note says when the record ends with no answer. */
  endStatus?: 'completed' | 'failed' | 'stopped';
}

/**
 * What the detail modal draws for one agent's record, whether it is a backgrounded Agent's or a workflow agent's:
 * the chat's classic bubbles when the chat is in its classic view, the Transcript view when it is in one of the
 * others (Normal, Thinking, Verbose), the way the desktop app draws an agent panel.
 *
 * The record is paged, newest page first (see the backend's conversationWindow.ts), so what is on top may not be the
 * start of the record: the button there asks for the page before it, and the lines the reader is looking at stay
 * where they are when it arrives.
 */
export function AgentTranscriptView(props: Props) {
  const { messages, isRunning, hasEarlier, loadingEarlier, onLoadEarlier, scroll, runFacts = [], endStatus } = props;
  const { scrollRef, showScrollButton, scrollToBottom } = scroll;
  const { t } = useTranslation('chat');
  // "Model" is the settings screen's word for it, which every language already has.
  const { t: tSettings } = useTranslation('settings');
  // The chat's view mode, which this follows: null is the classic chat, any other is the desktop app's Transcript view.
  const viewMode = useTranscriptViewMode();

  // The messages as the chat's find and click-to-log read them, by reference, so that a new page does not redraw them.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const model = useMemo(() => (viewMode === null ? null : modelOfRecord(messages)), [viewMode, messages]);
  // The record with each message that was sent to the agent while it worked as one that was sent, not the CLI's frame.
  const record = useMemo(() => messages.map(asSentMessage), [messages]);

  // Once the agent is over, one line says what it did in all, in the words of the lines over its runs of calls.
  // Not while earlier pages are not loaded: the calls in them would not be counted, and a count that is too small is
  // worse than none.
  const ranSummary = useMemo(() => {
    if (viewMode === null || isRunning || hasEarlier) return null;
    const calls = buildSegments(messages).flatMap((segment) => (segment.kind === 'tools' ? segment.calls : []));
    return calls.length > 0 ? groupLabel(calls, t) : null;
  }, [viewMode, isRunning, hasEarlier, messages, t]);

  // A task that is over with no answer at the end of its record (it was stopped mid-call, or died) says so, as the
  // desktop app does with "No result", rather than ending on the last call as if nothing were missing.
  const noResult = useMemo(() => {
    if (viewMode === null || isRunning || hasEarlier || !endStatus) return null;
    // The answer is the last thing the agent said since it was last spoken to: a notice that came in after it (an
    // entry that is not a message sent to it) does not hide it, a message sent to it that it never answered does.
    const sinceSend = [...record].reverse().find((m) => m.type === 'assistant' || isUserSend(m));
    const content = sinceSend?.type === 'assistant' ? (sinceSend.message?.content as unknown) : undefined;
    const blocks = Array.isArray(content) ? (content as { type?: string; text?: unknown }[]) : [];
    const tail = blocks[blocks.length - 1];
    const answered = typeof content === 'string' ? content.trim() !== '' : tail?.type === 'text' && typeof tail.text === 'string' && tail.text.trim() !== '';
    if (answered) return null;
    return endStatus === 'failed' ? 'failed' : endStatus === 'stopped' ? 'stopped' : 'ended';
  }, [viewMode, isRunning, hasEarlier, endStatus, record]);

  // The call the agent is waiting on, read from its own record as the chat reads it from its own, so that the run of
  // calls that holds it says what it is doing and for how long. The same object is kept while the call is the same.
  const liveRef = useRef<StreamingActivity | null>(null);
  const live = useMemo(() => {
    const next = viewMode !== null && isRunning ? runningActivity(messages) : null;
    if (!isSameActivity(next, liveRef.current)) liveRef.current = next;
    return liveRef.current;
  }, [viewMode, isRunning, messages]);
  // Its seconds count from the newest message it was sent (its prompt, or what resumed it), not from the chat's turn.
  const turnStartedAt = useMemo(() => {
    const sent = [...record].reverse().find(isUserSend);
    const at = sent?.timestamp ? Date.parse(sent.timestamp) : NaN;
    return Number.isNaN(at) ? null : at;
  }, [record]);
  const sections = useMemo(
    () =>
      viewMode === null
        ? []
        : groupIntoSendSections(record.filter((message) => !isNoteForClaude(message)).map(withoutHarnessFrame)),
    [viewMode, record],
  );

  // Asking for the page before: the height and position are kept, and once the page has arrived (the first message is
  // another one) the area is moved down by what was added on top, so the reader does not lose their place.
  const firstKey = messages[0]?.uuid ?? undefined;
  const beforeEarlier = useRef<{ firstKey: string | undefined; height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const kept = beforeEarlier.current;
    const area = scrollRef.current;
    if (!kept || !area || firstKey === kept.firstKey) return;
    area.scrollTop = kept.top + (area.scrollHeight - kept.height);
    beforeEarlier.current = null;
  }, [firstKey, scrollRef]);
  const loadEarlier = () => {
    const area = scrollRef.current;
    if (area) beforeEarlier.current = { firstKey, height: area.scrollHeight, top: area.scrollTop };
    onLoadEarlier();
  };

  return (
    <div className="relative flex-1 min-h-0">
      {/* absolute inset-0 rather than h-full: a percentage height inside a flex item sized by flex-grow does not
          reliably resolve. */}
      <div ref={scrollRef} className={`absolute inset-0 overflow-y-auto py-3 ${
          // The Transcript view's own lines carry their sides and their spacing, so the area adds neither; in the side
          // panel they keep the same px-4 sides as the modal.
          viewMode === null ? 'px-4 space-y-3' : ''
        }`}
      >
        {hasEarlier && (
          <div className="flex justify-center py-2">
            {loadingEarlier ? (
              <span className="inline-flex items-center gap-2 text-xs text-text-tertiary">
                <span className="w-3.5 h-3.5 border-2 border-border-default border-t-text-secondary rounded-full animate-spin" />
                {t('chatMessageArea.loadingEarlierMessages')}
              </span>
            ) : (
              <button
                type="button"
                onClick={loadEarlier}
                className="px-4 py-1.5 bg-surface-raised border border-border-default rounded-full text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-200 shadow-sm"
              >
                {t('chatMessageArea.loadOlderMessages')}
              </button>
            )}
          </div>
        )}
        {viewMode === null ? (
          messages.map((message) => (
            <MessageBubble key={message.uuid ?? `${message.type}-${message.timestamp}`} message={message} />
          ))
        ) : (
          <LiveActivityContext.Provider value={live}>
            <TurnClockContext.Provider value={turnStartedAt}>
              {sections.map((section, index) => (
                <div key={section.key}>
                  {section.head && <TranscriptUserMessage message={section.head} sectionKey={section.key} />}
                  {/* Under the prompt, quiet, as the desktop app says which model the agent runs on. */}
                  {index === 0 && model && (
                    <div className="px-4 pb-2 text-[0.875rem] text-[var(--tr-muted)]">
                      <div>
                        {tSettings('nav.model')} {model}
                      </div>
                      {/* How it ran, on a line of its own and lighter: the dots between the facts keep them apart. */}
                      {runFacts.length > 0 && <div className="opacity-60">{runFacts.join(' · ')}</div>}
                    </div>
                  )}
                  <TranscriptBody
                    body={section.body}
                    mergedMessagesRef={messagesRef}
                    turnRunning={isRunning && index === sections.length - 1}
                    sectionKey={section.key}
                  />
                </div>
              ))}
            </TurnClockContext.Provider>
          </LiveActivityContext.Provider>
        )}
        {noResult && (
          <div className="px-4 pb-3 text-[0.9375rem] text-[var(--tr-muted)]" data-transcript-no-result={noResult}>
            {t(`backgroundTasks.agentDetail.noResult.${noResult}`)}
          </div>
        )}
        {ranSummary && (
          <div className="px-4 pb-3 text-[0.9375rem] text-[var(--tr-muted)]" data-transcript-ran-summary>
            {ranSummary}
          </div>
        )}
        {/* Same cue the main chat shows below the latest bubble for the whole span of a turn — here, the whole span of
            the agent still running, regardless of whether its last parsed message already has text. */}
        {isRunning &&
          (viewMode === null ? (
            <StreamingIndicator />
          ) : live === null ? (
            // The desktop app's agent panel says "working" with the mark alone, with no words beside it.
            <div className="px-4 py-[1.0625rem]" role="status" data-transcript-streaming>
              <WorkingMark />
            </div>
          ) : null)}
      </div>

      {showScrollButton && (
        <ScrollToBottomButton onClick={scrollToBottom} placementClassName="bottom-3 start-1/2 -translate-x-1/2" />
      )}
    </div>
  );
}
