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
  const { messages, isRunning, hasEarlier, loadingEarlier, onLoadEarlier, scroll, runFacts = [] } = props;
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

  // Once the agent is over, one line says what it did in all, in the words of the lines over its runs of calls.
  // Not while earlier pages are not loaded: the calls in them would not be counted, and a count that is too small is
  // worse than none.
  const ranSummary = useMemo(() => {
    if (viewMode === null || isRunning || hasEarlier) return null;
    const calls = buildSegments(messages).flatMap((segment) => (segment.kind === 'tools' ? segment.calls : []));
    return calls.length > 0 ? groupLabel(calls, t) : null;
  }, [viewMode, isRunning, hasEarlier, messages, t]);

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
    const sent = [...messages].reverse().find(isUserSend);
    const at = sent?.timestamp ? Date.parse(sent.timestamp) : NaN;
    return Number.isNaN(at) ? null : at;
  }, [messages]);
  const sections = useMemo(
    () =>
      viewMode === null
        ? []
        : groupIntoSendSections(messages.filter((message) => !isNoteForClaude(message)).map(withoutHarnessFrame)),
    [viewMode, messages],
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
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-4 py-3 space-y-3">
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
        {ranSummary && (
          <div className="px-4 pt-2 pb-3 text-[0.9375rem] text-[var(--tr-muted)]" data-transcript-ran-summary>
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
