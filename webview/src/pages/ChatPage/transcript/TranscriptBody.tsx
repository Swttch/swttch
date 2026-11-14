import { Fragment, memo, useMemo, type ReactNode } from 'react';
import type { LoadedMessageDto } from '../../../types';
import {
  ContentBlockType,
  type AnyContentBlockDto,
  type ThinkingBlockDto,
} from '../../../dto/message/ContentBlockDto';
import { MessageBubble } from '../MessageBubble';
import { StreamingMessage } from '../StreamingMessage';
import { ToolRenderer } from '../message-renderers/ToolRenderer';
import { TranscriptReplyFooter } from './TranscriptReplyFooter';
import { TranscriptFileChanges } from './TranscriptFileChanges';
import { ContextUsageCard } from '../message-renderers/components/ContextUsageCard';
import { parseContextUsage } from '@/utils/parseContextUsage';
import { useSendActionsValue } from '../SendActionsContext';
import { APP_EVENT_TOOL, buildSegments, PEER_MESSAGE_TOOL, type Segment } from './buildSegments';
import { TranscriptToolRun } from './TranscriptToolRun';
import { CliNotice, CompactDivider } from './CompactNotices';
import { PlanBox } from '../message-renderers/ToolRenderers/Mcp/CcdTurn';
import { planOfTurn } from '../message-renderers/ToolRenderers/Mcp/CcdTurn/planState';
import { isCliNotice, isCompactBoundary, isCompactSummaryEntry } from './compact';

/** The text and thinking of an assistant entry that also called tools, around where the calls are gathered. */
/**
 * `showFooter` is true only for the text the turn ends on. The copy / time row is invisible until the pointer is on
 * it, but an invisible row still takes its height, so one under every paragraph pushes each summary line away from
 * the text above it and leaves it close to the text below. The desktop app has the row only where the turn ends.
 */
function TranscriptBlocks({
  message,
  blocks,
  showFooter,
  summary,
}: {
  message: LoadedMessageDto;
  blocks: AnyContentBlockDto[];
  showFooter: boolean;
  /** What closes the turn, drawn between the text and the footer: the desktop app has its copy / fork row under it. */
  summary?: ReactNode;
}) {
  const sendActions = useSendActionsValue();
  const streaming = message.isStreaming ?? false;

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === ContentBlockType.Thinking) {
          const thinking = block as ThinkingBlockDto;
          // The desktop app does not fold thinking behind a label: what Claude thought is text in the
          // transcript, a shade quieter than the reply. A block with no text yet draws nothing: the breathing dots
          // at the end of the transcript already say "Thinking", and a second line saying it again is one too many.
          if (!thinking.thinking) return null;
          return (
            <StreamingMessage
              key={`${message.uuid}-thinking-${index}`}
              plain
              content={thinking.thinking}
              isStreaming={streaming}
              className="text-[var(--tr-text)] text-[1.02rem] leading-[1.3]"
              message={message}
            />
          );
        }
        if (block.type === ContentBlockType.Text) {
          const text = block.text;
          // `/context` reports arrive as markdown; once streamed they are drawn as the usage grid, as in the classic chat.
          const contextUsage = streaming ? null : parseContextUsage(text);
          if (contextUsage) {
            return <ContextUsageCard key={`${message.uuid}-context-${index}`} data={contextUsage} rawMarkdown={text} />;
          }
          return (
            <StreamingMessage
              key={`${message.uuid}-text-${index}`}
              plain
              content={text}
              isStreaming={streaming}
              className="text-[var(--tr-text)] text-[1.02rem] leading-[1.3]"
              message={message}
              footer={
                streaming || !showFooter ? undefined : (
                  <>
                    {summary}
                    <TranscriptReplyFooter
                      className="mt-1.5"
                      copyText={text}
                      readAloudKey={message.uuid ? `${message.uuid}:${index}` : undefined}
                      timestamp={message.timestamp}
                      onFork={sendActions && message.uuid && sendActions.canForkReply(message.uuid) ? () => sendActions.forkAtReply(message.uuid as string) : undefined}
                    />
                  </>
                )
              }
            />
          );
        }
        return null;
      })}
    </>
  );
}

function SegmentView({ segment, endsTurn, onRetry, summary }: { segment: Segment; endsTurn: boolean; onRetry?: (messageId: string) => void; summary?: ReactNode }) {
  switch (segment.kind) {
    case 'message':
      // What a compaction leaves in the record is drawn as the desktop app draws it: a line where it happened, the
      // CLI's notice about it as a line that opens, and nothing for the summary written for the model.
      if (isCompactBoundary(segment.message)) return <CompactDivider message={segment.message} />;
      if (isCliNotice(segment.message)) return <CliNotice message={segment.message} />;
      if (isCompactSummaryEntry(segment.message)) return null;
      return <MessageBubble message={segment.message} onRetry={onRetry} />;
    case 'blocks':
      return (
        <div className="group transcript-prose px-4 [&_.markdown-content_p:first-child]:mt-0">
          <TranscriptBlocks message={segment.message} blocks={segment.blocks} showFooter={endsTurn} summary={summary} />
        </div>
      );
    case 'tools':
      return <TranscriptToolRun calls={segment.calls} />;
    case 'card':
      return (
        <div data-transcript-card className="px-4">
          <ToolRenderer toolUse={segment.call.toolUse} message={segment.call.message} />
        </div>
      );
    case 'chapter':
      return <h3 className="px-4 pb-[29px] pt-3 text-[1rem] font-semibold leading-relaxed text-[var(--tr-text)]">{segment.title}</h3>;
  }
}

/** Where a click on a segment finds the entry behind it, for the console line the chat prints. */
function entryOf(segment: Segment): LoadedMessageDto {
  switch (segment.kind) {
    case 'message':
    case 'blocks':
    case 'chapter':
      return segment.message;
    case 'tools':
      return segment.calls[0].message;
    case 'card':
      return segment.call.message;
  }
}

/**
 * The turn's checklist, one box that stands after everything the turn has drawn so far, and moves down with it, as
 * the desktop app keeps it: under the last message, and above the line saying what is being done right now. It is
 * drawn at the same inset as the reply's text and the lines of calls, so the three stand in one column.
 *
 * It is there while the turn is running and goes when the turn is over, with or without a card after it: the desktop
 * app's finished turn is its last message and the summary line of what it did, with no checklist under them.
 */
function TranscriptPlan({ body, running }: { body: LoadedMessageDto[]; running: boolean }) {
  const plan = useMemo(() => planOfTurn(body), [body]);
  if (!running || plan.length === 0) return null;
  return (
    <div className="px-4 py-2" data-transcript-plan>
      <PlanBox plan={plan} running />
    </div>
  );
}

interface Props {
  body: LoadedMessageDto[];
  mergedMessages: LoadedMessageDto[];
  onRetry?: (messageId: string) => void;
  /** The model is still working on this reply, so no text in it ends the turn yet. */
  turnRunning?: boolean;
  /** The send this reply answers: the turn's file summary offers to undo what the turn changed through it. */
  sectionKey?: string | null;
}

/** One send's reply, drawn as the transcript's segments: text, gathered tool calls, cards. */
export const TranscriptBody = memo(function TranscriptBody({ body, mergedMessages, onRetry, turnRunning = false, sectionKey = null }: Props) {
  const segments = useMemo(() => buildSegments(body), [body]);
  // The copy / fork / time line is under the text a turn ends on, and only there. A turn is what the model does
  // from the moment someone else speaks (the user, another session, the app) to the moment it is done, with any
  // number of calls and messages between. So it is the last text before the next one speaks, or before the end.
  const turnEnds = useMemo(() => {
    const ends = new Set<string>();
    segments.forEach((segment, index) => {
      if (segment.kind !== 'blocks') return;
      let next = index + 1;
      while (next < segments.length && segments[next].kind === 'message') next += 1;
      const following = segments[next];
      const someoneSpeaks =
        following?.kind === 'tools' && [PEER_MESSAGE_TOOL, APP_EVENT_TOOL].includes(following.calls[0].toolUse.name);
      if ((!following && !turnRunning) || someoneSpeaks) ends.add(segment.key);
    });
    return ends;
  }, [segments, turnRunning]);

  // While the turn is running and its last segment is a run of calls, that run is the line saying what is being
  // done now (see TranscriptToolRun). The plan stands above it; otherwise it stands at the very end.
  const planBefore = turnRunning && segments.length > 0 && segments[segments.length - 1].kind === 'tools' ? segments[segments.length - 1].key : null;
  const plan = <TranscriptPlan body={body} running={turnRunning} />;

  return (
    <>
      {segments.map((segment) => (
        <Fragment key={segment.key}>
          {segment.key === planBefore && plan}
        <div
          // What kind of segment this is, for prose.css: some entries draw nothing and leave an empty
          // wrapper, so "the first thing under the bubble" cannot be read off the position in this list.
          data-seg={segment.kind}
          onClick={() => {
            const entry = entryOf(segment);
            console.log(entry, mergedMessages.indexOf(entry), mergedMessages); // NEVER REMOVE THIS LINE
          }}
        >
          <SegmentView segment={segment} endsTurn={turnEnds.has(segment.key)} onRetry={onRetry} summary={<TranscriptFileChanges body={body} sectionKey={sectionKey} hidden={turnRunning} />} />
        </div>
        </Fragment>
      ))}
      {planBefore === null && plan}
    </>
  );
});
